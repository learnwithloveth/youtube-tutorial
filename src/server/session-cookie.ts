import 'server-only';

/**
 * Attributes for the session cookie.
 *
 * One definition, because every one of these is a security property and a second
 * copy is how one of them quietly goes missing. The Server Actions that sign
 * somebody in and the Google callback that does the same both come here.
 *
 * `httpOnly` keeps the session out of reach of any script on the page, which is what
 * limits the damage of an XSS bug to the current page rather than the account.
 * `sameSite: 'lax'` blocks the cookie on cross-site POSTs — the CSRF class — while
 * still allowing ordinary top-level navigation back into the site from a link, which
 * is also what lets the provider's redirect arrive with it. `secure` is conditional
 * only so that plain-HTTP localhost works in development.
 */
export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  };
}
