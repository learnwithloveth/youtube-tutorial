import 'server-only';

import { headers } from 'next/headers';
import { cache } from 'react';

import type { EventAgent, EventLocation } from '@/modules/activity';
import { networkContextFrom } from '@/modules/presence/server';
import { logger } from '@/platform/observability/logger';

import { presence } from './presence';

/**
 * Where this request came from, and on what.
 *
 * ── Why it borrows the presence module's adapters ──────────────────────────────
 * Resolving a location from a request is a solved problem in this codebase: CDN
 * headers first, an address lookup behind them, a chain of free providers behind
 * that, with caching and timeouts. All of it lives in `presence` because that is
 * where it was needed first.
 *
 * A second copy for auth events would be a second set of provider quirks to keep
 * up to date and a second cache to miss. So this reuses the composed resolver and
 * maps its output to the shape an activity event keeps — which is the mapping
 * `toEventLocation` performs, just from the domain side rather than the DTO side.
 *
 * ── It never throws ────────────────────────────────────────────────────────────
 * Every caller is in the middle of something that matters more: signing someone
 * in, confirming an address. A lookup that fails costs the location column on one
 * audit row and nothing else.
 */

export interface RequestDescription {
  readonly location: EventLocation | null;
  readonly agent: EventAgent | null;
  readonly ipDigest: string | null;
}

const NOTHING: RequestDescription = { location: null, agent: null, ipDigest: null };

/**
 * Deduplicated per request.
 *
 * A sign-in that recorded two events would otherwise resolve the same address
 * twice — and the second would be a cache hit, but the first would not.
 */
export const describeRequest = cache(async (): Promise<RequestDescription> => {
  const context = presence();
  if (context === null) return NOTHING;

  try {
    const network = networkContextFrom(await headers());
    const { locations, agents, digest } = context.dependencies;

    const fix = await locations.resolve(network, new Date());

    return {
      location:
        fix === null
          ? null
          : {
              source: fix.source,
              precision: fix.precision,
              city: fix.place.city,
              region: fix.place.region,
              country: fix.place.country,
              latitude: fix.coordinates?.latitude ?? null,
              longitude: fix.coordinates?.longitude ?? null,
            },
      agent: agents.parse(network.userAgent),
      ipDigest: network.ip === null ? null : digest.hash(network.ip),
    };
  } catch (error) {
    logger.warn({ event: 'request_describe_failed', module: 'presence' }, error);
    return NOTHING;
  }
});
