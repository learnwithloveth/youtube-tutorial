'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { presentIdentityError } from '@/modules/identity';
import { logger } from '@/platform/observability/logger';
import { recordActivity } from '@/server/activity';
import { getCurrentUser, identity, revokeAllSessions, SESSION_COOKIE } from '@/server/auth';
import { describeRequest } from '@/server/request-context';
import { isCountryCode } from '@/shared/lib/countries';
import type { UserId } from '@/shared/kernel/ids';

import type { ProfileFormState } from './form-state';

/**
 * Ends every session on the account.
 *
 * ── It signs the caller out too, deliberately ──────────────────────────────────
 * Somebody who believes their account is compromised should not have to work out
 * which device they are currently on, and the session left alive would be the one
 * that might not be theirs. So all of them go and the caller lands on the login
 * page — which is also the clearest possible confirmation that it worked.
 *
 * A Server Action rather than a link, because this is a mutation: a GET that ends
 * every session on an account can be triggered by any `<img>` tag on any site.
 */
export async function revokeAllSessionsAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const revoked = await revokeAllSessions();

  const request = await describeRequest();
  await recordActivity({
    userId: user.id as UserId,
    kind: 'sign-out',
    detail: `signed out of ${revoked} ${revoked === 1 ? 'session' : 'sessions'}`,
    location: request.location,
    agent: request.agent,
    ipDigest: request.ipDigest,
  });

  logger.info({ event: 'sessions_revoked', module: 'identity', revoked });

  // The rows are already revoked, so the cookie is inert — clearing it only saves
  // the next request a pointless lookup.
  (await cookies()).delete(SESSION_COOKIE);

  redirect('/login?signedout=1');
}

/**
 * Saves the display name and handle.
 *
 * ── The action re-derives its own authority ────────────────────────────────────
 * A Server Action is a public endpoint. The page that rendered this form protects
 * nothing, so the session is read again here and the id comes from it — never from
 * the form, where a hidden field naming somebody else's account would otherwise be
 * an edit anyone could make.
 *
 * ── Only the fields the form actually rendered ─────────────────────────────────
 * Each value is passed as `undefined` when absent rather than as an empty string,
 * because the entity treats empty as "clear this" and absent as "leave it". A form
 * that grows a third field must not wipe the two it did not show.
 */
export async function updateProfileAction(
  _state: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const displayName = formData.get('displayName');
  const handle = formData.get('handle');
  const country = formData.get('country');
  const phone = formData.get('phone');

  // Membership in the list is checked here, where the list lives; the entity checks
  // the shape. An empty string clears the field, which is what "Not set" submits.
  if (typeof country === 'string' && country !== '' && !isCountryCode(country)) {
    return { status: 'error', message: 'Choose a country from the list.' };
  }

  const result = await identity().updateProfile({
    userId: user.id,
    displayName: typeof displayName === 'string' ? displayName : undefined,
    handle: typeof handle === 'string' ? handle : undefined,
    country: typeof country === 'string' ? country : undefined,
    phone: typeof phone === 'string' ? phone : undefined,
  });

  if (!result.ok) {
    return { status: 'error', message: presentIdentityError(result.error) };
  }

  logger.info({ event: 'profile_updated', module: 'identity', userId: user.id });

  // The name is in the top bar and the sidebar of every page under `(platform)`,
  // all of which render from the layout. Revalidating the segment is what makes the
  // change appear everywhere at once instead of only on this screen.
  revalidatePath('/app', 'layout');

  return { status: 'saved', message: 'Saved.', name: result.value.name };
}
