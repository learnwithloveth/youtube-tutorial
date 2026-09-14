import 'server-only';

import { Coordinates, LocationFix, type Place } from '../../domain/location';
import type { LocationResolver, NetworkContext } from '../../application/ports';

/**
 * Location from the geo headers a CDN attaches to the request.
 *
 * ── Why this is tried before any lookup service ────────────────────────────────
 * It is free, it is instant, and it is first-hand. The network that terminated the
 * TLS connection knows which address it came from without being told, so there is
 * no third party on the request path, no rate limit, no API key, and nothing that
 * can be down. Where the app is deployed behind one of these, the lookup adapter
 * should essentially never run.
 *
 * Three vendors are recognised because those are the three that put a Next.js app
 * on the internet. An unrecognised CDN falls through to the lookup service rather
 * than producing a wrong answer, which is why this returns null rather than a
 * partially-filled place.
 */

interface HintMap {
  readonly country: string;
  readonly region: string;
  readonly city: string;
  readonly latitude: string;
  readonly longitude: string;
  readonly timezone: string;
  /** Vercel percent-encodes the city so a name like `S%C3%A3o%20Paulo` survives. */
  readonly encoded: boolean;
}

const VENDORS: readonly HintMap[] = [
  {
    country: 'x-vercel-ip-country',
    region: 'x-vercel-ip-country-region',
    city: 'x-vercel-ip-city',
    latitude: 'x-vercel-ip-latitude',
    longitude: 'x-vercel-ip-longitude',
    timezone: 'x-vercel-ip-timezone',
    encoded: true,
  },
  {
    country: 'cf-ipcountry',
    region: 'cf-region-code',
    city: 'cf-ipcity',
    latitude: 'cf-iplatitude',
    longitude: 'cf-iplongitude',
    timezone: 'cf-timezone',
    encoded: false,
  },
  {
    country: 'cloudfront-viewer-country',
    region: 'cloudfront-viewer-country-region',
    city: 'cloudfront-viewer-city',
    latitude: 'cloudfront-viewer-latitude',
    longitude: 'cloudfront-viewer-longitude',
    timezone: 'cloudfront-viewer-time-zone',
    encoded: false,
  },
];

/**
 * Every header this adapter reads, flattened.
 *
 * Exported so `networkContextFrom` can copy exactly these out of a request and
 * nothing else. One list, so adding a vendor above cannot leave the extraction
 * silently dropping the headers the new entry depends on.
 */
export const EDGE_HINT_HEADERS: readonly string[] = VENDORS.flatMap((vendor) => [
  vendor.country,
  vendor.region,
  vendor.city,
  vendor.latitude,
  vendor.longitude,
  vendor.timezone,
]);

/**
 * Country codes that mean "we could not tell", spelled as if they were countries.
 *
 * Cloudflare sends `XX` when it has no answer and `T1` for a Tor exit node. Both
 * would otherwise be stored as a country, and `T1` would appear on the console as
 * a nation with several hundred visitors in it.
 */
const NON_COUNTRIES = new Set(['XX', 'T1', 'ZZ', 'AP', 'EU']);

export class EdgeHintLocator implements LocationResolver {
  /* `async` with nothing awaited: the port is async because the other adapter
     makes a network call, and reading headers must satisfy the same signature. */
  async resolve(network: NetworkContext, observedAt: Date): Promise<LocationFix | null> {
    for (const vendor of VENDORS) {
      const place = readPlace(network.hints, vendor);
      if (place === null) continue;

      return LocationFix.fromAddress({
        source: 'edge',
        coordinates: Coordinates.parse(
          network.hints[vendor.latitude],
          network.hints[vendor.longitude],
        ),
        place,
        observedAt,
      });
    }

    return null;
  }
}

function readPlace(
  hints: Readonly<Record<string, string>>,
  vendor: HintMap,
): Place | null {
  const country = normaliseCountry(hints[vendor.country]);
  const city = decode(hints[vendor.city], vendor.encoded);
  const region = decode(hints[vendor.region], vendor.encoded);

  // A vendor is "present" only when it said something about where the request
  // came from. Header sets overlap between proxies, so matching on the mere
  // existence of one key would let a Cloudflare-in-front-of-Vercel deployment
  // resolve against whichever vendor happened to be listed first.
  if (country === null && city === null && region === null) return null;

  return {
    city,
    region,
    country,
    timezone: decode(hints[vendor.timezone], false),
  };
}

function normaliseCountry(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const code = raw.trim().toUpperCase();
  if (code.length !== 2 || NON_COUNTRIES.has(code)) return null;
  return code;
}

function decode(raw: string | undefined, encoded: boolean): string | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  if (!encoded) return trimmed;
  try {
    return decodeURIComponent(trimmed);
  } catch {
    // A header that is not valid percent-encoding is a header we cannot read.
    // Returning the raw form would put `S%C3%A3o%20Paulo` on the console.
    return null;
  }
}
