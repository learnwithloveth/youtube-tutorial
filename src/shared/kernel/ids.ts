/**
 * Branded identifiers.
 *
 * TypeScript is structurally typed, so a `UserId` and a `SessionId` that are both
 * `string` are interchangeable — which means `revokeSession(userId, sessionId)`
 * compiles when the signature is `(sessionId, userId)`. Branding makes that a
 * compile error rather than a production incident.
 *
 * Only the ids this system actually has are declared. More get added as contexts
 * appear; a speculative list of brands for modules that do not exist is noise.
 */

declare const brand: unique symbol;

type Brand<T, B extends string> = T & { readonly [brand]: B };

export type UserId = Brand<string, 'UserId'>;
export type CorrelationId = Brand<string, 'CorrelationId'>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function assertUuid(value: string, kind: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new TypeError(`Invalid ${kind}: "${value}" is not a UUID`);
  }
}

export function toUserId(value: string): UserId {
  assertUuid(value, 'UserId');
  return value as UserId;
}

export function toCorrelationId(value: string): CorrelationId {
  return value as CorrelationId;
}

/**
 * Id generation is a PORT, not a global.
 *
 * Two reasons, one architectural and one framework-specific:
 *  - a use case that calls `crypto.randomUUID()` directly cannot be tested
 *    deterministically;
 *  - Next.js treats `randomUUID()` as a non-deterministic value that blocks
 *    prerendering, so it must sit behind a request scope rather than run during
 *    a render.
 */
export interface IdGenerator {
  next(): string;
}

export const systemIdGenerator: IdGenerator = {
  next: () => crypto.randomUUID(),
};

/** Deterministic generator for tests. */
export function sequentialIdGenerator(prefix = '00000000-0000-4000-8000'): IdGenerator {
  let counter = 0;
  return {
    next: () => `${prefix}-${(counter++).toString(16).padStart(12, '0')}`,
  };
}
