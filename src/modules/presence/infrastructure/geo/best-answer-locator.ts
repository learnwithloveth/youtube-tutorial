import 'server-only';

import { systemClock } from '@/shared/kernel';

import type { LocationFix } from '../../domain/location';
import type { LocationResolver, NetworkContext } from '../../application/ports';

/**
 * Asks each resolver in turn and keeps the best answer.
 *
 * ── Why not simply take the first non-null ─────────────────────────────────────
 * The obvious chain — edge headers, then a lookup service — has a failure mode
 * that only shows up in production. Cloudflare's free tier sends `cf-ipcountry`
 * and nothing else, so a first-answer chain would resolve every visitor to a
 * country forever and never once call the service that could have named the city.
 *
 * So the rule is: stop as soon as an answer is good enough, and otherwise keep
 * looking and keep the better result. "Good enough" is city precision, which is
 * both what the console needs and as much as an address can honestly give.
 *
 * The effect in the two deployments that matter:
 *  - behind a CDN that reports cities, the first resolver answers and no third
 *    party is ever contacted;
 *  - behind one that reports only a country, the country is held while the lookup
 *    runs, and survives as the answer if the lookup fails.
 */
export class BestAnswerLocator implements LocationResolver {
  constructor(private readonly resolvers: readonly LocationResolver[]) {}

  async resolve(network: NetworkContext, observedAt: Date): Promise<LocationFix | null> {
    let best: LocationFix | null = null;

    for (const resolver of this.resolvers) {
      const fix = await resolver.resolve(network, observedAt);
      if (fix === null) continue;

      // Every fix in this loop carries the same `observedAt`, so `supersedes`
      // decides on source and precision alone — a real comparison rather than a
      // race between two timestamps generated microseconds apart.
      if (fix.supersedes(best, systemClock)) best = fix;

      if (best !== null && (best.precision === 'city' || best.precision === 'exact')) {
        return best;
      }
    }

    return best;
  }
}
