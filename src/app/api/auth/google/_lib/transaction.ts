import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

/**
 * The short-lived state of one trip to Google.
 *
 * ── Why it is a cookie and not a row ──────────────────────────────────────────
 * All three values exist to tie the response to *this browser's* request, which a
 * cookie does by definition and a database row would have to reconstruct with a key
 * carried through the redirect — one more thing to get wrong. It lasts ten minutes,
 * is `httpOnly`, and is scoped to the callback path so it is not sent anywhere else.
 *
 * ── What each value stops ─────────────────────────────────────────────────────
 * `state` is compared on return: without it, an attacker can feed their own
 * authorization code to a victim's browser and quietly log them into the attacker's
 * account — login CSRF. `nonce` is checked inside the id_token, so a token obtained
 * elsewhere cannot be replayed into this sign-in. `codeVerifier` is the PKCE secret
 * that makes a stolen code useless to anyone who does not hold it.
 *
 * `sameSite: 'lax'` is required rather than incidental: the callback arrives as a
 * top-level GET navigation from Google, and `strict` would withhold the cookie on
 * exactly that hop, which would make every sign-in fail the state check.
 */

export const OAUTH_COOKIE = 'novex_oauth';

const LIFETIME_SECONDS = 10 * 60;

/** Sign-in from a login screen, or connecting Google to an account already signed in. */
export type OAuthMode = 'sign-in' | 'link';

export interface OAuthTransaction {
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
  readonly mode: OAuthMode;
  /** Same-site path to land on afterwards. Already validated. */
  readonly next: string;
}

export function createTransaction(mode: OAuthMode, next: string): OAuthTransaction {
  return {
    state: randomBytes(32).toString('base64url'),
    nonce: randomBytes(32).toString('base64url'),
    codeVerifier: randomBytes(32).toString('base64url'),
    mode,
    next,
  };
}

/** S256, which is the only challenge method this sends and Google accepts. */
export function codeChallengeFor(transaction: OAuthTransaction): string {
  return createHash('sha256').update(transaction.codeVerifier).digest('base64url');
}

export function cookieOptionsFor(): {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth/google',
    maxAge: LIFETIME_SECONDS,
  };
}

export function encodeTransaction(transaction: OAuthTransaction): string {
  return Buffer.from(JSON.stringify(transaction), 'utf8').toString('base64url');
}

/** Returns null for anything that is not a transaction this server wrote. */
export function decodeTransaction(raw: string | undefined): OAuthTransaction | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;

    const { state, nonce, codeVerifier, mode, next } = parsed as Record<string, unknown>;
    if (typeof state !== 'string' || state.length === 0) return null;
    if (typeof nonce !== 'string' || nonce.length === 0) return null;
    if (typeof codeVerifier !== 'string' || codeVerifier.length === 0) return null;
    if (mode !== 'sign-in' && mode !== 'link') return null;

    return { state, nonce, codeVerifier, mode, next: safeNext(typeof next === 'string' ? next : null) };
  } catch {
    return null;
  }
}

/**
 * Where to land afterwards, restricted to this site.
 *
 * The same rule the sign-in form applies to its `next` field: anything that is not
 * a single-slash absolute path turns this into an open redirect, which is a
 * phishing primitive — a real Novex link that ends on somebody else's copy of it.
 */
export function safeNext(raw: string | null): string {
  const value = raw ?? '';
  if (!value.startsWith('/') || value.startsWith('//')) return '/app';
  return value;
}
