import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE_NAME } from '@/modules/identity/server';

/**
 * Sends signed-out visitors to the login screen with a usable return path.
 *
 * ── This is not the authorisation check ─────────────────────────────────────────
 * All it does is look for the *presence* of a session cookie. It does not unseal
 * it, does not validate it, and does not consult the database — a forged cookie
 * with any value at all gets past this.
 *
 * The real check is `requireUser()` in the `(platform)` and `(admin)` layouts,
 * which unseals the cookie, loads the session, and enforces revocation, expiry
 * and role. That runs on every request regardless of what happens here, so
 * removing this file would cost a nicer redirect and nothing else.
 *
 * Why have it at all: proxy is the only place that reliably knows the path being
 * requested. A layout cannot read it, so the guard there has to hardcode a
 * return path — which is why `/app/portfolio` used to bounce you to `/app`
 * after signing in rather than to the page you asked for.
 *
 * The proxy runs before rendering and is deployed to the edge in some
 * environments, so it deliberately does no crypto and touches no database.
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE_NAME);
  if (hasSession) return NextResponse.next();

  const login = new URL('/login', request.url);
  // Path plus query, so a deep link with filters survives the round trip.
  login.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);

  return NextResponse.redirect(login);
}

export const config = {
  // Only the signed-in surfaces. Marketing pages must stay reachable, and the
  // auth routes themselves obviously cannot require a session.
  matcher: ['/app/:path*', '/admin/:path*'],
};
