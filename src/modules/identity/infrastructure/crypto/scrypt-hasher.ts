import 'server-only';

import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

import { PasswordHash } from '../../domain/password';
import type { PasswordHasher } from '../../application/ports';

/**
 * Hand-rolled promise wrapper rather than `promisify(scrypt)`.
 *
 * `promisify` resolves to scrypt's 3-argument overload, so passing `options` (which
 * is how the cost parameters are set at all) fails to typecheck. Wrapping it
 * explicitly keeps the options argument and its types intact.
 */
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

/**
 * Password hashing with Node's built-in scrypt.
 *
 * ── Why scrypt and not a library ────────────────────────────────────────────────
 * Argon2id is the first choice in most guidance, but every Node implementation is a
 * native addon — a compile step, platform-specific binaries, and a supply-chain
 * dependency in the most security-critical path in the system. scrypt is memory-hard,
 * is listed by OWASP as an acceptable alternative when Argon2id is unavailable, and
 * ships **inside Node**. Zero dependencies, which also matches this project's
 * no-paid-services constraint.
 *
 * ── Parameters ──────────────────────────────────────────────────────────────────
 * N=2^16, r=8, p=1 costs roughly 64 MB and ~100ms per hash. That is the point: the
 * cost is what makes an offline attack against a stolen database expensive. It also
 * means this must never run inside a render — only in a Server Action or route
 * handler, and always behind a rate limit.
 *
 * ── Encoding ────────────────────────────────────────────────────────────────────
 *   scrypt$N$r$p$<salt-b64>$<key-b64>
 *
 * Self-describing on purpose. Raising the cost later leaves existing hashes
 * verifiable against their own recorded parameters, and `needsRehash` flags them for
 * transparent upgrade at next login. Without this, changing parameters means a
 * forced password reset for every user.
 */

const ALGORITHM = 'scrypt';
const CURRENT_N = 2 ** 16;
const CURRENT_R = 8;
const CURRENT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * scrypt needs `maxmem` above roughly 128 * N * r bytes, and Node's default is
 * 32 MB — below what N=2^16 requires, so it would throw without this.
 */
const MAX_MEM = 256 * 1024 * 1024;

interface ParsedHash {
  n: number;
  r: number;
  p: number;
  salt: Buffer;
  key: Buffer;
}

function parse(encoded: string): ParsedHash | null {
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== ALGORITHM) return null;

  const n = Number.parseInt(parts[1]!, 10);
  const r = Number.parseInt(parts[2]!, 10);
  const p = Number.parseInt(parts[3]!, 10);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return null;

  try {
    return {
      n,
      r,
      p,
      salt: Buffer.from(parts[4]!, 'base64'),
      key: Buffer.from(parts[5]!, 'base64'),
    };
  } catch {
    return null;
  }
}

export class ScryptPasswordHasher implements PasswordHasher {
  async hash(plaintext: string): Promise<PasswordHash> {
    const salt = randomBytes(SALT_LENGTH);
    const key = await scryptAsync(plaintext.normalize('NFKC'), salt, KEY_LENGTH, {
      N: CURRENT_N,
      r: CURRENT_R,
      p: CURRENT_P,
      maxmem: MAX_MEM,
    });

    return PasswordHash.fromEncoded(
      [
        ALGORITHM,
        CURRENT_N,
        CURRENT_R,
        CURRENT_P,
        salt.toString('base64'),
        key.toString('base64'),
      ].join('$'),
    );
  }

  async verify(plaintext: string, hash: PasswordHash): Promise<boolean> {
    const parsed = parse(hash.encoded);
    if (parsed === null) return false;

    let derived: Buffer;
    try {
      derived = await scryptAsync(plaintext.normalize('NFKC'), parsed.salt, parsed.key.length, {
        N: parsed.n,
        r: parsed.r,
        p: parsed.p,
        maxmem: MAX_MEM,
      });
    } catch {
      return false;
    }

    // Length is checked first because timingSafeEqual throws on a mismatch. The
    // length of a stored hash is not secret, so this leaks nothing.
    if (derived.length !== parsed.key.length) return false;
    return timingSafeEqual(derived, parsed.key);
  }

  /** True when the stored hash used weaker parameters than current policy. */
  needsRehash(hash: PasswordHash): boolean {
    const parsed = parse(hash.encoded);
    if (parsed === null) return true;
    return parsed.n < CURRENT_N || parsed.r < CURRENT_R || parsed.p < CURRENT_P;
  }
}
