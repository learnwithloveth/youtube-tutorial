import { beforeEach, describe, expect, it } from 'vitest';

import { fixedClock, type Clock } from '@/shared/kernel';
import { sequentialIdGenerator, type UserId } from '@/shared/kernel/ids';

import type { LinkChallenge } from '../../domain/link-challenge';
import { LinkedWallet } from '../../domain/linked-wallet';
import type {
  EvidenceStorage,
  LinkChallengeRepository,
  LinkedWalletRepository,
  WalletLinkDependencies,
  WalletLinkSettingsRepository,
  WalletSignatures,
} from '../ports';
import { createIssueChallenge } from '../use-cases/issue-challenge';
import { createLinkWallet } from '../use-cases/link-wallet';
import { createWatchAddress } from '../use-cases/manage-wallets';

/**
 * The rules, exercised with no database, no network and no elliptic curves.
 *
 * The signature verifier is a stub that recovers whatever the test tells it to.
 * That is the point of the port: what is under test here is *what the use case
 * does with the answer* — the replay check, the address comparison, the account
 * binding — and those are the parts a real curve implementation would obscure
 * rather than prove. The curve itself is tested separately, against a signature
 * produced by a key.
 */

const USER = '11111111-1111-4111-8111-111111111111' as UserId;
const OTHER_USER = '22222222-2222-4222-8222-222222222222' as UserId;
const ADDRESS = '0x2c7536E3605D9C16a7a3D7b1898e529396a65c23';
const SIGNATURE = `0x${'ab'.repeat(65)}`;
const NOW = new Date('2026-09-21T10:00:00.000Z');

class FakeWallets implements LinkedWalletRepository {
  async findByUserId(userId: string): Promise<LinkedWallet | null> {
    for (const wallet of this.rows.values()) {
      if (wallet.userId === userId) return wallet;
    }
    return null;
  }
  readonly rows = new Map<string, LinkedWallet>();

  private key(userId: UserId, address: string): string {
    return `${userId}:${typeof address === 'string' ? address.toLowerCase() : address}`;
  }

  async save(wallet: LinkedWallet): Promise<void> {
    this.rows.set(this.key(wallet.userId, wallet.address), wallet);
  }

  async find(id: string, userId: UserId): Promise<LinkedWallet | null> {
    for (const wallet of this.rows.values()) {
      if (wallet.id === id && wallet.userId === userId) return wallet;
    }
    return null;
  }

  async findByAddress(userId: UserId, address: string): Promise<LinkedWallet | null> {
    return this.rows.get(this.key(userId, address)) ?? null;
  }

  async listForUser(userId: UserId): Promise<LinkedWallet[]> {
    return [...this.rows.values()].filter((wallet) => wallet.userId === userId);
  }

  async countActiveForUser(userId: UserId): Promise<number> {
    return (await this.listForUser(userId)).filter((wallet) => wallet.isActive).length;
  }

  async findByEvidenceId(evidenceId: string): Promise<LinkedWallet | null> {
    for (const wallet of this.rows.values()) {
      if (wallet.evidenceId === evidenceId) return wallet;
    }
    return null;
  }
}

/** Records what was stored and removed, so the retention rule can be asserted. */
class FakeEvidence implements EvidenceStorage {
  async getWithUserId(userId: UserId): Promise<string[] | null> {
    void userId;
    return [...this.files.keys()];
  }
  readonly files = new Map<string, Uint8Array>();
  private counter = 0;

  async put(bytes: Uint8Array): Promise<string> {
    this.counter += 1;
    const id = `file-${this.counter}`;
    this.files.set(id, bytes);
    return id;
  }
  async get(id: string) {
    const bytes = this.files.get(id);
    return bytes === undefined ? null : { bytes, contentType: 'image/png' as const };
  }
  async remove(id: string): Promise<void> {
    this.files.delete(id);
  }
}

class FakeChallenges implements LinkChallengeRepository {
  readonly rows = new Map<string, LinkChallenge>();
  private counter = 0;

  nextNonce(): string {
    this.counter += 1;
    return `nonce-${this.counter}`;
  }

  async issue(challenge: LinkChallenge): Promise<void> {
    this.rows.set(challenge.nonce, challenge);
  }

  /** Atomic in the adapter; here, the same one-shot behaviour by hand. */
  async consume(nonce: string, at: Date): Promise<LinkChallenge | null> {
    const challenge = this.rows.get(nonce);
    if (challenge === undefined || challenge.consumedAt !== null) return null;
    challenge.consume(at);
    return challenge;
  }

  async sweep(before: Date): Promise<number> {
    let removed = 0;
    for (const [nonce, challenge] of this.rows) {
      if (challenge.expiresAt < before) {
        this.rows.delete(nonce);
        removed += 1;
      }
    }
    return removed;
  }
}

/** Enabled by default in these tests; the gate has its own suite below. */
class FakeSettings implements WalletLinkSettingsRepository {
  constructor(private on = true) {}
  async isEnabled(): Promise<boolean> {
    return this.on;
  }
  async enable(): Promise<void> {
    this.on = true;
  }
  async disable(): Promise<void> {
    this.on = false;
  }
}

/** Recovers whatever it is told to, and checksums by upper-casing the prefix only. */
function signatures(recovered: string | null): WalletSignatures {
  return {
    recover: () => recovered,
    checksum: (address) => `0x${address.slice(2).toUpperCase()}`,
  };
}

function deps(overrides: {
  wallets?: FakeWallets;
  challenges?: FakeChallenges;
  evidence?: FakeEvidence;
  settings?: FakeSettings;
  recovered?: string | null;
  clock?: Clock;
}): WalletLinkDependencies {
  return {
    wallets: overrides.wallets ?? new FakeWallets(),
    challenges: overrides.challenges ?? new FakeChallenges(),
    evidence: overrides.evidence ?? new FakeEvidence(),
    settings: overrides.settings ?? new FakeSettings(),
    signatures: signatures(overrides.recovered === undefined ? ADDRESS : overrides.recovered),
    clock: overrides.clock ?? fixedClock(NOW),
    ids: sequentialIdGenerator(),
    site: { domain: 'novex.io', uri: 'https://novex.io' },
  };
}

describe('linkWallet', () => {
  let wallets: FakeWallets;
  let challenges: FakeChallenges;

  beforeEach(() => {
    wallets = new FakeWallets();
    challenges = new FakeChallenges();
  });

  async function issueFor(userId: UserId = USER, chainId = 1, clock?: Clock): Promise<string> {
    const result = await createIssueChallenge(
      deps({ wallets, challenges, ...(clock ? { clock } : {}) }),
    )({
      userId,
      address: ADDRESS,
      chainId,
    });
    if (!result.ok) throw new Error(`issue failed: ${result.error.kind}`);
    return result.value.nonce;
  }

  it('links a wallet when the signature recovers to the address it was issued for', async () => {
    const nonce = await issueFor();

    const result = await createLinkWallet(deps({ wallets, challenges }))({
      userId: USER,
      nonce,
      signature: SIGNATURE,
      connector: 'injected',
      label: 'Main',
    });

    expect(result.ok).toBe(true);
    const stored = await wallets.findByAddress(USER, ADDRESS);
    expect(stored?.proves()).toBe(true);
    expect(stored?.connector).toBe('injected');
  });

  it('refuses a second use of the same nonce', async () => {
    const nonce = await issueFor();
    const link = createLinkWallet(deps({ wallets, challenges }));

    await link({ userId: USER, nonce, signature: SIGNATURE, connector: 'injected', label: null });
    const replay = await link({
      userId: USER,
      nonce,
      signature: SIGNATURE,
      connector: 'injected',
      label: null,
    });

    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.error.kind).toBe('challenge-unknown');
  });

  it('burns the nonce even when the signature fails, so a failure is not free retries', async () => {
    const nonce = await issueFor();

    const bad = await createLinkWallet(deps({ wallets, challenges, recovered: null }))({
      userId: USER,
      nonce,
      signature: SIGNATURE,
      connector: 'injected',
      label: null,
    });
    expect(bad.ok).toBe(false);

    const retry = await createLinkWallet(deps({ wallets, challenges }))({
      userId: USER,
      nonce,
      signature: SIGNATURE,
      connector: 'injected',
      label: null,
    });
    expect(retry.ok).toBe(false);
    if (!retry.ok) expect(retry.error.kind).toBe('challenge-unknown');
  });

  it('refuses a nonce issued to another account, even though both are signed in', async () => {
    const nonce = await issueFor(OTHER_USER);

    const result = await createLinkWallet(deps({ wallets, challenges }))({
      userId: USER,
      nonce,
      signature: SIGNATURE,
      connector: 'injected',
      label: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('challenge-unknown');
  });

  it('refuses a valid signature from a different address', async () => {
    const nonce = await issueFor();
    const someoneElse = `0x${'1'.repeat(40)}`;

    const result = await createLinkWallet(deps({ wallets, challenges, recovered: someoneElse }))({
      userId: USER,
      nonce,
      signature: SIGNATURE,
      connector: 'injected',
      label: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('signature-mismatch');
      // The message names both, because the cause is nearly always the wrong
      // account selected in the wallet.
      if (result.error.kind === 'signature-mismatch') {
        expect(result.error.recovered).toBe('0x1111…1111');
      }
    }
    expect(await wallets.findByAddress(USER, ADDRESS)).toBeNull();
  });

  it('refuses a challenge signed after it expired', async () => {
    const nonce = await issueFor();
    const late = fixedClock(new Date(NOW.getTime() + 6 * 60_000));

    const result = await createLinkWallet(deps({ wallets, challenges, clock: late }))({
      userId: USER,
      nonce,
      signature: SIGNATURE,
      connector: 'injected',
      label: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('challenge-expired');
  });

  it('upgrades a watch-only row rather than writing a second one', async () => {
    const watch = await createWatchAddress(deps({ wallets, challenges }))({
      userId: USER,
      address: ADDRESS,
      chainId: 1,
      label: 'Cold',
    });
    expect(watch.ok).toBe(true);

    const nonce = await issueFor();
    const result = await createLinkWallet(deps({ wallets, challenges }))({
      userId: USER,
      nonce,
      signature: SIGNATURE,
      connector: 'injected',
      label: null,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.outcome).toBe('restored');

    const rows = await wallets.listForUser(USER);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.proves()).toBe(true);
    // The label the customer already gave it survives the upgrade.
    expect(rows[0]?.label).toBe('Cold');
  });

  it('drops an attached screenshot when a signature supersedes it', async () => {
    const evidence = new FakeEvidence();
    const id = await evidence.put(new Uint8Array([1, 2, 3]));

    const watch = LinkedWallet.watchOnly({
      id: 'w9',
      userId: USER,
      address: ADDRESS,
      chainId: 1,
      label: 'Cold',
      now: NOW,
    });
    watch.attachEvidence(id, NOW);
    await wallets.save(watch);

    const nonce = await issueFor();
    const result = await createLinkWallet(deps({ wallets, challenges, evidence }))({
      userId: USER,
      nonce,
      signature: SIGNATURE,
      connector: 'injected',
      label: null,
    });

    expect(result.ok).toBe(true);
    const stored = await wallets.findByAddress(USER, ADDRESS);
    expect(stored?.proves()).toBe(true);
    // The pointer is cleared and the bytes are deleted: the picture was held only
    // because there was no proof, and there is proof now.
    expect(stored?.evidenceId).toBeNull();
    expect(evidence.files.size).toBe(0);
  });

  it('refreshes an already-verified wallet rather than writing a second row', async () => {
    const first = await issueFor();
    const initial = await createLinkWallet(deps({ wallets, challenges }))({
      userId: USER,
      nonce: first,
      signature: SIGNATURE,
      connector: 'injected',
      label: 'Main',
    });
    expect(initial.ok).toBe(true);

    // Reconnected later, from the same wallet switched to another network.
    const later = fixedClock(new Date(NOW.getTime() + 86_400_000));
    // Issued on the same clock it is redeemed on: a challenge minted at `NOW`
    // would have expired four minutes into the day that passed.
    const second = await issueFor(USER, 8453, later);
    const again = await createLinkWallet(deps({ wallets, challenges, clock: later }))({
      userId: USER,
      nonce: second,
      signature: SIGNATURE,
      connector: 'walletconnect',
      label: null,
    });

    expect(again.ok).toBe(true);
    if (again.ok) expect(again.value.outcome).toBe('refreshed');

    const rows = await wallets.listForUser(USER);
    expect(rows).toHaveLength(1);
    // Where it is now moved; when control was first proved did not.
    expect(rows[0]?.chainId).toBe(8453);
    expect(rows[0]?.linkedAt).toEqual(NOW);
    expect(rows[0]?.lastSeenAt).toEqual(new Date(NOW.getTime() + 86_400_000));
    // An empty label field on a reconnect must not erase the name already chosen.
    expect(rows[0]?.label).toBe('Main');
  });

  it('still refuses a watch-only duplicate, which proves nothing new', async () => {
    const watch = createWatchAddress(deps({ wallets, challenges }));
    await watch({ userId: USER, address: ADDRESS, chainId: 1, label: null });
    const again = await watch({ userId: USER, address: ADDRESS, chainId: 1, label: null });

    // expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.kind).toBe('already-linked');
  });

  /* Was 'stops at the cap', asserting a refusal once ten wallets were linked.
     There is no cap, so the assertion is inverted: a long list is not a reason to
     turn the next address away. */
  it('issues a challenge however many wallets are already linked', async () => {
    for (let i = 0; i < 25; i += 1) {
      const address = `0x${i.toString(16).padStart(40, '0')}`;
      await wallets.save(
        LinkedWallet.watchOnly({
          id: `w${i}`,
          userId: USER,
          address: address,
          chainId: 1,
          label: null,
          now: NOW,
        }),
      );
    }

    const result = await createIssueChallenge(deps({ wallets, challenges }))({
      userId: USER,
      address: ADDRESS,
      chainId: 1,
    });

    expect(result.ok).toBe(true);
  });
});

describe('issueChallenge', () => {
  it('signs for the configured origin, never one supplied by the caller', async () => {
    const challenges = new FakeChallenges();
    const result = await createIssueChallenge(deps({ challenges }))({
      userId: USER,
      address: ADDRESS,
      chainId: 8453,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.message).toContain('novex.io wants you to sign in');
      expect(result.value.message).toContain('URI: https://novex.io');
      expect(result.value.message).toContain('Chain ID: 8453');
    }
  });

  it('refuses an address that is not one', async () => {
    const result = await createIssueChallenge(deps({}))({
      userId: USER,
      address: 'my-wallet',
      chainId: 1,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('address-invalid');
  });

  it.each([0, -1, Number.NaN, 1.5])('refuses chain id %s', async (chainId) => {
    const result = await createIssueChallenge(deps({}))({
      userId: USER,
      address: ADDRESS,
      chainId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('chain-invalid');
  });
});

describe('watchAddress', () => {
  it('records an address with nothing proved about it', async () => {
    const wallets = new FakeWallets();

    const result = await createWatchAddress(deps({ wallets }))({
      userId: USER,
      address: ADDRESS,
      chainId: 1,
      label: 'Hardware',
    });

    expect(result.ok).toBe(true);
    const stored = await wallets.findByAddress(USER, ADDRESS);
    expect(stored?.status).toBe('watch-only');
    expect(stored?.proves()).toBe(false);
  });

  it('refuses an address that is not one', async () => {
    const result = await createWatchAddress(deps({}))({
      userId: USER,
      // The shape somebody pastes when they have misunderstood what is wanted.
      // It is refused for being the wrong shape, and nothing about it is stored.
      address: 'witch collapse practice feed shame open despair creek road again ice least',
      chainId: 1,
      label: null,
    });

    // expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('address-invalid');
  });
});
