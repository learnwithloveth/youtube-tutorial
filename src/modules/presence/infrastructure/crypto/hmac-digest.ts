import 'server-only';

import { createHmac, hkdfSync } from 'node:crypto';

import type { Digest } from '../../application/ports';

/**
 * Keyed digest for the connecting address.
 *
 * ── Why keyed, and not a plain hash ────────────────────────────────────────────
 * The entire IPv4 space is 4.3 billion values. A plain SHA-256 of an address is
 * therefore not a one-way function in any useful sense — the whole space can be
 * enumerated on a laptop in minutes, so `sha256(ip)` stored in a table is the
 * address stored in a table with extra steps. An HMAC under a key the database does
 * not contain closes that: a dump of `pr_presence` yields digests nobody can invert
 * without also taking the application's secret.
 *
 * ── Why its own derived key ───────────────────────────────────────────────────
 * Derived from the root secret with HKDF under a label of its own, so a presence
 * digest and an identity digest of the same address are unrelated values. Sharing
 * one key would let anyone holding both tables join them on the digest and rebuild
 * the mapping the digest exists to break.
 *
 * Truncated to 32 characters for the same reason `id_sessions.ip_hash` is: the
 * value only has to be collision-resistant enough to correlate tabs, and a shorter
 * column is a smaller thing to leak.
 */
export class HmacAddressDigest implements Digest {
  private readonly key: Buffer;

  constructor(secret: string) {
    if (secret.length < 32) {
      // Fail at construction rather than on the first visitor of the day.
      throw new Error('The presence digest secret must be at least 32 characters');
    }
    this.key = Buffer.from(
      hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.alloc(0), 'novex:presence:digest:v1', 32),
    );
  }

  hash(value: string): string {
    return createHmac('sha256', this.key).update(value).digest('base64url').slice(0, 32);
  }
}
