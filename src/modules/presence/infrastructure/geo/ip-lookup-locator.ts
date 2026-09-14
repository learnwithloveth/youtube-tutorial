import 'server-only';

import { z } from 'zod';

import { logger } from '@/platform/observability/logger';

import { Coordinates, LocationFix } from '../../domain/location';
import type { LocationResolver, NetworkContext } from '../../application/ports';
import { isPrivateAddress } from './address';

/**
 * Location from an IP address lookup service.
 *
 * The fallback for every deployment with no geo-aware network in front of it, and
 * the reason the feature works at all without the visitor granting anything: an
 * address is attached to the connection whether or not anyone consents.
 *
 * Response parsing is shaped for ipapi.co, the default. The URL is configurable so
 * a self-hosted MaxMind mirror or a test stub can answer instead — the same
 * arrangement `MARKET_DATA_FEED_URL` has with CoinGecko, and for the same reason:
 * an adapter is named after the upstream it parses, and swapping the upstream is a
 * new adapter rather than a new branch inside this one.
 *
 * ── Three things this must never do ────────────────────────────────────────────
 *  1. Hold up a heartbeat. An unbounded fetch to a third party would put their
 *     uptime on our write path; the timeout turns a hang into an ordinary null.
 *  2. Send a private address to anyone. It would leak internal topology and could
 *     not be resolved anyway.
 *  3. Invent an answer. A failure is null, which surfaces as `unavailable`.
 */

const responseSchema = z.object({
  city: z.string().nullish(),
  region: z.string().nullish(),
  country_code: z.string().nullish(),
  latitude: z.number().nullish(),
  longitude: z.number().nullish(),
  timezone: z.string().nullish(),
  /** ipapi.co answers 200 with `{ error: true, reason: "..." }` on a refusal. */
  error: z.boolean().nullish(),
  reason: z.string().nullish(),
});

const REQUEST_TIMEOUT_MS = 2_500;

/**
 * How long a resolved address is reused.
 *
 * An IP address does not change neighbourhood within an hour, and the free tier of
 * every lookup service is a daily quota. Without this, one visitor with a tab open
 * for a working day would spend 1,440 of a 1,000-request allowance on their own.
 */
const HIT_TTL_MS = 60 * 60_000;

/**
 * How long a failure is remembered.
 *
 * Shorter than a hit, because an outage should heal on its own, but not zero: a
 * service that is down would otherwise be retried on every heartbeat of every open
 * tab, which is the request pattern most likely to get an API key banned.
 */
const MISS_TTL_MS = 5 * 60_000;

/** Bounds the cache. Beyond this the oldest entries are dropped. */
const MAX_CACHE_ENTRIES = 5_000;

interface CacheEntry {
  readonly fix: LocationFix | null;
  readonly expiresAt: number;
}

export interface IpLookupOptions {
  /** Base URL of the lookup service. */
  readonly baseUrl: string;
  readonly apiKey?: string | undefined;
}

export class IpLookupLocator implements LocationResolver {
  /**
   * Per-process, and that is the honest scope.
   *
   * In a serverless deployment each instance keeps its own, so the hit rate is
   * whatever instance reuse gives. That is fine — the cache exists to stop one
   * visitor generating a request per heartbeat, which it does regardless of how
   * many instances are running. A shared cache would be a Redis dependency bought
   * for a marginal gain.
   */
  private readonly cache = new Map<string, CacheEntry>();

  /**
   * Lookups already in flight, keyed by address.
   *
   * Without this, the first heartbeat from ten tabs behind one office NAT fires
   * ten identical requests before any of them has populated the cache.
   */
  private readonly inFlight = new Map<string, Promise<LocationFix | null>>();

  constructor(private readonly options: IpLookupOptions) {}

  async resolve(network: NetworkContext, observedAt: Date): Promise<LocationFix | null> {
    const ip = network.ip;
    if (ip === null || isPrivateAddress(ip)) return null;

    const cached = this.cache.get(ip);
    if (cached !== undefined && cached.expiresAt > Date.now()) {
      // Re-stamped with this request's time: the *place* is cached, not the
      // observation. Serving the original timestamp would make a fix look stale
      // purely because someone else at the same address asked an hour ago.
      return restamp(cached.fix, observedAt);
    }

    const pending = this.inFlight.get(ip);
    if (pending !== undefined) return restamp(await pending, observedAt);

    const lookup = this.lookup(ip, observedAt).finally(() => this.inFlight.delete(ip));
    this.inFlight.set(ip, lookup);

    const fix = await lookup;
    this.remember(ip, fix);
    return fix;
  }

  private async lookup(ip: string, observedAt: Date): Promise<LocationFix | null> {
    const url = new URL(`${this.options.baseUrl.replace(/\/+$/, '')}/${ip}/json/`);
    if (this.options.apiKey) url.searchParams.set('key', this.options.apiKey);

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });

      if (!response.ok) {
        logger.warn({
          event: 'ip_lookup_rejected',
          module: 'presence',
          status: response.status,
        });
        return null;
      }

      const parsed = responseSchema.safeParse(await response.json());
      if (!parsed.success) {
        logger.warn({ event: 'ip_lookup_unparseable', module: 'presence' });
        return null;
      }
      if (parsed.data.error === true) {
        logger.warn({
          event: 'ip_lookup_refused',
          module: 'presence',
          reason: parsed.data.reason ?? 'unspecified',
        });
        return null;
      }

      const country = parsed.data.country_code?.trim().toUpperCase();

      return LocationFix.fromAddress({
        source: 'network',
        coordinates: Coordinates.parse(parsed.data.latitude, parsed.data.longitude),
        place: {
          city: parsed.data.city?.trim() || null,
          region: parsed.data.region?.trim() || null,
          country: country && country.length === 2 ? country : null,
          timezone: parsed.data.timezone?.trim() || null,
        },
        observedAt,
      });
    } catch (error) {
      // A timeout, a DNS failure or an offline build machine. None of them are
      // this application being broken, and none of them justify failing a beat.
      logger.warn({ event: 'ip_lookup_failed', module: 'presence' }, error);
      return null;
    }
  }

  private remember(ip: string, fix: LocationFix | null): void {
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      // Insertion-ordered, so the first key is the oldest write. Evicting one per
      // insert keeps the map at its bound without a sweep.
      const oldest = this.cache.keys().next();
      if (!oldest.done) this.cache.delete(oldest.value);
    }

    this.cache.set(ip, {
      fix,
      expiresAt: Date.now() + (fix === null ? MISS_TTL_MS : HIT_TTL_MS),
    });
  }
}

function restamp(fix: LocationFix | null, observedAt: Date): LocationFix | null {
  if (fix === null) return null;
  return LocationFix.rehydrate({
    source: fix.source,
    precision: fix.precision,
    coordinates: fix.coordinates,
    place: fix.place,
    accuracyMetres: fix.accuracyMetres,
    observedAt,
  });
}
