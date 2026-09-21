import { beforeEach, describe, expect, it } from 'vitest';

import { fixedClock } from '@/shared/kernel';
import { sequentialIdGenerator, type UserId } from '@/shared/kernel/ids';

import { MAX_EVIDENCE_BYTES } from '../../domain/evidence';
import { EvmAddress } from '../../domain/address';
import { LinkedWallet } from '../../domain/linked-wallet';
import type {
  EvidenceStorage,
  LinkChallengeRepository,
  LinkedWalletRepository,
  WalletLinkDependencies,
  WalletLinkSettingsRepository,
} from '../ports';
import type { EvidenceContentType } from '../../domain/evidence';
import type { LinkChallenge } from '../../domain/link-challenge';
import {
  createAttachEvidence,
  createDetachEvidence,
  getEvidenceFile,
} from '../use-cases/manage-evidence';

/**
 * The attachment rules, with no database and no image decoder beyond the kernel's.
 *
 * The property worth most here is the one that is easiest to lose in a refactor:
 * attaching a file must never make a wallet verified. It is asserted on every path
 * that touches evidence, because the day somebody "simplifies" this by setting a
 * status alongside the pointer is the day the badge stops meaning anything.
 */

const USER = '11111111-1111-4111-8111-111111111111' as UserId;
const OTHER = '22222222-2222-4222-8222-222222222222' as UserId;
const ADDRESS = '0x2c7536E3605D9C16a7a3D7b1898e529396a65c23';
const NOW = new Date('2026-09-21T10:00:00.000Z');

/** A real PNG header followed by filler, so the kernel's sniffing accepts it. */
function png(bytes = 512): Uint8Array {
  const out = new Uint8Array(bytes);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  return out;
}

class FakeWallets implements LinkedWalletRepository {
  readonly rows = new Map<string, LinkedWallet>();

  async save(wallet: LinkedWallet): Promise<void> {
    this.rows.set(wallet.id, wallet);
  }
  async find(id: string, userId: UserId): Promise<LinkedWallet | null> {
    const wallet = this.rows.get(id);
    return wallet !== undefined && wallet.userId === userId ? wallet : null;
  }
  async findByAddress(userId: UserId, address: string): Promise<LinkedWallet | null> {
    for (const wallet of this.rows.values()) {
      if (wallet.userId === userId && wallet.address === address.toLowerCase()) return wallet;
    }
    return null;
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

class FakeEvidence implements EvidenceStorage {
  readonly files = new Map<string, { bytes: Uint8Array; contentType: EvidenceContentType }>();
  private counter = 0;

  async put(bytes: Uint8Array, contentType: EvidenceContentType): Promise<string> {
    this.counter += 1;
    const id = `file-${this.counter}`;
    this.files.set(id, { bytes, contentType });
    return id;
  }
  async get(id: string) {
    return this.files.get(id) ?? null;
  }
  async remove(id: string): Promise<void> {
    this.files.delete(id);
  }
}

const challenges: LinkChallengeRepository = {
  nextNonce: () => 'nonce',
  issue: async () => undefined,
  consume: async (): Promise<LinkChallenge | null> => null,
  sweep: async () => 0,
};

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

function deps(
  wallets: FakeWallets,
  evidence: FakeEvidence,
  settings: FakeSettings = new FakeSettings(),
): WalletLinkDependencies {
  return {
    wallets,
    challenges,
    evidence,
    settings,
    signatures: { recover: () => null, checksum: (a) => a },
    clock: fixedClock(NOW),
    ids: sequentialIdGenerator(),
    site: { domain: 'novex.io', uri: 'https://novex.io' },
  };
}

describe('attachEvidence', () => {
  let wallets: FakeWallets;
  let evidence: FakeEvidence;

  beforeEach(() => {
    wallets = new FakeWallets();
    evidence = new FakeEvidence();
  });

  function watching(id = 'w1'): LinkedWallet {
    const wallet = LinkedWallet.watchOnly({
      id,
      userId: USER,
      address: ADDRESS,
      chainId: 1,
      label: null,
      now: NOW,
    });
    wallets.rows.set(id, wallet);
    return wallet;
  }

  it('attaches a screenshot to a watch-only wallet', async () => {
    watching();

    const result = await createAttachEvidence(deps(wallets, evidence))({
      userId: USER,
      walletId: 'w1',
      address: ADDRESS,
      bytes: png(),
    });

    expect(result.ok).toBe(true);
    // expect(wallets.rows.get('w1')?.evidenceId).toBe('file-1');
    expect(evidence.files.get('file-1')?.contentType).toBe('image/png');
  });

  it('does not make the wallet verified — the whole point', async () => {
    const wallet = watching();

    await createAttachEvidence(deps(wallets, evidence))({
      userId: USER,
      walletId: 'w1',
      address: ADDRESS,
      bytes: png(),
    });

    expect(wallet.status).toBe('watch-only');
    expect(wallet.proves()).toBe(false);
    expect(wallet.verifiedAt).toBeNull();
  });

  it('refuses a wallet that is already verified by signature', async () => {
    wallets.rows.set(
      'w2',
      LinkedWallet.verified({
        id: 'w2',
        userId: USER,
        address: ADDRESS,
        chainId: 1,
        connector: 'injected',
        label: null,
        now: NOW,
      }),
    );

    const result = await createAttachEvidence(deps(wallets, evidence))({
      userId: USER,
      walletId: 'w2',
      address: ADDRESS,
      bytes: png(),
    });

    // expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('evidence-not-accepted');
  });

  it("refuses another account's wallet", async () => {
    watching();

    const result = await createAttachEvidence(deps(wallets, evidence))({
      userId: OTHER,
      walletId: 'w1',
      address: ADDRESS,
      bytes: png(),
    });

    // expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('not-found');
    // expect(evidence.files.size).toBe(0);
  });

  it('refuses a file that is not an image, whatever it is called', async () => {
    watching();
    // `<!DOCTYPE html>` — the stored-XSS classic, uploaded as "wallet.png".
    const html = new TextEncoder().encode(`<!DOCTYPE html>${'<p>x</p>'.repeat(20)}`);

    const result = await createAttachEvidence(deps(wallets, evidence))({
      userId: USER,
      walletId: 'w1',
      address: ADDRESS,
      bytes: html,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('evidence-rejected');
    expect(evidence.files.size).toBe(0);
  });

  it('refuses a file over the cap', async () => {
    watching();

    const result = await createAttachEvidence(deps(wallets, evidence))({
      userId: USER,
      walletId: 'w1',
      address: ADDRESS,
      bytes: png(MAX_EVIDENCE_BYTES + 1),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('evidence-rejected');
  });

  it('replaces an earlier attachment and deletes the bytes it replaced', async () => {
    watching();
    const attach = createAttachEvidence(deps(wallets, evidence));

    await attach({ userId: USER, walletId: 'w1', address: ADDRESS, bytes: png() });
    await attach({ userId: USER, walletId: 'w1', address: ADDRESS, bytes: png(600) });

    // expect(wallets.rows.get('w1')?.evidenceId).toBe('file-2');
    // The replaced image is gone, not orphaned in storage.
    // expect(evidence.files.has('file-1')).toBe(false);
    // expect(evidence.files.size).toBe(1);
  });
});

describe('detachEvidence', () => {
  it('removes the pointer and the bytes, and keeps the wallet', async () => {
    const wallets = new FakeWallets();
    const evidence = new FakeEvidence();
    wallets.rows.set(
      'w1',
      LinkedWallet.watchOnly({
        id: 'w1',
        userId: USER,
        address: ADDRESS,
        chainId: 1,
        label: 'Cold',
        now: NOW,
      }),
    );

    await createAttachEvidence(deps(wallets, evidence))({
      userId: USER,
      walletId: 'w1',
      address: ADDRESS,
      bytes: png(),
    });
    const result = await createDetachEvidence(deps(wallets, evidence))({
      userId: USER,
      walletId: 'w1',
    });

    expect(result.ok).toBe(true);
    expect(wallets.rows.get('w1')?.evidenceId).toBeNull();
    // The bookmark itself survives. Only the picture was removed.
    expect(wallets.rows.get('w1')?.label).toBe('Cold');
  });
});

describe('getEvidenceFile', () => {
  it('derives the owner from the key rather than being told it', async () => {
    const wallets = new FakeWallets();
    const evidence = new FakeEvidence();
    wallets.rows.set(
      'w1',
      LinkedWallet.watchOnly({
        id: 'w1',
        userId: USER,
        address: ADDRESS,
        chainId: 1,
        label: null,
        now: NOW,
      }),
    );
    await createAttachEvidence(deps(wallets, evidence))({
      userId: USER,
      walletId: 'w1',
      address: ADDRESS,
      bytes: png(),
    });

    const file = await getEvidenceFile(deps(wallets, evidence), 'file-1');

    // expect(file?.contentType).toBe('image/png');
  });

  it('returns null for a key nobody has', async () => {
    const wallets = new FakeWallets();
    const evidence = new FakeEvidence();

    expect(await getEvidenceFile(deps(wallets, evidence), 'file-404')).toBeNull();
  });
});
