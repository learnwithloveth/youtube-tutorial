'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { presentIdentityError } from '@/modules/identity';
import { logger } from '@/platform/observability/logger';
import { recordActivity } from '@/server/activity';
import { getCurrentUser, identity, SESSION_COOKIE } from '@/server/auth';
import { recordAndPush } from '@/server/push';
import { describeRequest } from '@/server/request-context';
import type { UserId } from '@/shared/kernel/ids';

import type { SecurityFormState } from './form-state';

/**
 * The security tab's write boundary: the password, and the Google connection.
 *
 * Each re-derives its own authority. A Server Action is a public endpoint, so the
 * page that rendered the form protects nothing — and the account acted on is always
 * the one in the session, never an id from the form.
 */

/**
 * Sets or replaces the account's password.
 *
 * The two passwords are compared here rather than in the use case: "the boxes
 * differ" is a property of this form, and an API client posting one password should
 * not have to send it twice.
 *
 * The current password is never logged, and neither is the reason a change was
 * refused beyond its tag — "CurrentPasswordIncorrect" in a log line is a fact about
 * an attempt, while the value that failed is a credential.
 */
export async function changePasswordAction(
  _previous: SecurityFormState,
  formData: FormData,
): Promise<SecurityFormState> {
  const user = await getCurrentUser();
  if (!user) return { status: 'error', message: 'Your session has ended. Sign in again.' };

  const newPassword = String(formData.get('newPassword') ?? '');
  const confirmation = String(formData.get('confirmPassword') ?? '');
  if (newPassword !== confirmation) {
    return { status: 'error', message: 'The two passwords do not match.' };
  }

  const current = formData.get('currentPassword');
  const sealed = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sealed) return { status: 'error', message: 'Your session has ended. Sign in again.' };

  const result = await identity().changePassword({
    userId: user.id,
    currentPassword: typeof current === 'string' && current.length > 0 ? current : null,
    newPassword,
    sealedSession: sealed,
  });

  if (!result.ok) {
    logger.info({ event: 'password_change_rejected', module: 'identity', reason: result.error._tag });
    return { status: 'error', message: presentIdentityError(result.error) };
  }

  // Pushed: a password changed is what every *other* device on the account needs
  // to hear about, in case the person changing it is not the owner.
  await trail(user.id, 'password-reset', 'changed from settings', { push: true });

  logger.info({
    event: 'password_changed',
    module: 'identity',
    revokedSessions: result.value.revokedSessions,
  });

  revalidatePath('/app/settings');

  const others = result.value.revokedSessions;
  return {
    status: 'saved',
    message:
      others === 0
        ? 'Password updated.'
        : `Password updated. ${others} other ${others === 1 ? 'session was' : 'sessions were'} signed out.`,
  };
}

/**
 * Removes the Google connection.
 *
 * Refused when it is the only way in — see `createDisconnectGoogle`. That check
 * lives in the use case rather than here because it is a rule about the account,
 * not about this screen, and a second caller must not be able to skip it.
 */
export async function disconnectGoogleAction(
  _previous: SecurityFormState,
  _formData: FormData,
): Promise<SecurityFormState> {
  const user = await getCurrentUser();
  if (!user) return { status: 'error', message: 'Your session has ended. Sign in again.' };

  const result = await identity().disconnectGoogle(user.id);
  if (!result.ok) {
    return { status: 'error', message: presentIdentityError(result.error) };
  }

  await trail(user.id, 'sign-in', 'disconnected Google');

  logger.info({ event: 'google_disconnected', module: 'identity' });
  revalidatePath('/app/settings');

  return { status: 'saved', message: 'Google disconnected.' };
}

/** Best effort, like every other trail write on a path that already succeeded. */
async function trail(
  userId: string,
  kind: 'password-reset' | 'sign-in',
  detail: string,
  options: { readonly push?: boolean } = {},
): Promise<void> {
  try {
    const request = await describeRequest();
    const record = options.push === true ? recordAndPush : recordActivity;
    await record({
      userId: userId as UserId,
      kind,
      detail,
      location: request.location,
      agent: request.agent,
      ipDigest: request.ipDigest,
    });
  } catch {
    logger.warn({ event: 'security_trail_write_skipped', module: 'identity' });
  }
}
