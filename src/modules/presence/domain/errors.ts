/**
 * Failures this context can return as values.
 *
 * The heartbeat endpoint is open to the internet, so a malformed report is not an
 * exception — it is the expected traffic of any public endpoint, arriving several
 * times a second. Each of these is a condition the route handler answers with a
 * status code and moves on from.
 *
 * A database that will not accept a write still throws: that is infrastructure
 * failing, not a caller misbehaving, and the read path degrades around it rather
 * than pretending the write succeeded.
 */

export type PresenceError =
  | { readonly kind: 'report-invalid'; readonly reason: string }
  | { readonly kind: 'visitor-unknown'; readonly visitorId: string };

export function reportInvalid(reason: string): PresenceError {
  return { kind: 'report-invalid', reason };
}

export function visitorUnknown(visitorId: string): PresenceError {
  return { kind: 'visitor-unknown', visitorId };
}
