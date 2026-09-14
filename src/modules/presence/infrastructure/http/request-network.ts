import 'server-only';

import type { NetworkContext } from '../../application/ports';
import { normaliseAddress } from '../geo/address';
import { EDGE_HINT_HEADERS } from '../geo/edge-hint-locator';

/**
 * Turns a request's headers into the envelope the presence use cases take.
 *
 * Exported from the module's server barrel so a route handler can call it without
 * knowing which headers carry a client address — that list changes with the
 * deployment, and a route handler that hardcoded it would have to be edited to
 * move hosts.
 *
 * ── Trusting a forwarded address ───────────────────────────────────────────────
 * `x-forwarded-for` is client-settable. Anyone can send one, so a naive read of it
 * lets a visitor choose which country they appear in on the console.
 *
 * What makes it trustworthy here is the deployment shape, not the header: a proxy
 * that terminates the connection *appends* the real peer address, so the value we
 * want is the last hop the proxy added, and the entries before it are whatever the
 * client made up. This reads the **rightmost** entry for that reason. Behind two
 * or more trusted proxies the rightmost is the inner proxy rather than the client,
 * which is why vendor-specific single-value headers are preferred first: they are
 * set by the terminating network and cannot be appended to.
 *
 * The consequence of getting this wrong is a wrong flag on an ops dashboard rather
 * than an authorisation decision — nothing in this application grants access by
 * address — but "it only mislabels a dashboard" is how a header ends up trusted
 * somewhere that does matter later.
 */

/**
 * Single-value address headers, set by the terminating network.
 *
 * Preferred over `x-forwarded-for` because they are not a list and therefore have
 * no client-controlled prefix to strip.
 */
const TRUSTED_ADDRESS_HEADERS = [
  'cf-connecting-ip',
  'true-client-ip',
  'x-real-ip',
  'fly-client-ip',
  'x-client-ip',
] as const;

/** Exactly the geo headers the edge adapter reads. Everything else is left behind. */
const HINT_HEADERS = new Set(EDGE_HINT_HEADERS);

export function networkContextFrom(headers: Headers): NetworkContext {
  return {
    ip: clientAddressFrom(headers),
    userAgent: headers.get('user-agent'),
    hints: geoHintsFrom(headers),
  };
}

function clientAddressFrom(headers: Headers): string | null {
  for (const name of TRUSTED_ADDRESS_HEADERS) {
    const value = headers.get(name);
    if (value !== null) {
      const address = normaliseAddress(value.split(',')[0] ?? value);
      if (address !== null) return address;
    }
  }

  const forwarded = headers.get('x-forwarded-for');
  if (forwarded !== null) {
    const hops = forwarded.split(',');
    // Rightmost, not leftmost: see the note above. The leftmost entry is the one
    // a client can write for itself.
    const last = hops[hops.length - 1];
    if (last !== undefined) {
      const address = normaliseAddress(last);
      if (address !== null) return address;
    }
  }

  // RFC 7239. Rare, but it is the standardised spelling and costs one branch.
  const standard = headers.get('forwarded');
  if (standard !== null) {
    const match = /for=("?\[?[^;,"\]]+\]?"?)/i.exec(standard);
    const candidate = match?.[1]?.replace(/"/g, '');
    if (candidate !== undefined) {
      const address = normaliseAddress(candidate);
      if (address !== null) return address;
    }
  }

  return null;
}

/**
 * Copies the geo-bearing headers into a plain record.
 *
 * An allowlisted copy rather than the whole `Headers` object, because the adapters
 * downstream have no business reading a cookie or an authorization header, and the
 * cheapest way to guarantee they cannot is to not hand them one. A prefix match
 * would be shorter and would sweep up `cf-connecting-ip` along with the geo
 * headers, putting a raw address somewhere nothing needs it.
 */
function geoHintsFrom(headers: Headers): Record<string, string> {
  const hints: Record<string, string> = {};

  headers.forEach((value, key) => {
    const name = key.toLowerCase();
    if (HINT_HEADERS.has(name)) hints[name] = value;
  });

  return hints;
}
