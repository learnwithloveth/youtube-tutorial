import type { UserId } from '@/shared/kernel/ids';

import type { AuthProvider } from '../../domain/connected-account';
import type { IdentityDependencies } from '../ports';

/**
 * How one account can be signed into — what the security page reports.
 *
 * Both halves are read, not assumed. "Has a password" used to be true of every
 * account by construction; since Google sign-in it is a fact about a row, and a
 * page that guessed it would offer somebody a "change password" form for a password
 * they have never had.
 */

export interface ConnectedAccountDto {
  readonly provider: AuthProvider;
  /** The address on the provider account, which need not match the account's own. */
  readonly email: string;
  readonly linkedAt: string;
}

export interface SignInMethodsDto {
  readonly hasPassword: boolean;
  readonly connected: readonly ConnectedAccountDto[];
}

export async function getSignInMethods(
  deps: IdentityDependencies,
  userId: UserId,
): Promise<SignInMethodsDto> {
  const [user, connected] = await Promise.all([
    deps.users.findById(userId),
    deps.connectedAccounts.listForUser(userId),
  ]);

  return {
    hasPassword: user?.hasPassword ?? false,
    connected: connected.map((account) => ({
      provider: account.provider,
      email: account.email,
      linkedAt: account.linkedAt.toISOString(),
    })),
  };
}
