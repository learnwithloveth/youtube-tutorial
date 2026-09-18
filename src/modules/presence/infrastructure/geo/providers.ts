import 'server-only';

import { z } from 'zod';

import { Coordinates, LocationFix, type Place } from '../../domain/location';

/**
 * Free IP geolocation services, and how to read each one.
 *
 * ── Why a chain rather than one provider ───────────────────────────────────────
 * Every free tier is a quota, and a quota is an outage you have scheduled in
 * advance: ipapi.co stops answering after 1,000 lookups in a day, and a single
 * provider means the board silently stops resolving anyone at whatever hour that
 * happens. They also disagree — an address one service has never seen is often
 * known to another — so trying the next one is not only failover, it is coverage.
 *
 * Each entry owns its own response shape. That is the whole reason this file
 * exists as data rather than as branches inside the locator: adding a provider is
 * a new entry, and an upstream changing its JSON breaks parsing for that entry
 * alone instead of for the feature.
 *
 * None of them need an API key. All are HTTPS, because the payload is a visitor's
 * IP address and the answer is where they live; sending that in plaintext to save
 * a paid tier would be a poor trade.
 */

export interface GeoProvider {
  readonly name: string;
  /** `ip` is null when asking the service to describe the caller's own address. */
  readonly url: (ip: string | null, apiKey?: string | undefined) => string | null;
  /** Returns null when the body parsed but said nothing useful about a place. */
  readonly read: (payload: unknown, observedAt: Date) => LocationFix | null;
}

/** Builds a `network` fix, or null when no part of a place resolved. */
function toFix(
  place: Place,
  latitude: unknown,
  longitude: unknown,
  observedAt: Date,
): LocationFix | null {
  return LocationFix.fromAddress({
    source: 'network',
    coordinates: Coordinates.parse(latitude, longitude),
    place,
    observedAt,
  });
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** ISO-3166-1 alpha-2, or null. Guards against a service returning a full name. */
function countryCode(value: unknown): string | null {
  const code = text(value)?.toUpperCase();
  return code !== undefined && code !== null && /^[A-Z]{2}$/.test(code) ? code : null;
}

const ipapiSchema = z.object({
  city: z.unknown(),
  region: z.unknown(),
  country_code: z.unknown(),
  latitude: z.unknown(),
  longitude: z.unknown(),
  timezone: z.unknown(),
  /** ipapi.co answers HTTP 200 with `{ error: true, reason }` on a refusal. */
  error: z.unknown().optional(),
});

const ipwhoSchema = z.object({
  success: z.unknown().optional(),
  city: z.unknown(),
  region: z.unknown(),
  country_code: z.unknown(),
  latitude: z.unknown(),
  longitude: z.unknown(),
  timezone: z.unknown().optional(),
});

const freeipapiSchema = z.object({
  cityName: z.unknown(),
  regionName: z.unknown(),
  countryCode: z.unknown(),
  latitude: z.unknown(),
  longitude: z.unknown(),
  /** An array, and of the *country's* zones — see `readFreeipapiTimezone`. */
  timeZones: z.unknown().optional(),
});

/**
 * ipapi.co — 1,000 lookups a day, no key.
 *
 * Also the shape `GEOIP_LOOKUP_URL` is parsed as, so a paid plan or a self-hosted
 * mirror can be pointed at without new code.
 */
export const IPAPI: GeoProvider = {
  name: 'ipapi.co',
  url: (ip, apiKey) => {
    const base = ip === null ? 'https://ipapi.co/json/' : `https://ipapi.co/${ip}/json/`;
    return apiKey ? `${base}?key=${encodeURIComponent(apiKey)}` : base;
  },
  read: (payload, observedAt) => {
    const parsed = ipapiSchema.safeParse(payload);
    if (!parsed.success || parsed.data.error === true) return null;

    return toFix(
      {
        city: text(parsed.data.city),
        region: text(parsed.data.region),
        country: countryCode(parsed.data.country_code),
        timezone: text(parsed.data.timezone),
      },
      parsed.data.latitude,
      parsed.data.longitude,
      observedAt,
    );
  },
};

/** ipwho.is — no published daily cap, no key. Reports failure as `success: false`. */
export const IPWHO: GeoProvider = {
  name: 'ipwho.is',
  url: (ip) => (ip === null ? 'https://ipwho.is/' : `https://ipwho.is/${ip}`),
  read: (payload, observedAt) => {
    const parsed = ipwhoSchema.safeParse(payload);
    if (!parsed.success || parsed.data.success === false) return null;

    return toFix(
      {
        city: text(parsed.data.city),
        region: text(parsed.data.region),
        country: countryCode(parsed.data.country_code),
        timezone: readIpwhoTimezone(parsed.data.timezone),
      },
      parsed.data.latitude,
      parsed.data.longitude,
      observedAt,
    );
  },
};

/** ipwho.is nests the zone as `timezone.id`; everyone else returns a bare string. */
function readIpwhoTimezone(value: unknown): string | null {
  if (typeof value === 'string') return text(value);
  if (typeof value === 'object' && value !== null && 'id' in value) {
    return text((value as { id: unknown }).id);
  }
  return null;
}

/** freeipapi.com — 60 lookups a minute, no key. camelCase field names. */
export const FREEIPAPI: GeoProvider = {
  name: 'freeipapi.com',
  url: (ip) =>
    ip === null
      ? 'https://free.freeipapi.com/api/json'
      : `https://free.freeipapi.com/api/json/${ip}`,
  read: (payload, observedAt) => {
    const parsed = freeipapiSchema.safeParse(payload);
    if (!parsed.success) return null;

    return toFix(
      {
        city: text(parsed.data.cityName),
        region: text(parsed.data.regionName),
        country: countryCode(parsed.data.countryCode),
        timezone: readFreeipapiTimezone(parsed.data.timeZones),
      },
      parsed.data.latitude,
      parsed.data.longitude,
      observedAt,
    );
  },
};

/**
 * freeipapi returns every zone the *country* uses, not the one the address is in.
 *
 * States it is twenty-nine entries, and picking the first would assert that a
 * visitor in Florida is on `America/Adak`. So it is taken only when the list
 * leaves no choice, and is otherwise null — which is what we actually know.
 */
function readFreeipapiTimezone(value: unknown): string | null {
  return Array.isArray(value) && value.length === 1 ? text(value[0]) : null;
}

/**
 * The order they are tried in.
 *
 * Measured, not guessed. Probing all three from a development machine:
 *
 *  - `ipwho.is` answered in full, with a city, coordinates and a real IANA zone.
 *  - `freeipapi.com` answered, with a city and coordinates but only the country's
 *    list of zones.
 *  - `ipapi.co` answered `{ error: true, reason: "RateLimited" }` — from a single
 *    machine that had made a handful of requests. Its 1,000/day is shared across
 *    whatever else is on the egress address, so on a NAT or a cloud provider it
 *    can be exhausted by strangers.
 *
 * So the one that works goes first and the one that is most easily exhausted goes
 * last, where it is a third chance rather than a wasted round trip on every
 * lookup. The chain is what makes that ordering cheap to get wrong.
 *
 * Worth knowing when reading the console: the two that answered disagreed on the
 * city for the same address. Address-derived location is dependable at country
 * level and approximate below it, which is exactly why `precision` is carried on
 * every fix and why `exact` is reserved for a fix the device itself reported.
 */
export const DEFAULT_PROVIDERS: readonly GeoProvider[] = [IPWHO, FREEIPAPI, IPAPI];

/**
 * A provider for an operator-supplied endpoint.
 *
 * Parsed as ipapi.co, which is the shape a paid ipapi plan and most self-hosted
 * MaxMind wrappers already speak. Tried before the free chain: someone who
 * configured an endpoint wants it used, not kept as a fallback.
 */
export function customProvider(baseUrl: string): GeoProvider {
  const origin = baseUrl.replace(/\/+$/, '');
  return {
    name: 'configured',
    url: (ip, apiKey) => {
      const base = ip === null ? `${origin}/json/` : `${origin}/${ip}/json/`;
      return apiKey ? `${base}?key=${encodeURIComponent(apiKey)}` : base;
    },
    read: IPAPI.read,
  };
}
