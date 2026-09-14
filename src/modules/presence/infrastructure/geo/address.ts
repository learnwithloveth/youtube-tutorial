import 'server-only';

/**
 * Address handling shared by the geo adapters.
 *
 * The one rule everything here serves: an address that cannot correspond to a
 * place must never be sent to a lookup service. Doing so leaks internal network
 * topology to a third party and cannot produce an answer anyway, so it is a
 * privacy cost with a guaranteed zero return.
 *
 * This matters more than it looks like in development, where every request comes
 * from `::1` and the naive version happily posts it to a public API.
 */

/** Strips an IPv6 zone and an IPv4 port, and normalises IPv4-mapped IPv6. */
export function normaliseAddress(raw: string): string | null {
  let value = raw.trim();
  if (value.length === 0 || value.length > 64) return null;

  // `[::1]:3000` — the bracketed form some proxies use for IPv6 with a port.
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value);
  if (bracketed?.[1] !== undefined) value = bracketed[1];

  // A trailing `:port` on a bare IPv4. Never done to IPv6, which is why the
  // colon count is what distinguishes the two cases.
  if (value.split(':').length === 2 && value.includes('.')) {
    value = value.split(':')[0] ?? value;
  }

  // `fe80::1%eth0` — the scope zone is local to the sending host and meaningless
  // to us.
  const zone = value.indexOf('%');
  if (zone !== -1) value = value.slice(0, zone);

  // `::ffff:203.0.113.4` is an IPv4 address wearing an IPv6 shape. Unwrapping it
  // is what lets the IPv4 rules below actually apply to it.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(value);
  if (mapped?.[1] !== undefined) value = mapped[1];

  return value.length > 0 ? value.toLowerCase() : null;
}

/**
 * Whether an address belongs to a range that cannot be geolocated.
 *
 * Covers private, loopback, link-local, carrier-grade NAT, multicast and reserved
 * space. Carrier-grade NAT (100.64/10) is the one that is easy to miss and is not
 * rare — it is what a mobile network hands out, and it resolves to the carrier's
 * infrastructure rather than to anywhere a person is.
 */
export function isPrivateAddress(raw: string): boolean {
  const address = normaliseAddress(raw);
  if (address === null) return true;

  if (address.includes(':')) return isPrivateV6(address);

  const octets = address.split('.');
  if (octets.length !== 4) return true;

  const parts = octets.map((octet) => Number(octet));
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;

  const [a = 0, b = 0] = parts;

  if (a === 0) return true; // "this network"
  if (a === 10) return true; // RFC 1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC 1918
  if (a === 192 && b === 168) return true; // RFC 1918
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast and reserved

  return false;
}

function isPrivateV6(address: string): boolean {
  if (address === '::' || address === '::1') return true;

  const first = address.split(':')[0] ?? '';
  if (first.length === 0) return false;

  const block = Number.parseInt(first.padEnd(4, '0'), 16);
  if (!Number.isFinite(block)) return true;

  // fc00::/7 — unique local addresses.
  if (block >= 0xfc00 && block <= 0xfdff) return true;
  // fe80::/10 — link-local.
  if (block >= 0xfe80 && block <= 0xfebf) return true;
  // ff00::/8 — multicast.
  if (block >= 0xff00) return true;

  return false;
}
