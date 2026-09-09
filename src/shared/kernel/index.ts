/**
 * The shared kernel: concepts every bounded context is allowed to depend on.
 *
 * Membership here is deliberately hard to earn. Anything in this barrel is
 * coupled to every module in the system, so a change to it is a change to
 * everything. Money, rates, time and the Result type qualify because they are
 * genuinely universal and genuinely stable. Nothing that belongs to one
 * context's domain does.
 */

export { Money } from './money';
export type { CurrencyCode, MoneyJson } from './money';

export { BasisPoints } from './basis-points';
export type { PriceDirection } from './basis-points';

export { systemClock, fixedClock, secondsBetween } from './clock';
export type { Clock } from './clock';

export { ok, err, isOk, isErr, mapOk, unwrap } from './result';
export type { Result, Ok, Err } from './result';
