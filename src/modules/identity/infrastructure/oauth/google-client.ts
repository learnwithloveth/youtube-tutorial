import 'server-only';

import type { OAuthClient, ProviderProfile } from '../../application/ports';

/**
 * Google as an identity provider, over the authorization-code flow with PKCE.
 *
 * ── Why the ID token's signature is not checked here ──────────────────────────
 * The token is not read out of a URL or a header, where anybody could have put it.
 * It is the body of a response to a request this server made itself, to Google's
 * token endpoint, over TLS, authenticated with the client secret. OpenID Connect
 * Core §3.1.3.7 says exactly this case may rely on TLS server validation instead of
 * verifying the signature, which is why there is no JWKS fetch, no key cache and no
 * JWT library in this file.
 *
 * What still has to be checked is what the token *says*, because a valid token
 * issued for somebody else's application would otherwise be accepted: `aud` must be
 * this client, `iss` must be Google, it must not have expired, and `nonce` must be
 * the one this browser's sign-in generated. That last one is what stops a token
 * captured elsewhere from being replayed into somebody else's session.
 *
 * ── Why PKCE, on a confidential client ───────────────────────────────────────
 * The secret already stops a stolen code being exchanged by somebody else, so PKCE
 * is belt and braces — but the belt is cheap, and it also covers the case where the
 * redirect lands somewhere it should not have.
 */

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  /** Must match a redirect URI registered on the Google client, exactly. */
  redirectUri: string;
}

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

interface GoogleClaims {
  readonly iss?: unknown;
  readonly aud?: unknown;
  readonly exp?: unknown;
  readonly sub?: unknown;
  readonly nonce?: unknown;
  readonly email?: unknown;
  readonly email_verified?: unknown;
  readonly given_name?: unknown;
  readonly family_name?: unknown;
  readonly name?: unknown;
}

export class GoogleOAuthClient implements OAuthClient {
  constructor(private readonly config: GoogleOAuthConfig) {}

  authorizationUrl(input: { state: string; nonce: string; codeChallenge: string }): string {
    const url = new URL(AUTHORIZATION_ENDPOINT);
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('response_type', 'code');
    // `profile` was left out while there was nowhere to put a name. Sign-up now
    // asks every other account holder for one, and an account created here was the
    // only kind that arrived without one — leaving somebody to fill in a field they
    // had just handed to Google. The picture that comes with the scope is ignored.
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', input.state);
    url.searchParams.set('nonce', input.nonce);
    url.searchParams.set('code_challenge', input.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    // Always offer the chooser. Silently reusing whichever Google account the
    // browser last used is how somebody signs in as the wrong person on a shared
    // machine and cannot work out why.
    url.searchParams.set('prompt', 'select_account');
    return url.toString();
  }

  async exchange(input: {
    code: string;
    codeVerifier: string;
    nonce: string;
  }): Promise<ProviderProfile> {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: input.code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: input.codeVerifier,
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      // The body carries Google's own error code, which is the difference between
      // "this code was already used" and "the secret is wrong" when reading logs.
      throw new Error(
        `Google refused the code exchange (${response.status}): ${await safeBody(response)}`,
      );
    }

    const payload: unknown = await response.json();
    const idToken = readString(payload, 'id_token');
    if (idToken === null) throw new Error('Google returned no id_token.');

    return this.profileFrom(idToken, input.nonce);
  }

  private profileFrom(idToken: string, expectedNonce: string): ProviderProfile {
    const claims = decodeClaims(idToken);

    if (typeof claims.iss !== 'string' || !ISSUERS.has(claims.iss)) {
      throw new Error('The id_token was not issued by Google.');
    }
    if (claims.aud !== this.config.clientId) {
      throw new Error('The id_token was issued for a different application.');
    }
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) {
      throw new Error('The id_token has expired.');
    }
    if (claims.nonce !== expectedNonce) {
      throw new Error('The id_token does not answer this sign-in request.');
    }

    const sub = typeof claims.sub === 'string' ? claims.sub : '';
    const email = typeof claims.email === 'string' ? claims.email : '';
    if (sub === '' || email === '') {
      throw new Error('The id_token carries no subject or address.');
    }

    const [firstName, lastName] = nameFrom(claims);

    return {
      providerAccountId: sub,
      email,
      // Google sends a boolean; some providers send the string. Anything else is
      // treated as unverified, which is the safe direction to be wrong in.
      emailVerified: claims.email_verified === true || claims.email_verified === 'true',
      ...(firstName === undefined ? {} : { firstName }),
      ...(lastName === undefined ? {} : { lastName }),
    };
  }
}

/**
 * The name, in two halves.
 *
 * `given_name` and `family_name` when Google sends them, which it does for most
 * accounts. Otherwise `name` is split on the last space: an imperfect guess, but
 * the alternative is putting somebody's full name in the first-name box, and both
 * are corrected in the same place — Settings.
 *
 * Nothing is invented. An account with a single-word name gives a first name and no
 * last, and one with neither gives neither.
 */
export function nameFrom(claims: {
  given_name?: unknown;
  family_name?: unknown;
  name?: unknown;
}): [string | undefined, string | undefined] {
  const text = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.replace(/\s+/g, ' ').trim();
    return trimmed.length === 0 ? undefined : trimmed;
  };

  const given = text(claims.given_name);
  const family = text(claims.family_name);
  if (given !== undefined || family !== undefined) return [given, family];

  const whole = text(claims.name);
  if (whole === undefined) return [undefined, undefined];

  const split = whole.lastIndexOf(' ');
  return split === -1
    ? [whole, undefined]
    : [whole.slice(0, split), whole.slice(split + 1)];
}

/** The payload of a JWT, with no signature check — see the note at the top. */
function decodeClaims(idToken: string): GoogleClaims {
  const payload = idToken.split('.')[1];
  if (payload === undefined) throw new Error('The id_token is not a JWT.');

  const json = Buffer.from(payload, 'base64url').toString('utf8');
  const claims: unknown = JSON.parse(json);
  if (typeof claims !== 'object' || claims === null) {
    throw new Error('The id_token payload is not an object.');
  }
  return claims as GoogleClaims;
}

function readString(payload: unknown, key: string): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

async function safeBody(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return '<unreadable>';
  }
}
