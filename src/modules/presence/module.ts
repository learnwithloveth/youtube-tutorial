import 'server-only';

import type { Database } from '@/platform/db/client';
import { systemClock, type Clock } from '@/shared/kernel/clock';

import type { LocationResolver, PresenceDependencies } from './application/ports';
import {
  createRecordPresence,
  type RecordPresence,
} from './application/use-cases/record-presence';
import { createSweepPresence, type SweepPresence } from './application/use-cases/sweep-presence';
import { HmacAddressDigest } from './infrastructure/crypto/hmac-digest';
import { BestAnswerLocator } from './infrastructure/geo/best-answer-locator';
import { EdgeHintLocator } from './infrastructure/geo/edge-hint-locator';
import { IpLookupLocator } from './infrastructure/geo/ip-lookup-locator';
import { customProvider, DEFAULT_PROVIDERS } from './infrastructure/geo/providers';
import { UserAgentParser } from './infrastructure/http/user-agent-parser';
import { DrizzlePresenceRepository } from './infrastructure/persistence/repositories';

/**
 * Presence module registration.
 *
 * ── The extraction seam ─────────────────────────────────────────────────────────
 * The only file that knows both the ports and the adapters. Presence is the most
 * likely context in this application to move: it is write-heavy, its data is
 * ephemeral, and a key-value store with native expiry suits it far better than a
 * relational table. When that happens, `domain/` and `application/` are untouched
 * and this file changes.
 *
 * ── The location resolver is a chain, not a service ────────────────────────────
 * Two adapters, tried in order by `BestAnswerLocator`. Behind a geo-aware CDN the
 * first one answers and no third party is contacted at all; everywhere else the
 * lookup adapter is the fallback, which is what makes a location available for a
 * visitor who granted the browser nothing — the majority of them.
 *
 * The lookup adapter is itself a chain of free providers, for a reason worth
 * stating here rather than only in `providers.ts`: a free tier is a quota, and a
 * quota is an outage scheduled in advance. One provider means the board stops
 * resolving anyone at whatever hour the day's allowance runs out.
 *
 * Omitting `lookup` composes the chain with only the edge adapter. That is the
 * correct configuration for a deployment that does not want a third party in the
 * request path, and the honest outcome there is `unavailable` rather than a guess.
 */

export interface PresenceModule {
  readonly recordPresence: RecordPresence;
  readonly sweepPresence: SweepPresence;
  /** Passed to the module's queries, which are free functions over these ports. */
  readonly dependencies: PresenceDependencies;
}

export interface RegisterPresenceOptions {
  db: Database;
  /** At least 32 characters. The address digest key is HKDF-derived from it. */
  digestSecret: string;
  /** Omit to resolve locations from CDN headers only. */
  lookup?: PresenceLookupOptions | undefined;
  clock?: Clock;
}

export interface PresenceLookupOptions {
  /** An operator's own endpoint, tried ahead of the free chain. */
  baseUrl?: string | undefined;
  apiKey?: string | undefined;
  /** Resolve this machine's address when the visitor's is loopback. Dev only. */
  resolveOwnAddress?: boolean | undefined;
}

export function registerPresence(options: RegisterPresenceOptions): PresenceModule {
  const resolvers: LocationResolver[] = [new EdgeHintLocator()];

  if (options.lookup) {
    // A configured endpoint goes first: someone who set one wants it used, not
    // held in reserve behind three services they did not choose.
    const providers = options.lookup.baseUrl
      ? [customProvider(options.lookup.baseUrl), ...DEFAULT_PROVIDERS]
      : DEFAULT_PROVIDERS;

    resolvers.push(
      new IpLookupLocator({
        providers,
        apiKey: options.lookup.apiKey,
        resolveOwnAddress: options.lookup.resolveOwnAddress ?? false,
      }),
    );
  }

  const dependencies: PresenceDependencies = {
    presences: new DrizzlePresenceRepository(options.db),
    locations: new BestAnswerLocator(resolvers),
    agents: new UserAgentParser(),
    digest: new HmacAddressDigest(options.digestSecret),
    clock: options.clock ?? systemClock,
  };

  return {
    recordPresence: createRecordPresence(dependencies),
    sweepPresence: createSweepPresence(dependencies),
    dependencies,
  };
}
