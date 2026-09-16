import type { UserId } from '@/shared/kernel/ids';

import type { AuthProvider, ConnectedAccount } from '../../domain/connected-account';
import type { ConnectedAccountRepository } from '../ports';

/**
 * In-memory provider links.
 *
 * `link` enforces the same two rules the table's keys do, because they are what the
 * use cases lean on: one provider account belongs to one user, and one user has at
 * most one account per provider. A fake that accepted everything would let a test
 * pass while the real adapter refused the same write.
 */
export class FakeConnectedAccounts implements ConnectedAccountRepository {
  readonly store: ConnectedAccount[] = [];

  async find(provider: AuthProvider, providerAccountId: string): Promise<ConnectedAccount | null> {
    return (
      this.store.find(
        (account) =>
          account.provider === provider && account.providerAccountId === providerAccountId,
      ) ?? null
    );
  }

  async listForUser(userId: UserId): Promise<ConnectedAccount[]> {
    return this.store.filter((account) => account.userId === userId);
  }

  async link(account: ConnectedAccount): Promise<boolean> {
    const taken = this.store.some(
      (existing) =>
        (existing.provider === account.provider &&
          existing.providerAccountId === account.providerAccountId) ||
        (existing.provider === account.provider && existing.userId === account.userId),
    );
    if (taken) return false;

    this.store.push(account);
    return true;
  }

  async unlink(userId: UserId, provider: AuthProvider): Promise<boolean> {
    const index = this.store.findIndex(
      (account) => account.userId === userId && account.provider === provider,
    );
    if (index === -1) return false;

    this.store.splice(index, 1);
    return true;
  }
}
