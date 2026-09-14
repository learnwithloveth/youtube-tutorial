import { secondsBetween, type Clock } from '@/shared/kernel';

/**
 * Where someone is, and how we came to believe it.
 *
 * ── A location is an observation, not an attribute ──────────────────────────────
 * The discipline the market module applies to a price applies here, for the same
 * reason. A coordinate with no attached time and no attached provenance is a claim
 * that cannot be checked: once both have been flattened to "London, GB" it is
 * impossible to tell a GPS fix taken eight seconds ago from a country guessed off
 * an IP address two hours ago.
 *
 * So every fix carries three things it cannot be constructed without:
 *
 *   `source`     — where the belief came from, and therefore how much it is worth
 *   `precision`  — how large the area it actually pins down is
 *   `observedAt` — when it was true
 *
 * There is no constructor that omits them, no "unknown" placeholder and no default
 * country. The absence of a location is `null`, which `Presence.locationStateAt`
 * renders as an `unavailable` state the caller has to handle. We never fill the gap.
 */

/**
 * How a fix was obtained.
 *
 * The distinction is not cosmetic — it decides what the fix is worth:
 *
 *  - `device`  — the browser Geolocation API, after the visitor granted permission.
 *    Precise, consented, and **self-reported**: it arrives in a request body the
 *    client controls, so it is evidence of what the client said rather than proof
 *    of where the hardware is. The console labels it as such.
 *  - `edge`    — geo headers attached by the CDN in front of us. Derived from the
 *    connecting address by the network itself, so the visitor cannot choose it and
 *    it costs no round trip.
 *  - `network` — an IP address resolved through a lookup service. Coarse, and wrong
 *    for anyone behind a VPN or carrier-grade NAT, but it needs no permission and
 *    is therefore the one source that is always available.
 */
export type LocationSource = 'device' | 'edge' | 'network';

/**
 * The size of the area a fix actually pins down.
 *
 * Carried separately from `source` because they are not the same question, and
 * conflating them is how a country-level guess ends up drawn on a map as a pin. A
 * `network` fix resolves a city or only a country depending on the address; a
 * caller needs to know which before deciding what to draw.
 */
export type LocationPrecision = 'exact' | 'city' | 'region' | 'country';

/**
 * Decimal places kept for a coordinate.
 *
 * Six is roughly 11cm at the equator — finer than any consumer GPS reports, so
 * nothing real is lost, and it bounds what a malformed or hostile payload can
 * write into the column.
 */
export const COORDINATE_SCALE = 6;

/**
 * How old a fix may be before the console must stop presenting it as current.
 *
 * Fifteen minutes, chosen against how people move rather than against what looks
 * tidy: someone who granted location at page load and is still reading twenty
 * minutes later may be on a train. The fix was true and is no longer known to be,
 * which is exactly the `stale` state.
 */
export const MAX_FIX_AGE_SECONDS = 900;

/**
 * A latitude/longitude pair, held as exact decimal strings.
 *
 * Strings rather than numbers for the reason money is: the value lives in a
 * `numeric` column and comes back as a string, and routing it through a float on
 * the way in and out would change digits for no benefit. Nothing here does
 * arithmetic on a coordinate — it stores one and draws one.
 */
export class Coordinates {
  private constructor(
    readonly latitude: string,
    readonly longitude: string,
  ) {}

  /**
   * Parses a pair, returning null for anything unparseable or out of range.
   *
   * Null rather than a throw: the callers are a public heartbeat endpoint and a
   * third-party lookup service, both of which send nonsense as a matter of course,
   * so a rejected coordinate is an ordinary outcome rather than a bug.
   */
  static parse(latitude: unknown, longitude: unknown): Coordinates | null {
    const lat = toFixedDecimal(latitude, 90);
    const lng = toFixedDecimal(longitude, 180);
    if (lat === null || lng === null) return null;

    // 0,0 is Null Island: the point in the Atlantic that every geocoder returns
    // when it has failed and something downstream coerced null to zero. Accepting
    // it as a real fix puts a pin in the ocean on the live map.
    if (Number(lat) === 0 && Number(lng) === 0) return null;

    return new Coordinates(lat, lng);
  }

  toString(): string {
    return `${this.latitude},${this.longitude}`;
  }
}

function toFixedDecimal(value: unknown, limit: number): string | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > limit) return null;
  return parsed.toFixed(COORDINATE_SCALE);
}

/** The human-readable half of a fix. Every field is independently optional. */
export interface Place {
  readonly city: string | null;
  /** State, province or equivalent. */
  readonly region: string | null;
  /** ISO-3166-1 alpha-2, uppercase. */
  readonly country: string | null;
  /** IANA zone, e.g. `Europe/Zurich`. */
  readonly timezone: string | null;
}

export const NOWHERE: Place = { city: null, region: null, country: null, timezone: null };

export interface LocationFixSnapshot {
  readonly source: LocationSource;
  readonly precision: LocationPrecision;
  readonly coordinates: Coordinates | null;
  readonly place: Place;
  /** Radius the device claimed, in metres. Only ever set on a `device` fix. */
  readonly accuracyMetres: number | null;
  readonly observedAt: Date;
}

export class LocationFix {
  readonly source: LocationSource;
  readonly precision: LocationPrecision;
  readonly coordinates: Coordinates | null;
  readonly place: Place;
  readonly accuracyMetres: number | null;
  readonly observedAt: Date;

  private constructor(snapshot: LocationFixSnapshot) {
    this.source = snapshot.source;
    this.precision = snapshot.precision;
    this.coordinates = snapshot.coordinates;
    this.place = snapshot.place;
    this.accuracyMetres = snapshot.accuracyMetres;
    this.observedAt = snapshot.observedAt;
  }

  /**
   * A fix the browser Geolocation API produced, after the visitor granted it.
   *
   * Refuses to exist without coordinates. A "device" fix carrying only a country
   * would be an address guess wearing a better badge, and the entire purpose of the
   * source field is that an operator can tell those two apart.
   */
  static device(input: {
    coordinates: Coordinates;
    accuracyMetres?: number | null;
    place?: Place;
    observedAt: Date;
  }): LocationFix {
    assertObserved(input.observedAt);
    return new LocationFix({
      source: 'device',
      precision: 'exact',
      coordinates: input.coordinates,
      place: input.place ?? NOWHERE,
      accuracyMetres: normaliseAccuracy(input.accuracyMetres),
      observedAt: input.observedAt,
    });
  }

  /**
   * A fix derived from the connecting address, by the CDN or by a lookup service.
   *
   * Precision is *derived from what actually came back* rather than taken on trust,
   * so a response that resolved only a country cannot be recorded as a city.
   * Returns null when nothing usable arrived: an empty fix and no fix are the same
   * thing, and only one of them should be representable.
   */
  static fromAddress(input: {
    source: 'edge' | 'network';
    coordinates?: Coordinates | null;
    place: Place;
    observedAt: Date;
  }): LocationFix | null {
    assertObserved(input.observedAt);

    const precision = precisionOf(input.place);
    if (precision === null) return null;

    return new LocationFix({
      source: input.source,
      precision,
      coordinates: input.coordinates ?? null,
      place: input.place,
      accuracyMetres: null,
      observedAt: input.observedAt,
    });
  }

  /** Rebuilds a stored fix. Storage is trusted; the parsing happened on the way in. */
  static rehydrate(snapshot: LocationFixSnapshot): LocationFix {
    return new LocationFix(snapshot);
  }

  ageInSecondsAt(clock: Clock): number {
    return secondsBetween(clock.now(), this.observedAt);
  }

  isStaleAt(clock: Clock, maxAgeSeconds: number = MAX_FIX_AGE_SECONDS): boolean {
    return this.ageInSecondsAt(clock) > maxAgeSeconds;
  }

  /**
   * Whether this fix says more about where someone is than `other` does.
   *
   * Decides which fix survives when several are available for one visitor, and the
   * order of the three tests is the whole design:
   *
   *  1. **A stale incumbent always loses.** A fix we can no longer vouch for is
   *     worth less than one we can, whatever its provenance.
   *  2. **Then precision.** This is the one that is tempting to get wrong by
   *     ranking source first — which reads as "trust the CDN over a lookup
   *     service" and produces, in a Cloudflare deployment that reports only a
   *     country, a board on which nobody is ever in a city. Both address-derived
   *     sources are describing the same connection, so the better description
   *     wins. A consented device fix is `exact` and therefore already beats both,
   *     without needing a rule of its own.
   *  3. **Then source, then recency**, to break ties between equals. First-hand
   *     beats second-hand at the same precision.
   */
  supersedes(other: LocationFix | null, clock: Clock): boolean {
    if (other === null) return true;
    if (other.isStaleAt(clock)) return true;

    if (PRECISION_RANK[this.precision] !== PRECISION_RANK[other.precision]) {
      return PRECISION_RANK[this.precision] > PRECISION_RANK[other.precision];
    }

    const mine = SOURCE_RANK[this.source];
    const theirs = SOURCE_RANK[other.source];
    if (mine !== theirs) return mine > theirs;

    return this.observedAt.getTime() > other.observedAt.getTime();
  }
}

const SOURCE_RANK: Record<LocationSource, number> = { network: 0, edge: 1, device: 2 };
const PRECISION_RANK: Record<LocationPrecision, number> = {
  country: 0,
  region: 1,
  city: 2,
  exact: 3,
};

function precisionOf(place: Place): LocationPrecision | null {
  if (place.city) return 'city';
  if (place.region) return 'region';
  if (place.country) return 'country';
  return null;
}

function normaliseAccuracy(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0) return null;
  // Capped at roughly half the earth's circumference: past that the number is a
  // bug in the reporter, not a radius, and it should not reach a column.
  return Math.round(Math.min(value, 20_000_000));
}

function assertObserved(observedAt: Date): void {
  if (Number.isNaN(observedAt.getTime())) {
    throw new TypeError('A location fix requires a valid observation time.');
  }
}
