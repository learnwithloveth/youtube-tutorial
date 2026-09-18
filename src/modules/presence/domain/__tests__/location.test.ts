import { describe, expect, it } from 'vitest';

import { fixedClock } from '@/shared/kernel';

import { Coordinates, LocationFix, MAX_FIX_AGE_SECONDS, NOWHERE } from '../location';

const NOW = new Date('2026-09-14T12:00:00.000Z');
const clock = fixedClock(NOW);

function at(secondsAgo: number): Date {
  return new Date(NOW.getTime() - secondsAgo * 1000);
}

describe('Coordinates', () => {
  it('parses numbers and strings to a fixed scale', () => {
    expect(Coordinates.parse(51.5072, -0.1276)?.latitude).toBe('51.507200');
    expect(Coordinates.parse('51.5072', '-0.1276')?.longitude).toBe('-0.127600');
  });

  it('rejects values outside the earth', () => {
    expect(Coordinates.parse(91, 0)).toBeNull();
    expect(Coordinates.parse(0, 181)).toBeNull();
    expect(Coordinates.parse(Number.NaN, 0)).toBeNull();
    expect(Coordinates.parse(Number.POSITIVE_INFINITY, 0)).toBeNull();
  });

  it('rejects anything that is not a number or a numeric string', () => {
    expect(Coordinates.parse(null, null)).toBeNull();
    expect(Coordinates.parse(undefined, undefined)).toBeNull();
    expect(Coordinates.parse({}, [])).toBeNull();
    expect(Coordinates.parse('over there', 'up a bit')).toBeNull();
  });

  /* Null Island is what a geocoder returns when it failed and something coerced
     null to zero. Accepting it puts a pin in the Atlantic. */
  it('rejects 0,0', () => {
    expect(Coordinates.parse(0, 0)).toBeNull();
    expect(Coordinates.parse('0.0', '0')).toBeNull();
  });
});

describe('LocationFix.fromAddress', () => {
  it('derives precision from what actually resolved', () => {
    const city = LocationFix.fromAddress({
      source: 'network',
      place: { city: 'Paris', region: 'Paris', country: 'NG', timezone: 'europe/paris' },
      observedAt: NOW,
    });
    expect(city?.precision).toBe('city');

    const region = LocationFix.fromAddress({
      source: 'network',
      place: { city: null, region: 'Bavaria', country: 'DE', timezone: null },
      observedAt: NOW,
    });
    expect(region?.precision).toBe('region');

    const country = LocationFix.fromAddress({
      source: 'edge',
      place: { city: null, region: null, country: 'DE', timezone: null },
      observedAt: NOW,
    });
    expect(country?.precision).toBe('country');
  });

  /* An empty fix and no fix are the same thing, and only one of them should be
     representable — otherwise `unavailable` stops meaning anything. */
  it('returns null when nothing about the place resolved', () => {
    expect(
      LocationFix.fromAddress({ source: 'network', place: NOWHERE, observedAt: NOW }),
    ).toBeNull();
  });

  it('never carries a device accuracy', () => {
    const fix = LocationFix.fromAddress({
      source: 'edge',
      place: { city: 'Zurich', region: null, country: 'CH', timezone: null },
      observedAt: NOW,
    });
    expect(fix?.accuracyMetres).toBeNull();
  });
});

describe('LocationFix.device', () => {
  it('is always exact', () => {
    const fix = LocationFix.device({
      coordinates: Coordinates.parse(51.5072, -0.1276)!,
      accuracyMetres: 42.6,
      observedAt: NOW,
    });
    expect(fix.precision).toBe('exact');
    expect(fix.source).toBe('device');
    expect(fix.accuracyMetres).toBe(43);
  });

  it('discards a nonsensical accuracy rather than storing it', () => {
    const coordinates = Coordinates.parse(1, 1)!;
    expect(
      LocationFix.device({ coordinates, accuracyMetres: -5, observedAt: NOW }).accuracyMetres,
    ).toBeNull();
    expect(
      LocationFix.device({ coordinates, accuracyMetres: Number.NaN, observedAt: NOW })
        .accuracyMetres,
    ).toBeNull();
  });

  it('refuses an invalid observation time', () => {
    expect(() =>
      LocationFix.device({
        coordinates: Coordinates.parse(1, 1)!,
        observedAt: new Date('nonsense'),
      }),
    ).toThrow(TypeError);
  });
});

describe('staleness', () => {
  it('goes stale past the maximum age', () => {
    const fresh = address('city', at(MAX_FIX_AGE_SECONDS - 1));
    const old = address('city', at(MAX_FIX_AGE_SECONDS + 1));

    expect(fresh.isStaleAt(clock)).toBe(false);
    expect(old.isStaleAt(clock)).toBe(true);
    expect(old.ageInSecondsAt(clock)).toBe(MAX_FIX_AGE_SECONDS + 1);
  });
});

describe('supersedes', () => {
  it('accepts anything over nothing', () => {
    expect(address('country', NOW).supersedes(null, clock)).toBe(true);
  });

  it('replaces a stale incumbent even with a coarser fix', () => {
    const stale = device(at(MAX_FIX_AGE_SECONDS + 60));
    expect(address('country', NOW).supersedes(stale, clock)).toBe(true);
  });

  /* The regression this file exists for. Ranking source above precision reads as
     "trust the CDN over a lookup service" and produces, on a Cloudflare free tier
     that reports only a country, a board where nobody is ever in a city. */
  it('prefers a precise lookup to a vague edge answer', () => {
    const edgeCountry = address('country', NOW, 'edge');
    const lookupCity = address('city', NOW, 'network');

    expect(lookupCity.supersedes(edgeCountry, clock)).toBe(true);
    expect(edgeCountry.supersedes(lookupCity, clock)).toBe(false);
  });

  it('prefers the first-hand source at equal precision', () => {
    const edgeCity = address('city', NOW, 'edge');
    const lookupCity = address('city', NOW, 'network');

    expect(edgeCity.supersedes(lookupCity, clock)).toBe(true);
    expect(lookupCity.supersedes(edgeCity, clock)).toBe(false);
  });

  /* A consented device fix is exact, so it wins on precision without needing a
     rule of its own — and crucially, is not displaced by the address fix that
     arrives with every subsequent heartbeat. */
  it('keeps a live device fix against a fresh address fix', () => {
    const held = device(at(30));
    expect(address('city', NOW).supersedes(held, clock)).toBe(false);
    expect(held.supersedes(address('city', NOW), clock)).toBe(true);
  });

  it('falls back to recency between identical fixes', () => {
    const older = address('city', at(60));
    const newer = address('city', at(10));

    expect(newer.supersedes(older, clock)).toBe(true);
    expect(older.supersedes(newer, clock)).toBe(false);
  });
});

function address(
  precision: 'city' | 'country',
  observedAt: Date,
  source: 'edge' | 'network' = 'network',
): LocationFix {
  const place =
    precision === 'city'
      ? { city: 'Austin', region: 'Texas', country: 'US', timezone: null }
      : { city: null, region: null, country: 'US', timezone: null };

  return LocationFix.fromAddress({ source, place, observedAt })!;
}

function device(observedAt: Date): LocationFix {
  return LocationFix.device({
    coordinates: Coordinates.parse(30.2672, -97.7431)!,
    observedAt,
  });
}
