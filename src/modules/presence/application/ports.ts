import type { Clock } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import type { LocationFix } from '../domain/location';
import type { AgentSummary, Presence, VisitorId } from '../domain/presence';

/**
 * Ports for the presence module.
 *
 * The seam that makes this context replaceable. Nothing above this layer knows
 * that presence is stored in Postgres, that an address is resolved by reading CDN
 * headers before calling anyone, or how a user-agent string becomes the word
 * "Safari".
 */

/**
 * Where presence rows live.
 *
 * ── This port is doing more work than it looks like ─────────────────────────────
 * Presence is the one write path in this application that scales with *traffic*
 * rather than with activity: every open tab writes a row every twenty seconds
 * whether or not anyone does anything. A relational table is the right first
 * implementation — it needs no new infrastructure, it survives a deploy, and the
 * console can query it with the joins it already knows — but it is the wrong shape
 * at volume, where this belongs in a store with native key expiry.
 *
 * Keeping it behind a port means that swap is an adapter and a line in
 * `module.ts`, rather than a rewrite of the use cases. `deleteExpired` is on the
 * interface for the same reason: a store with TTLs implements it as a no-op.
 */
export interface PresenceRepository {
  find(id: VisitorId): Promise<Presence | null>;
  /** Insert or overwrite in place. One row per browsing context, never a trail. */
  save(presence: Presence): Promise<void>;
  /**
   * Everyone who has reported in since `since`, most recently seen first.
   *
   * Bounded by `limit` because this feeds a console table and an unbounded read of
   * every visitor on a busy day would be a denial of service we wrote ourselves.
   */
  listSince(since: Date, limit: number): Promise<Presence[]>;
  /**
   * One account's open tabs. Backed by the same index as "is this user online".
   *
   * Separate from `listSince` rather than a filter on it, because the console's
   * account page asks about one person and would otherwise have to read the whole
   * board and discard it.
   */
  listForUser(userId: UserId, since: Date, limit: number): Promise<Presence[]>;
  /** Rows past their retention window. Returns how many were removed. */
  deleteExpired(before: Date, limit: number): Promise<number>;
}

/**
 * What the network said about the request, with no framework types attached.
 *
 * `hints` carries the request headers verbatim (keys lowercased) rather than a
 * pre-extracted country, because *which* headers mean something depends on what is
 * in front of the app — Vercel, Cloudflare and a bare Node server all label the
 * same fact differently. Deciding that is an adapter's job, and this type is the
 * envelope that lets the decision live there instead of in the route handler.
 */
export interface NetworkContext {
  /** The connecting address, already unwrapped from whatever proxy chain carried it. */
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly hints: Readonly<Record<string, string>>;
}

/**
 * Turns a connection into a location, or admits it cannot.
 *
 * Returns `null` rather than throwing or guessing. An unroutable address, a
 * lookup service that is down and a response with no city in it are all the same
 * answer — we do not know — and the one thing this must never do is invent a
 * plausible country to fill the column.
 */
export interface LocationResolver {
  resolve(network: NetworkContext, observedAt: Date): Promise<LocationFix | null>;
}

/**
 * Reduces a user-agent string to a device class and a browser family.
 *
 * A port rather than a domain service because it is a heuristic over a vendor
 * format that changes without notice, and because the raw string never gets past
 * it — the console shows "Mobile · Safari", and nothing stores the 180-character
 * fingerprint that string actually is.
 */
export interface AgentParser {
  parse(userAgent: string | null): AgentSummary | null;
}

/** One-way keyed hashing for values we must correlate but must not store. */
export interface Digest {
  hash(value: string): string;
}

export interface PresenceDependencies {
  presences: PresenceRepository;
  locations: LocationResolver;
  agents: AgentParser;
  digest: Digest;
  clock: Clock;
}
