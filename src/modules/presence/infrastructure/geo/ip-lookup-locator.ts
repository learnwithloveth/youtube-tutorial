import 'server-only';

import { logger } from '@/platform/observability/logger';

import { LocationFix } from '../../domain/location';
import type { LocationResolver, NetworkContext } from '../../application/ports';
import { isPrivateAddress } from './address';
import { DEFAULT_PROVIDERS, type GeoProvider } from './providers';

/**
 * Location from an IP address lookup.
 *
 * The fallback for every deployment with no geo-aware network in front of it, and
 * the reason this works at all without the visitor granting anything: an address is
 * attached to the connection whether or not anyone consents.
 *
 * Providers are tried in order until one answers. See `providers.ts` for why the
 * chain exists rather than a single service.
 *
 * ── What this must never do ────────────────────────────────────────────────────
 *  1. Hold up a heartbeat. An unbounded fetch to a third party would put their
 *     uptime on our write path; the timeout turns a hang into an ordinary null.
 *  2. Send a private address to anyone. It would leak internal topology and cannot
 *     be resolved regardless — see the loopback note below for what happens
 *     instead.
 *  3. Invent an answer. Every failure path returns null, which surfaces as
 *     `unavailable` rather than as a plausible country.
 */

const REQUEST_TIMEOUT_MS = 2_500;

/**
 * How long a resolved address is reused.
 *
 * An address does not change neighbourhood within an hour, and every free tier is
 * a daily or per-minute quota. Without this, one visitor with a tab open for a
 * working day would spend 1,440 lookups on their own.
 */
const HIT_TTL_MS = 60 * 60_000;

/**
 * How long a failure is remembered.
 *
 * Shorter than a hit, so an outage heals on its own, but not zero: a service that
 * is down would otherwise be retried on every heartbeat of every open tab, which
 * is the request pattern most likely to get an address banned.
 */
const MISS_TTL_MS = 5 * 60_000;

/** Bounds the cache. Beyond this the oldest entries are dropped. */
const MAX_CACHE_ENTRIES = 5_000;

/**
 * How long a provider is skipped after it fails.
 *
 * A free tier that has spent its daily quota will refuse every request until
 * midnight. Continuing to ask costs a timeout per lookup and delays the provider
 * that would have answered, so a failing one is stood down and the chain moves on.
 */
const PROVIDER_COOLDOWN_MS = 10 * 60_000;

interface CacheEntry {
  readonly fix: LocationFix | null;
  readonly expiresAt: number;
}

export interface IpLookupOptions {
  readonly providers: readonly GeoProvider[];
  readonly apiKey?: string | undefined;
  /**
   * Whether to resolve *this machine's* address when the visitor's is loopback.
   *
   * True only in development, and it is the difference between a live board that
   * works on a developer's laptop and one that shows "Not resolved" for every row
   * until it is deployed. A local request carries no client address at all — Next
   * sets no forwarding headers — so there is nothing to look up, and asking a
   * provider without an address returns where *this* machine connects from. On a
   * developer's laptop that is genuinely where the visitor is, because they are
   * the same person on the same network.
   *
   * It is off in production, where the two are not the same person: a loopback
   * request there is a health check or a sidecar, and resolving it would pin every
   * one of them to the datacentre and call it a visitor's location.
   */
  readonly resolveOwnAddress: boolean;
}

export class IpLookupLocator implements LocationResolver {
  /**
   * Per-process, and that is the honest scope.
   *
   * In a serverless deployment each instance keeps its own, so the hit rate is
   * whatever instance reuse gives. That is fine: the cache exists to stop one
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

  /** Provider name → when it may be tried again. */
  private readonly coolingDown = new Map<string, number>();

  constructor(private readonly options: IpLookupOptions) {}

  async resolve(network: NetworkContext, observedAt: Date): Promise<LocationFix | null> {
    const ip = network.ip;
    const usable = ip !== null && !isPrivateAddress(ip);

    if (!usable && !this.options.resolveOwnAddress) return null;

    // `self` is the cache key for "this machine", which is what a null address
    // resolves to. Keying it by the empty string would collide with nothing, but
    // naming it makes a cache dump readable.
    const key = usable ? ip : 'self';
    const query = usable ? ip : null;

    const cached = this.cache.get(key);
    if (cached !== undefined && cached.expiresAt > Date.now()) {
      // Re-stamped with this request's time: the *place* is cached, not the
      // observation. Serving the original timestamp would make a fix look stale
      // purely because someone else at the same address asked an hour ago.
      return restamp(cached.fix, observedAt);
    }

    const pending = this.inFlight.get(key);
    if (pending !== undefined) return restamp(await pending, observedAt);

    const lookup = this.lookup(query, observedAt).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, lookup);

    const fix = await lookup;
    this.remember(key, fix);
    return fix;
  }

  /** Walks the chain until a provider answers with a usable place. */
  private async lookup(ip: string | null, observedAt: Date): Promise<LocationFix | null> {
    const now = Date.now();

    for (const provider of this.options.providers) {
      const until = this.coolingDown.get(provider.name);
      if (until !== undefined && until > now) continue;

      const fix = await this.ask(provider, ip, observedAt);
      if (fix !== null) {
        this.coolingDown.delete(provider.name);
        return fix;
      }

      this.coolingDown.set(provider.name, Date.now() + PROVIDER_COOLDOWN_MS);
    }

    logger.warn({
      event: 'ip_lookup_exhausted',
      module: 'presence',
      providers: this.options.providers.length,
    });
    return null;
  }

  private async ask(
    provider: GeoProvider,
    ip: string | null,
    observedAt: Date,
  ): Promise<LocationFix | null> {
    const url = provider.url(ip, this.options.apiKey);
    if (url === null) return null;

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
          provider: provider.name,
          status: response.status,
        });
        return null;
      }

      return provider.read(await response.json(), observedAt);
    } catch (error) {
      // A timeout, a DNS failure, or a machine with no outbound network. None of
      // them are this application being broken, and none justify failing a beat.
      logger.warn(
        { event: 'ip_lookup_failed', module: 'presence', provider: provider.name },
        error,
      );
      return null;
    }
  }

  private remember(key: string, fix: LocationFix | null): void {
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      // Insertion-ordered, so the first key is the oldest write. Evicting one per
      // insert keeps the map at its bound without a sweep.
      const oldest = this.cache.keys().next();
      if (!oldest.done) this.cache.delete(oldest.value);
    }

    this.cache.set(key, {
      fix,
      expiresAt: Date.now() + (fix === null ? MISS_TTL_MS : HIT_TTL_MS),
    });
  }
}

export { DEFAULT_PROVIDERS };

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
