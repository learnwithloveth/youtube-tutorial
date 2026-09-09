/**
 * Failures this context can return as values.
 *
 * Each is a condition a caller can do something about — render a 404, show a
 * degraded state, retry later. Anything that is merely a bug (a malformed
 * symbol from our own catalogue, a null where the schema forbids one) throws
 * instead, because there is no useful recovery.
 */

export type MarketDataError =
  | { readonly kind: 'instrument-not-found'; readonly slug: string }
  | { readonly kind: 'feed-unavailable'; readonly reason: string }
  | { readonly kind: 'feed-response-invalid'; readonly reason: string };

export function instrumentNotFound(slug: string): MarketDataError {
  return { kind: 'instrument-not-found', slug };
}

export function feedUnavailable(reason: string): MarketDataError {
  return { kind: 'feed-unavailable', reason };
}

export function feedResponseInvalid(reason: string): MarketDataError {
  return { kind: 'feed-response-invalid', reason };
}
