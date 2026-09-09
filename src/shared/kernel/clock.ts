/**
 * Clock — time as an injected dependency.
 *
 * A domain object that calls `Date.now()` cannot be tested without either
 * freezing global time or accepting flaky assertions. Passing a clock in makes
 * "is this ticker stale?" a pure question with a deterministic answer.
 */

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/** A clock pinned to an instant, for tests and for reproducible rendering. */
export function fixedClock(instant: Date): Clock {
  return { now: () => new Date(instant.getTime()) };
}

/** Whole seconds between two instants, always positive. */
export function secondsBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(a.getTime() - b.getTime()) / 1000);
}
