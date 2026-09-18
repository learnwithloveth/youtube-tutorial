import { describe, expect, it } from 'vitest';

import { DEFAULT_PROVIDERS, FREEIPAPI, IPAPI, IPWHO } from '../providers';

/**
 * Parsers pinned against real responses.
 *
 * Every payload below was captured from the live service, not written from
 * memory — which is the point. Two of these parsers were wrong when they were
 * written from the documentation: `freeipapi` returns `timeZones` as an array of
 * the *country's* zones rather than a `timeZone` string, and `ipwho.is` nests the
 * zone under `timezone.id`. Both produced a silently null timezone and nothing
 * failed anywhere.
 *
 * A provider that changes its JSON will break exactly one of these tests, which is
 * the whole reason each one owns its own shape.
 */

const OBSERVED = new Date('2026-09-14T12:00:00.000Z');

describe('ipwho.is', () => {
  const payload = {
    ip: '8.8.8.8',
    success: true,
    country: 'United States',
    country_code: 'US',
    region: 'California',
    region_code: 'CA',
    city: 'San Jose',
    latitude: 37.3393939,
    longitude: -121.8949553,
    timezone: { id: 'America/Los_Angeles', abbr: 'PDT', is_dst: true },
  };

  it('reads a full response', () => {
    const fix = IPWHO.read(payload, OBSERVED);

    expect(fix?.source).toBe('network');
    expect(fix?.precision).toBe('city');
    expect(fix?.place).toEqual({
      city: 'San Jose',
      region: 'California',
      country: 'US',
      timezone: 'America/Los_Angeles',
    });
    expect(fix?.coordinates?.latitude).toBe('37.339394');
    expect(fix?.observedAt).toEqual(OBSERVED);
  });

  it('refuses a response the service marked unsuccessful', () => {
    expect(IPWHO.read({ ...payload, success: false }, OBSERVED)).toBeNull();
  });

  it('asks about the caller when given no address', () => {
    expect(IPWHO.url(null)).toBe('https://ipwho.is/');
    expect(IPWHO.url('8.8.8.8')).toBe('https://ipwho.is/8.8.8.8');
  });
});

describe('freeipapi.com', () => {
  it('reads a full response', () => {
    const fix = FREEIPAPI.read(
      {
        ipVersion: 4,
        latitude: 6.50153,
        longitude: 3.35808,
        countryName: 'France',
        countryCode: 'FR',
        timeZones: ['Europe/Paris'],
        cityName: 'paris',
        regionName: 'Paris',
      },
      OBSERVED,
    );

    expect(fix?.place.city).toBe('paris');
    expect(fix?.place.country).toBe('FR');
    expect(fix?.place.timezone).toBe('Europe/Paris');
  });

  /* The country's zones, not the address's. Taking the first would put a visitor
     in Florida on America/Adak. */
  it('declines to pick a timezone when the country has several', () => {
    const fix = FREEIPAPI.read(
      {
        cityName: 'Mountain View',
        regionName: 'California',
        countryCode: 'US',
        latitude: 37.422,
        longitude: -122.085,
        timeZones: ['America/Adak', 'America/Anchorage', 'America/Boise'],
      },
      OBSERVED,
    );

    expect(fix?.place.city).toBe('Mountain View');
    expect(fix?.place.timezone).toBeNull();
  });
});

describe('ipapi.co', () => {
  /* What the service actually returns once the shared daily quota is spent — HTTP
     200 with an error body, which is why a status check alone is not enough. */
  it('refuses a rate-limited response rather than reading it as a place', () => {
    expect(
      IPAPI.read(
        { error: true, reason: 'RateLimited', message: 'Please sign up for a paid plan' },
        OBSERVED,
      ),
    ).toBeNull();
  });

  it('reads a full response', () => {
    const fix = IPAPI.read(
      {
        city: 'Zurich',
        region: 'Zurich',
        country_code: 'CH',
        latitude: 47.3667,
        longitude: 8.55,
        timezone: 'Europe/Zurich',
      },
      OBSERVED,
    );

    expect(fix?.place.city).toBe('Zurich');
    expect(fix?.place.timezone).toBe('Europe/Zurich');
  });
});

describe('every provider', () => {
  /* A body that parsed but named nowhere is not a location. Returning a fix with
     four nulls would put a row on the console asserting nothing. */
  it('returns null for a response with no place in it', () => {
    for (const provider of DEFAULT_PROVIDERS) {
      expect(provider.read({}, OBSERVED)).toBeNull();
      expect(provider.read(null, OBSERVED)).toBeNull();
      expect(provider.read('not json at all', OBSERVED)).toBeNull();
    }
  });

  /* Services differ on whether they send a code or a name; a country column that
     sometimes holds "US" and sometimes "United States" cannot be grouped on. */
  it('rejects a country that is not an alpha-2 code', () => {
    const fix = IPWHO.read(
      { success: true, city: null, region: null, country_code: 'United States' },
      OBSERVED,
    );
    expect(fix).toBeNull();
  });

  it('offers a self-lookup URL, which is what makes local development resolve', () => {
    for (const provider of DEFAULT_PROVIDERS) {
      expect(provider.url(null)).toMatch(/^https:\/\//);
    }
  });
});
