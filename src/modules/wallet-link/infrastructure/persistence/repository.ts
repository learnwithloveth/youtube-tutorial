import 'server-only';

import { and, count, desc, eq, isNull, lt, or } from 'drizzle-orm';
import { randomBytes, randomUUID } from 'node:crypto';

import type { Database } from '@/platform/db/client';
import type { UserId } from '@/shared/kernel/ids';

import type { EvidenceContentType } from '../../domain/evidence';
import { LinkChallenge } from '../../domain/link-challenge';
import { LinkedWallet } from '../../domain/linked-wallet';
import type {
  EvidenceStorage,
  LinkChallengeRepository,
  LinkedWalletRepository,
  WalletLinkSettingsRepository,
} from '../../application/ports';
import {
  linkChallenges,
  linkedWallets,
  walletEvidence,
  walletLinkSettings,
  type LinkChallengeRow,
  type LinkedWalletRow,
} from './schema';

export class DrizzleLinkedWalletRepository implements LinkedWalletRepository {
  constructor(private readonly db: Database) {}

  async save(wallet: LinkedWallet): Promise<void> {
    const snapshot = wallet.snapshot();

    /*
     * Upsert on (user_id, address), not on the id.
     *
     * The unique index is on the pair, so that is the constraint a concurrent
     * insert collides with. Targeting the primary key instead would let two
     * requests that both generated a fresh id for the same address race past the
     * conflict clause and fail on the index — a 500 where the right answer is
     * "that wallet is already connected".
     */
    await this.db
      .insert(linkedWallets)
      .values({
        id: snapshot.id,
        userId: snapshot.userId,
        address: snapshot.address,
        chainId: snapshot.chainId,
        status: snapshot.status,
        connector: snapshot.connector,
        label: snapshot.label,
        linkedAt: snapshot.linkedAt,
        verifiedAt: snapshot.verifiedAt,
        lastSeenAt: snapshot.lastSeenAt,
        revokedAt: snapshot.revokedAt,
        evidenceId: snapshot.evidenceId,
        evidenceAt: snapshot.evidenceAt,
      })
      .onConflictDoUpdate({
        target: [linkedWallets.userId, linkedWallets.address],
        set: {
          chainId: snapshot.chainId,
          status: snapshot.status,
          connector: snapshot.connector,
          label: snapshot.label,
          /*
           * `linkedAt` is in the update set, and has to be.
           *
           * A watch-only row that a signature upgrades gets a new one: the date
           * that matters on a verified row is when control was proved, and
           * leaving the old value would date the proof to the day somebody
           * bookmarked the address. A row being *refreshed* carries its original
           * value through, because the aggregate was restored from it.
           */
          linkedAt: snapshot.linkedAt,
          verifiedAt: snapshot.verifiedAt,
          lastSeenAt: snapshot.lastSeenAt,
          revokedAt: snapshot.revokedAt,
          evidenceId: snapshot.evidenceId,
          evidenceAt: snapshot.evidenceAt,
        },
      });
  }

  async find(id: string, userId: UserId): Promise<LinkedWallet | null> {
    // The account is in the WHERE clause rather than checked after the read. A
    // row id is the one value that arrives from the browser, so it is never
    // sufficient on its own to name a row.
    const [row] = await this.db
      .select()
      .from(linkedWallets)
      .where(and(eq(linkedWallets.id, id), eq(linkedWallets.userId, userId)))
      .limit(1);
    return row === undefined ? null : toWallet(row);
  }

  async findByAddress(userId: UserId, address: string): Promise<LinkedWallet | null> {
    const [row] = await this.db
      .select()
      .from(linkedWallets)
      .where(
        and(
          eq(linkedWallets.userId, userId),
          // The column holds the lowercase form, and `EvmAddress` only ever
          // produces one, so this is an index scan rather than a `lower()` on
          // every row.
          eq(linkedWallets.address, address.toLowerCase()),
        ),
      )
      .limit(1);
    return row === undefined ? null : toWallet(row);
  }

  async listForUser(userId: UserId): Promise<LinkedWallet[]> {
    const rows = await this.db
      .select()
      .from(linkedWallets)
      .where(eq(linkedWallets.userId, userId))
      .orderBy(desc(linkedWallets.lastSeenAt));
    return rows.map(toWallet);
  }

  async findByEvidenceId(evidenceId: string): Promise<LinkedWallet | null> {
    const [row] = await this.db
      .select()
      .from(linkedWallets)
      .where(eq(linkedWallets.evidenceId, evidenceId))
      .limit(1);
    return row === undefined ? null : toWallet(row);
  }

  async countActiveForUser(userId: UserId): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(linkedWallets)
      .where(and(eq(linkedWallets.userId, userId), isNull(linkedWallets.revokedAt)));
    return row?.total ?? 0;
  }
}

export class DrizzleLinkChallengeRepository implements LinkChallengeRepository {
  constructor(private readonly db: Database) {}

  /**
   * 32 bytes of CSPRNG output.
   *
   * Not a UUID: a v4 UUID carries 122 bits and encodes six of them as version and
   * variant markers, and this value's only job is to be unguessable. 256 bits from
   * `randomBytes` is the cheap, unambiguous version of that.
   */
  nextNonce(): string {
    return randomBytes(32).toString('hex');
  }

  async issue(challenge: LinkChallenge): Promise<void> {
    const snapshot = challenge.snapshot();
    await this.db.insert(linkChallenges).values({
      nonce: snapshot.nonce,
      userId: snapshot.userId,
      address: snapshot.address,
      chainId: snapshot.chainId,
      domain: snapshot.domain,
      uri: snapshot.uri,
      issuedAt: snapshot.issuedAt,
      expiresAt: snapshot.expiresAt,
      consumedAt: snapshot.consumedAt,
    });
  }

  /**
   * Spends the nonce and hands back what it was issued for.
   *
   * ── One statement, and that is the whole guarantee ────────────────────────────
   * `UPDATE … WHERE nonce = $1 AND consumed_at IS NULL … RETURNING *` is atomic:
   * of two requests submitting the same signature, exactly one matches a row and
   * the other matches none. A `SELECT` followed by an `UPDATE` would let both see
   * an unspent challenge, and a single-use nonce that can be used twice is not a
   * single-use nonce.
   *
   * Expiry is *not* in this predicate. An expired challenge should still be spent
   * — consuming it closes the row — and the use case above reports the expiry as
   * its own error, which is more useful to the customer than "already used".
   */
  async consume(nonce: string, at: Date): Promise<LinkChallenge | null> {
    const [row] = await this.db
      .update(linkChallenges)
      .set({ consumedAt: at })
      .where(and(eq(linkChallenges.nonce, nonce), isNull(linkChallenges.consumedAt)))
      .returning();

    return row === undefined ? null : toChallenge(row);
  }

  async sweep(before: Date): Promise<number> {
    // Expired, or spent and no longer needed for anything. Both are rows carrying
    // an account id and an address past the minutes they were justified by.
    const removed = await this.db
      .delete(linkChallenges)
      .where(
        or(lt(linkChallenges.expiresAt, before), lt(linkChallenges.consumedAt, before)),
      )
      .returning({ nonce: linkChallenges.nonce });
    return removed.length;
  }
}

/**
 * The per-account opt-in.
 *
 * A row's existence is the setting, so `enable` is an upsert that does nothing on
 * conflict and `disable` is a delete. Both are idempotent, which matters because
 * this is behind a switch somebody may click twice.
 */
export class DrizzleWalletLinkSettingsRepository implements WalletLinkSettingsRepository {
  constructor(private readonly db: Database) {}

  async isEnabled(userId: UserId): Promise<boolean> {
    const [row] = await this.db
      .select({ userId: walletLinkSettings.userId })
      .from(walletLinkSettings)
      .where(eq(walletLinkSettings.userId, userId))
      .limit(1);
    return row !== undefined;
  }

  async enable(userId: UserId, at: Date): Promise<void> {
    // `doNothing`, not an update: the timestamp records when the account first
    // turned it on, and a second click is not a second decision.
    await this.db
      .insert(walletLinkSettings)
      .values({ userId, enabledAt: at })
      .onConflictDoNothing({ target: walletLinkSettings.userId });
  }

  async disable(userId: UserId): Promise<void> {
    await this.db.delete(walletLinkSettings).where(eq(walletLinkSettings.userId, userId));
  }
}

/**
 * Attached screenshots, in Postgres for now.
 *
 * Deliberately the dumbest possible adapter: it stores bytes it is given and
 * returns a random key. Every decision about *whether* those bytes are acceptable
 * was made before this was called, by `inspectEvidence` in the domain — an adapter
 * that re-checked would be a second copy of a rule, and a second copy is how one
 * of them ends up laxer than the other.
 */
export class PostgresEvidenceStorage implements EvidenceStorage {
  constructor(private readonly db: Database) {}

  async put(bytes: Uint8Array, contentType: EvidenceContentType, address: string, userId: UserId): Promise<string> {
    // Random, never derived from the upload. A customer-supplied filename in a
    // storage key is a path traversal waiting for the adapter that writes to a
    // filesystem — the same note `PostgresProofStorage` carries.
    const id = randomUUID();

    await this.db.insert(walletEvidence).values({
      id,
      contentType,
      userId,
      additionalInfo: address,
      metadata: address,
      bytes,
      byteLength: bytes.byteLength,
    });

    return id;
  }

  async get(
    evidenceId: string,
  ): Promise<{ bytes: Uint8Array; contentType: EvidenceContentType } | null> {
    const [row] = await this.db
      .select()
      .from(walletEvidence)
      .where(eq(walletEvidence.id, evidenceId))
      .limit(1);

    return row === undefined ? null : { bytes: row.bytes, contentType: row.contentType };
  }

  async remove(evidenceId: string): Promise<void> {
    await this.db.delete(walletEvidence).where(eq(walletEvidence.id, evidenceId));
  }
}

function toWallet(row: LinkedWalletRow): LinkedWallet {
  return LinkedWallet.restore({
    id: row.id,
    userId: row.userId as UserId,
    address: row.address,
    chainId: row.chainId,
    status: row.status,
    connector: row.connector,
    label: row.label,
    linkedAt: row.linkedAt,
    verifiedAt: row.verifiedAt,
    lastSeenAt: row.lastSeenAt,
    revokedAt: row.revokedAt,
    evidenceId: row.evidenceId,
    evidenceAt: row.evidenceAt,
  });
}

function toChallenge(row: LinkChallengeRow): LinkChallenge {
  return LinkChallenge.restore({
    nonce: row.nonce,
    userId: row.userId as UserId,
    address: row.address,
    chainId: row.chainId,
    domain: row.domain,
    uri: row.uri,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
  });
}

/** Ids for wallet rows. A UUID here, because it is only ever an identifier. */
export const walletIdGenerator = { next: (): string => randomUUID() };
