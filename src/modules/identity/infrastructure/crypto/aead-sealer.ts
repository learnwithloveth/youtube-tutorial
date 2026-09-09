import 'server-only';

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

import type { SessionId } from '../../domain/session';
import type { Digest, SessionSealer } from '../../application/ports';

/**
 * Sealed session cookies using AES-256-GCM.
 *
 * ── Why authenticated encryption, not a signed id ───────────────────────────────
 * GCM provides confidentiality *and* integrity in one primitive. A tampered cookie
 * fails the authentication tag and decryption throws — it cannot silently decode to
 * a different session id. A bare HMAC-signed plaintext id would also be tamper-
 * evident, but it publishes the id; encrypting keeps the cookie fully opaque.
 *
 * ── Format ──────────────────────────────────────────────────────────────────────
 *   v1.<iv-b64url>.<tag-b64url>.<ciphertext-b64url>
 *
 * The version prefix exists so the key or algorithm can be rotated without
 * invalidating every live session on deploy: a future v2 reader can still accept v1
 * cookies during a migration window.
 *
 * ── Key handling ────────────────────────────────────────────────────────────────
 * The encryption key is derived from SESSION_SECRET with HKDF rather than used
 * directly, so the same secret can safely produce several independent keys (here:
 * one for sealing, one for digests) without them being related.
 */

const VERSION = 'v1';
const IV_LENGTH = 12; // 96 bits, the standard nonce size for GCM
const TAG_LENGTH = 16;

function b64url(buffer: Buffer): string {
  return buffer.toString('base64url');
}

function fromB64url(value: string): Buffer | null {
  try {
    return Buffer.from(value, 'base64url');
  } catch {
    return null;
  }
}

/** Derives a purpose-bound 32-byte key, so one secret yields independent keys. */
function deriveKey(secret: string, purpose: string): Buffer {
  return Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.alloc(0), purpose, 32));
}

export class AeadSessionSealer implements SessionSealer {
  private readonly key: Buffer;

  constructor(secret: string) {
    if (secret.length < 32) {
      // Fail at construction, not on the first login attempt.
      throw new Error('SESSION_SECRET must be at least 32 characters');
    }
    this.key = deriveKey(secret, 'novex:session:seal:v1');
  }

  async seal(sessionId: SessionId): Promise<string> {
    // A fresh random IV per seal. Reusing a nonce under the same key is
    // catastrophic for GCM — it leaks the keystream.
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);

    const ciphertext = Buffer.concat([
      cipher.update(sessionId, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return [VERSION, b64url(iv), b64url(tag), b64url(ciphertext)].join('.');
  }

  async unseal(sealed: string): Promise<SessionId | null> {
    const parts = sealed.split('.');
    if (parts.length !== 4 || parts[0] !== VERSION) return null;

    const iv = fromB64url(parts[1]!);
    const tag = fromB64url(parts[2]!);
    const ciphertext = fromB64url(parts[3]!);

    if (iv === null || tag === null || ciphertext === null) return null;
    if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) return null;

    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        // Throws if the authentication tag does not verify — i.e. on any tampering.
        decipher.final(),
      ]);
      return plaintext.toString('utf8') as SessionId;
    } catch {
      // Tampered, truncated, or encrypted under a rotated key. All are "no session".
      return null;
    }
  }
}

/**
 * Keyed one-way digest for values we must correlate but must not store in the clear
 * (IP addresses, user-agent strings).
 *
 * Keyed rather than a plain hash: the input spaces are small enough to enumerate.
 * An unkeyed SHA-256 of an IPv4 address is reversible by brute force in seconds.
 */
export class HmacDigest implements Digest {
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = deriveKey(secret, 'novex:identity:digest:v1');
  }

  hash(value: string): string {
    return createHmac('sha256', this.key).update(value).digest('base64url').slice(0, 32);
  }
}
