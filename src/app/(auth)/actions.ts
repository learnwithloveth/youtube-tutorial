'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { presentIdentityError } from '@/modules/identity';
import { logger } from '@/platform/observability/logger';
import { getCurrentUser, identity, SESSION_COOKIE } from '@/server/auth';

import type { AuthFormState } from './_lib/form-state';

/**
 * Server Actions for the identity flows.
 *
 * This is the write boundary. Every mutation the auth screens perform goes through
 * one of these, and each one re-derives its own authority rather than trusting the
 * page that rendered the form — a page-level check does not protect an action, which
 * can be invoked directly by anyone who can read the page's JavaScript.
 *
 * All of them take `FormData` and return a state object, which is the shape
 * `useActionState` wants. That lets the forms work before hydration: a submit on a
 * slow connection posts the form and gets a server-rendered response, rather than
 * doing nothing until JavaScript arrives.
 */

/**
 * Cookie attributes.
 *
 * `httpOnly` keeps the session out of reach of any script on the page, which is
 * what limits the damage of an XSS bug to the current page rather than the account.
 * `sameSite: 'lax'` blocks the cookie on cross-site POSTs — the CSRF class — while
 * still allowing ordinary top-level navigation back into the site from a link.
 * `secure` is conditional only so that plain-HTTP localhost works in development.
 */
function cookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  };
}

/** Request metadata, hashed before storage by the identity module. */
async function requestContext(): Promise<{ userAgent: string | null; ipAddress: string | null }> {
  const list = await headers();
  return {
    userAgent: list.get('user-agent'),
    // Behind a proxy this is the only view of the client address. It is
    // spoofable by anyone talking to the origin directly, which is why it is used
    // for a coarse fingerprint and never for authorisation.
    ipAddress: list.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
  };
}

/** Where a signed-in user goes when nothing else asked for a destination. */
const DEFAULT_SIGNED_IN_PATH = '/app';

function safeRedirectTarget(raw: FormDataEntryValue | null): string {
  const value = typeof raw === 'string' ? raw : '';
  // Only same-site absolute paths. Accepting anything else turns the `next`
  // parameter into an open redirect, which is a phishing primitive: a link to the
  // real login page that lands on an attacker's copy.
  if (!value.startsWith('/') || value.startsWith('//')) return DEFAULT_SIGNED_IN_PATH;
  return value;
}

export async function signUpAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const context = await requestContext();

  const result = await identity().registerUser({
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    ...context,
  });

  if (!result.ok) {
    logger.info({ event: 'signup_rejected', module: 'identity', reason: result.error._tag });
    return { error: presentIdentityError(result.error), message: null };
  }

  (await cookies()).set(
    SESSION_COOKIE,
    result.value.sealed,
    cookieOptions(new Date(result.value.expiresAt)),
  );

  // The design's onboarding continues into identity verification; that screen
  // ends at the dashboard. Outside the try/return flow on purpose: `redirect`
  // works by throwing, so it must not sit inside anything that catches.
  redirect('/verify-identity');
}

export async function signInAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const context = await requestContext();

  const result = await identity().authenticate({
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    ...context,
  });

  if (!result.ok) {
    logger.info({ event: 'signin_rejected', module: 'identity', reason: result.error._tag });
    return { error: presentIdentityError(result.error), message: null };
  }

  (await cookies()).set(
    SESSION_COOKIE,
    result.value.sealed,
    cookieOptions(new Date(result.value.expiresAt)),
  );

  redirect(safeRedirectTarget(formData.get('next')));
}

export async function signOutAction(): Promise<void> {
  const store = await cookies();
  const sealed = store.get(SESSION_COOKIE)?.value;

  // Revoked server-side, not merely cleared: a cookie an attacker already copied
  // would otherwise keep working until it expired.
  await identity().signOut(sealed);
  store.delete(SESSION_COOKIE);

  redirect('/');
}

export async function requestPasswordResetAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  await identity().requestPasswordReset(String(formData.get('email') ?? ''));

  // Always the same response, whether or not the address is registered. Reporting
  // "no such account" here would make this endpoint an account-enumeration oracle.
  return {
    error: null,
    message: 'If that address has an account, a reset link is on its way.',
  };
}

export async function resetPasswordAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = String(formData.get('password') ?? '');
  const confirmation = String(formData.get('confirmPassword') ?? '');

  // Checked here rather than in the use case: "the two boxes differ" is a property
  // of this form, not of the domain. An API client posting one password should not
  // have to send it twice.
  if (password !== confirmation) {
    return { error: 'The two passwords do not match.', message: null };
  }

  const result = await identity().resetPassword({
    token: String(formData.get('token') ?? ''),
    newPassword: password,
  });

  if (!result.ok) {
    logger.info({ event: 'reset_rejected', module: 'identity', reason: result.error._tag });
    return { error: presentIdentityError(result.error), message: null };
  }

  // Every session was revoked, including any the attacker held. The user signs in
  // again with the new password.
  redirect('/login?reset=1');
}

export async function resendVerificationAction(): Promise<AuthFormState> {
  const user = await getCurrentUser();

  // Re-derived here rather than trusting the caller: an action is a public endpoint.
  if (!user) return { error: 'Sign in to resend the confirmation link.', message: null };

  const result = await identity().resendVerification(user.id);
  if (!result.ok) {
    return { error: presentIdentityError(result.error), message: null };
  }

  return { error: null, message: 'Confirmation link sent. Check your inbox.' };
}
