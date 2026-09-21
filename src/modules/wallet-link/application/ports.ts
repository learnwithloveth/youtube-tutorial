import type { Clock } from '@/shared/kernel';
import type { IdGenerator, UserId } from '@/shared/kernel/ids';

import type { EvidenceContentType } from '../domain/evidence';
import type { LinkChallenge } from '../domain/link-challenge';
import type { LinkedWallet } from '../domain/linked-wallet';

export interface LinkedWalletRepository {
  save(wallet: LinkedWallet): Promise<void>;
  find(id: string, userId: UserId): Promise<LinkedWallet | null>;
  /**
   * The account's row for an address, revoked or not.
   *
   * Includes revoked rows deliberately. Re-linking a wallet somebody disconnected
   * last week should revive that row rather than write a second one, or the table
   * accumulates a row per reconnection and the cap starts refusing a customer who
   * has one wallet.
   */
  findByAddress(userId: UserId, address: string): Promise<LinkedWallet | null>;
  listForUser(userId: UserId): Promise<LinkedWallet[]>;
  countActiveForUser(userId: UserId): Promise<number>;
  /**
   * The wallet an attachment belongs to.
   *
   * Exists so the route handler that serves the bytes can answer "whose is this"
   * without the caller supplying an owner. A URL is public; the account it
   * belongs to has to be derived from the key, never accepted alongside it.
   */
  findByEvidenceId(evidenceId: string): Promise<LinkedWallet | null>;
}

/**
 * Whether an account has turned the feature on.
 *
 * Its own port rather than a column on something else: this is a preference, and
 * it has no business living in the aggregate that models a wallet. It is read on
 * every write path, so the adapter's lookup is by primary key.
 */
export interface WalletLinkSettingsRepository {
  isEnabled(userId: UserId): Promise<boolean>;
  enable(userId: UserId, at: Date): Promise<void>;
  disable(userId: UserId): Promise<void>;
}

/**
 * Where an attached screenshot's bytes live.
 *
 * A port because the Postgres implementation is explicitly temporary — see the
 * table's own note. `put` takes a content type the caller has *already sniffed*;
 * an adapter must never re-derive one from a filename, because the filename is
 * chosen by whoever is uploading.
 */
export interface EvidenceStorage {
  put(bytes: Uint8Array, contentType: EvidenceContentType, address: string, userId: UserId): Promise<string>;
  get(evidenceId: string): Promise<{ bytes: Uint8Array; contentType: EvidenceContentType } | null>;
  remove(evidenceId: string): Promise<void>;
}

/**
 * Challenges awaiting a signature.
 *
 * ── `consume` is where single-use is enforced, and it must be atomic ──────────
 * A read-then-write would let two submissions of the same signature both see an
 * unconsumed challenge and both proceed. The adapter marks and returns in one
 * conditional statement, so exactly one caller is handed the challenge.
 */
export interface LinkChallengeRepository {
  nextNonce(): string;
  issue(challenge: LinkChallenge): Promise<void>;
  /**
   * Marks the challenge spent and returns it, or null when it was already spent
   * or never existed. Returning it *only* on the transition is what makes replay
   * impossible rather than merely unlikely.
   */
  consume(nonce: string, at: Date): Promise<LinkChallenge | null>;
  /** Drops expired and spent rows. Ridden off the issue path — see the use case. */
  sweep(before: Date): Promise<number>;
}

/**
 * The cryptography, kept out of the domain.
 *
 * Both operations are keccak-256 at bottom, which is a library, and the domain
 * layer imports no libraries. Behind a port they are also substitutable, which is
 * what lets the use-case tests run with a stub that "recovers" whatever the test
 * says it should and assert on the rules rather than on elliptic curves.
 */
export interface WalletSignatures {
  /**
   * The address that produced this EIP-191 `personal_sign` signature, checksummed,
   * or null when the signature is malformed or does not recover.
   *
   * Null rather than a throw: a signature that does not verify is the expected
   * outcome of somebody tampering, not an exceptional condition.
   */
  recover(message: string, signature: string): string | null;
  /** The EIP-55 checksummed form of a syntactically valid address. */
  checksum(address: string): string;
}

export interface WalletLinkDependencies {
  wallets: LinkedWalletRepository;
  challenges: LinkChallengeRepository;
  evidence: EvidenceStorage;
  settings: WalletLinkSettingsRepository;
  signatures: WalletSignatures;
  clock: Clock;
  ids: IdGenerator;
  /**
   * The origin this deployment signs for — `novex.io`, and `https://novex.io`.
   *
   * Configuration rather than a request header. A domain taken from the request is
   * a domain an attacker sets, which would defeat the one field in an EIP-4361
   * message that binds a signature to this site.
   */
  site: { domain: string; uri: string };
}
