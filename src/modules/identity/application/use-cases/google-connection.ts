import 'server-only';

import { err, ok, type Result } from '@/shared/kernel/result';
import type { UserId } from '@/shared/kernel/ids';

import { PROVIDER_LABELS, type AuthProvider } from '../../domain/connected-account';
import { IdentityErrors, type IdentityError } from '../errors';
import type { IdentityDependencies, ProviderProfile } from '../ports';

const PROVIDER: AuthProvider = 'google';
const LABEL = PROVIDER_LABELS[PROVIDER];

/**
 * Connecting and disconnecting Google from an account that is already signed in.
 *
 * Separate from signing in with it. Sign-in answers "who is this?"; these two answer
 * "what may this account use next time?", and they are reached from the security
 * page rather than from a login screen.
 */

export interface ConnectGoogleCommand {
  userId: UserId;
  profile: ProviderProfile;
}

export function createConnectGoogle(deps: IdentityDependencies) {
  return async function connectGoogle(
    command: ConnectGoogleCommand,
  ): Promise<Result<{ email: string }, IdentityError>> {
    const user = await deps.users.findById(command.userId);
    if (user === null) return err(IdentityErrors.sessionInvalid());

    // The same rule sign-in applies: an address Google has not confirmed is a
    // string somebody typed, and connecting on one would make this account
    // reachable by whoever typed it.
    if (!command.profile.emailVerified) {
      return err(IdentityErrors.providerEmailUnverified(LABEL));
    }

    const already = await deps.connectedAccounts.listForUser(command.userId);
    if (already.some((account) => account.provider === PROVIDER)) {
      return err(IdentityErrors.providerAlreadyConnected(LABEL));
    }

    const linked = await deps.connectedAccounts.link({
      provider: PROVIDER,
      providerAccountId: command.profile.providerAccountId,
      userId: command.userId,
      email: command.profile.email,
      linkedAt: deps.clock.now(),
    });
    // Already somebody's. Which account is deliberately not said: that would answer
    // "does this person have an account here" for any Google address.
    if (!linked) return err(IdentityErrors.providerAccountLinkedElsewhere(LABEL));

    return ok({ email: command.profile.email });
  };
}

export type ConnectGoogle = ReturnType<typeof createConnectGoogle>;

export function createDisconnectGoogle(deps: IdentityDependencies) {
  return async function disconnectGoogle(
    userId: UserId,
  ): Promise<Result<void, IdentityError>> {
    const user = await deps.users.findById(userId);
    if (user === null) return err(IdentityErrors.sessionInvalid());

    // The check that stops somebody locking themselves out of their own account
    // with one click. Password reset would not rescue them either: the reset link
    // sets a password on an account they can no longer reach to ask for one.
    if (!user.hasPassword) return err(IdentityErrors.lastSignInMethod(LABEL));

    const removed = await deps.connectedAccounts.unlink(userId, PROVIDER);
    if (!removed) return err(IdentityErrors.providerNotConnected(LABEL));

    return ok(undefined);
  };
}

export type DisconnectGoogle = ReturnType<typeof createDisconnectGoogle>;
