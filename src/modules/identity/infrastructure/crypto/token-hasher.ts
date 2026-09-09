import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

import { TOKEN_ENTROPY_BYTES } from '../../domain/verification-token';
import type { VerificationTokenHasher } from '../../application/ports';

/**
 * Generates verification tokens and digests them for storage.
 *
 * ── Why SHA-256 here and scrypt for passwords ───────────────────────────────────
 * The two are solving different problems, and using the same tool for both loses
 * one of the properties.
 *
 * A password is low-entropy and human-chosen, so a stolen hash *can* be attacked by
 * guessing. Making each guess cost ~100ms and 64MB is what defeats that.
 *
 * A token here is 32 bytes from the platform CSPRNG — 256 bits. There is no guessing
 * attack to slow down: an attacker would need to try 2^255 values on average, and no
 * cost factor changes that outcome. What the digest is for is ensuring a *database
 * leak* yields nothing usable, and a single fast hash achieves that completely.
 *
 * Using scrypt would add 100ms to every click of a verification link, and to every
 * scanner that prefetches one, for no security gain.
 *
 * The digest is unkeyed, unlike `HmacDigest`. That one keys its hashes because IP
 * addresses and user agents come from a small enumerable space; a 256-bit random
 * token does not.
 */
export class Sha256TokenHasher implements VerificationTokenHasher {
  generate(): { token: string; tokenHash: string } {
    // base64url so the value is safe in a query string with no escaping.
    const token = randomBytes(TOKEN_ENTROPY_BYTES).toString('base64url');
    return { token, tokenHash: this.hash(token) };
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('base64url');
  }
}
