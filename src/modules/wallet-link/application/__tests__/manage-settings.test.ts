import { describe, expect, it } from 'vitest';

import { fixedClock } from '@/shared/kernel';
import { sequentialIdGenerator, type UserId } from '@/shared/kernel/ids';

import { EvmAddress } from '../../domain/address';
import { LinkedWallet } from '../../domain/linked-wallet';
import type {
  EvidenceStorage,
  LinkChallengeRepository,
  LinkedWalletRepository,
  WalletLinkDependencies,
  WalletLinkSettingsRepository,
} from '../ports';
import type { LinkChallenge } from '../../domain/link-challenge';
import {
  createDisableWalletLink,
  createEnableWalletLink,
  isWalletLinkEnabled,
} from '../use-cases/manage-settings';
import { createIssueChallenge } from '../use-cases/issue-challenge';
import { createWatchAddress } from '../use-cases/manage-wallets';

/**
 * The opt-in, and the thing that makes it a control rather than a curtain.
 *
 * The tests that matter most here are the last two: a *write* must refuse while
 * the feature is off. Hiding a panel protects nothing — a Server Action is a
 * public endpoint — so if these ever start passing for the wrong reason, the
 * switch has become decoration.
 */

const USER = '11111111-1111-4111-8111-111111111111' as UserId;
const ADDRESS = '0x2c7536E3605D9C16a7a3D7b1898e529396a65c23';
const NOW = new Date('2026-09-21T10:00:00.000Z');

class FakeSettings implements WalletLinkSettingsRepository {
  constructor(public on = false) {}
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
      if (wallet.userId === userId && wallet.address.value === address.toLowerCase()) return wallet;
    }
    return null;
  }
  async listForUser(userId: UserId): Promise<LinkedWallet[]> {
    return [...this.rows.values()].filter((wallet) => wallet.userId === userId);
  }
  async countActiveForUser(userId: UserId): Promise<number> {
    return (await this.listForUser(userId)).filter((wallet) => wallet.isActive).length;
  }
  async findByEvidenceId(): Promise<LinkedWallet | null> {
    return null;
  }
}

const challenges: LinkChallengeRepository = {
  nextNonce: () => 'nonce',
  issue: async () => undefined,
  consume: async (): Promise<LinkChallenge | null> => null,
  sweep: async () => 0,
};

const evidence: EvidenceStorage = {
  put: async () => 'file-1',
  get: async () => null,
  remove: async () => undefined,
};

function deps(wallets: FakeWallets, settings: FakeSettings): WalletLinkDependencies {
  return {
    wallets,
    challenges,
    evidence,
    settings,
    signatures: { recover: () => null, checksum: (address) => address },
    clock: fixedClock(NOW),
    ids: sequentialIdGenerator(),
    site: { domain: 'novex.io', uri: 'https://novex.io' },
  };
}

function watching(wallets: FakeWallets, id: string): void {
  wallets.rows.set(
    id,
    LinkedWallet.watchOnly({
      id,
      userId: USER,
      address: EvmAddress.parse(ADDRESS) as EvmAddress,
      chainId: 1,
      label: null,
      now: NOW,
    }),
  );
}

describe('wallet-link settings', () => {
  it('is off for an account that has never touched it', async () => {
    const settings = new FakeSettings();
    expect(await isWalletLinkEnabled(deps(new FakeWallets(), settings), USER)).toBe(false);
  });

  it('turns on, and turning on twice is not an error', async () => {
    const settings = new FakeSettings();
    const enable = createEnableWalletLink(deps(new FakeWallets(), settings));

    expect((await enable({ userId: USER })).ok).toBe(true);
    // A double click, or a stale tab replaying the action, leaves the account
    // where it wanted to be rather than erroring at it.
    expect((await enable({ userId: USER })).ok).toBe(true);
    expect(settings.on).toBe(true);
  });

  it('turns off when nothing is attached', async () => {
    const settings = new FakeSettings(true);
    const result = await createDisableWalletLink(deps(new FakeWallets(), settings))({
      userId: USER,
    });

    expect(result.ok).toBe(true);
    expect(settings.on).toBe(false);
  });

  it('refuses to turn off while a wallet is still connected', async () => {
    const wallets = new FakeWallets();
    watching(wallets, 'w1');
    watching(wallets, 'w2');
    // Two rows, same address in this fake — keyed by id, which is what the count
    // walks. Two is what the message has to name.
    const settings = new FakeSettings(true);

    const result = await createDisableWalletLink(deps(wallets, settings))({ userId: USER });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('wallets-still-connected');
      if (result.error.kind === 'wallets-still-connected') expect(result.error.count).toBe(2);
    }
    // Still on. "Off" must always mean "nothing is attached to this account".
    expect(settings.on).toBe(true);
  });

  it('refuses to issue a challenge while the feature is off', async () => {
    const result = await createIssueChallenge(deps(new FakeWallets(), new FakeSettings(false)))({
      userId: USER,
      address: ADDRESS,
      chainId: 1,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('not-enabled');
  });

  it('refuses to watch an address while the feature is off', async () => {
    const wallets = new FakeWallets();
    const result = await createWatchAddress(deps(wallets, new FakeSettings(false)))({
      userId: USER,
      address: ADDRESS,
      chainId: 1,
      label: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('not-enabled');
    // Nothing was written. The refusal happens before any address is parsed.
    expect(wallets.rows.size).toBe(0);
  });
});
