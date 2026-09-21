import type { UserId } from '@/shared/kernel/ids';

/**
 * Activity — what an account did, kept.
 *
 * ── Why this is not part of `presence` ─────────────────────────────────────────
 * Presence answers "who is here now" and is explicitly *not* history: one row per
 * open tab, overwritten in place, swept hours later. This answers "what has this
 * account done", which is the opposite shape — append-only, never updated, and
 * retained long enough to be worth consulting.
 *
 * Putting them in one table would force one retention policy onto both. A live
 * board needs rows to disappear the moment they stop being true; an audit trail is
 * worthless if it does. So they are separate contexts that happen to describe the
 * same visitor, and the console joins them.
 *
 * ── An event is immutable, and that changes the location model ─────────────────
 * `presence` carries a `LocationFix` that goes stale, because "where are they" has
 * an answer that expires. An event's location does not: where someone signed in
 * from on Tuesday is still where they signed in from on Tuesday. So the location
 * here is a plain snapshot with no freshness rules — the same data, a genuinely
 * different concept, which is why it is a separate type rather than a shared one.
 */

/**
 * What happened.
 *
 * A closed union rather than a free-text string, so the console can group and
 * filter on it and so a typo cannot invent a new kind of event that nothing
 * renders.
 */
export type ActivityKind =
  | 'page-view'
  | 'sign-up'
  | 'sign-in'
  | 'sign-out'
  | 'password-reset'
  | 'verification-sent'
  | 'email-verified'
  /*
   * Money movements.
   *
   * They belong in the same trail as the sign-ins rather than in a ledger-only
   * log, because the question an operator actually asks is "what did this account
   * do", and the answer that matters is a withdrawal request forty seconds after a
   * sign-in from an unfamiliar country. Two separate logs make that correlation a
   * manual join across two screens.
   *
   * The ledger remains the record of truth for the money itself. These are the
   * narrative, not the accounting.
   */
  | 'withdrawal-requested'
  | 'withdrawal-approved'
  | 'withdrawal-rejected'
  | 'deposit-recorded'
  /*
   * A deposit claim an operator refused.
   *
   * It existed only as `withdrawal-rejected` before, with the detail line
   * carrying the word "deposit" to correct it — so the audit log and the
   * customer's bell both announced a withdrawal that never happened. The
   * detail is not the place to fix a wrong kind: it is not indexed, not
   * filtered on, and not what a reader sees first.
   */
  | 'deposit-rejected'
  /*
   * An operator saw the evidence and the chain is what is being waited on.
   *
   * Its own kind rather than a second `deposit-recorded`, because nothing was
   * recorded: no transfer exists and no balance moved. The customer's bell is the
   * main reason it is here — before it, somebody who had sent a transaction could
   * not tell "nobody has looked" from "we have looked, blocks are slow", and those
   * want different responses from them.
   */
  | 'deposit-confirming'
  /*
   * An operator issued demo funds into this account.
   *
   * Its own kind rather than a `deposit-recorded` with a different detail line,
   * for the reason `deposit-rejected` is not `withdrawal-rejected`: the kind is
   * what is indexed, filtered on and read first, and an audit trail that
   * announced a deposit for money nobody sent would be wrong in the field that
   * matters. It is in `SECURITY_KINDS` because "who credited this account, and
   * who let them" is exactly the question an audit of a workshop deployment asks.
   */
  | 'demo-funds-granted'
  /*
   * Console access, withdrawn or restored.
   *
   * Written against the account it happened *to*, not the operator who did it, and
   * named in the passive for that reason. Somebody investigating an account asks
   * "what happened to this", and an entry filed under the person who acted would
   * not be on the screen where that question gets asked. The actor is in the detail.
   */
  | 'admin-suspended'
  | 'admin-reinstated'
  /* A customer was emailed the record of a movement. Filed against their account
     because "what happened to this account" includes being written to about it,
     and a dispute starts with whether anything was ever sent. */
  | 'receipt-sent'
  /* Identity verification: submitted by the customer, decided by an operator.
     All three are filed against the customer's account, including the decisions,
     for the reason the admin-status pair are — the question being asked is "what
     happened to this account", and the operator is in the detail. */
  | 'verification-submitted'
  | 'verification-approved'
  | 'verification-rejected'
  /*
   * A price alert the customer set was satisfied.
   *
   * The one kind here that is neither security nor money — it is a
   * notification, and it lives in this table because the customer's feed is a
   * view over it and a second table would mean two writes to keep in step.
   *
   * Kept out of `SECURITY_KINDS` for the reason `page-view` is: an audit log
   * that fills with price alerts is one nobody reads, and the thing an audit is
   * opened for is a rounding error next to them.
   */
  | 'price-alert-triggered'
  /*
   * A signed-in customer arrived on the site — the first open tab after a gap.
   *
   * Written so operators can be told somebody is here, and kept in this trail for
   * the reason the rest are: "when was this account last on the site" is a
   * question about the account. It is not a page view (those are written on
   * departure, with a dwell time), and it is not presence (which is overwritten
   * and forgets). The path is the page they landed on.
   */
  | 'visit-started'
  /*
   * A customer wrote to support.
   *
   * The message itself stays in the support context and is not copied here — an
   * audit table kept for a month is no place for the text of a conversation. The
   * reference is the conversation, which is all an operator needs to open it.
   */
  | 'support-message-sent'
  /*
   * An external wallet was attached to the account, or detached from it.
   *
   * Security kinds, kept for a year, for the same reason a sign-in is: "which
   * addresses has this account claimed, and when" is the question asked after a
   * dispute, and it is asked months later. The detail carries the shortened
   * address and whether control was proved — an address somebody merely typed in
   * and one that signed a challenge are different claims, and a trail that
   * recorded them identically would lose the only part that matters.
   */
  | 'wallet-linked'
  | 'wallet-unlinked';

/** Everything that is not an ordinary page view — what a security review reads. */
export const SECURITY_KINDS: readonly ActivityKind[] = [
  'sign-up',
  'sign-in',
  'sign-out',
  'password-reset',
  'verification-sent',
  'email-verified',
  'withdrawal-requested',
  'withdrawal-approved',
  'withdrawal-rejected',
  'deposit-recorded',
  'deposit-confirming',
  'deposit-rejected',
  'demo-funds-granted',
  'admin-suspended',
  'admin-reinstated',
  'receipt-sent',
  'verification-submitted',
  'verification-approved',
  'verification-rejected',
  'wallet-linked',
  'wallet-unlinked',
];

/**
 * Kinds that are neither security nor money, and are not kept for a year.
 *
 * A page view is a browsing history. A fired price alert is a notification — the
 * customer read it, or did not, and a year later it is neither evidence nor use.
 * The list is explicit because the alternative, "everything except `page-view`",
 * silently gave the one-year window to the first kind added that did not want it.
 */
export const EPHEMERAL_KINDS: readonly ActivityKind[] = [
  'page-view',
  'price-alert-triggered',
  // Operator notifications, not evidence: a month is plenty to answer "when was
  // this customer last here" and "did they write to us", and a year would be a
  // browsing history kept for no reason.
  'visit-started',
  'support-message-sent',
];

export function isSecurityKind(kind: ActivityKind): boolean {
  return !EPHEMERAL_KINDS.includes(kind);
}

/**
 * How long each kind is kept.
 *
 * Two windows, because the two kinds of record earn their keep for different
 * lengths of time. A sign-in from an unfamiliar country matters when a dispute
 * surfaces months later, which is the whole reason an audit trail exists. A record
 * that someone read the fees page for forty seconds stops being useful almost
 * immediately and is the more intrusive of the two to hold — it is a browsing
 * history.
 *
 * So security events are kept for a year and the rest for thirty days. Both are
 * swept; neither is kept "just in case", which is how a log becomes a liability.
 */
export const SHORT_RETENTION_MS = 30 * 24 * 60 * 60_000;
export const SECURITY_RETENTION_MS = 365 * 24 * 60 * 60_000;

/** @deprecated The short window is no longer only page views. Use `SHORT_RETENTION_MS`. */
export const PAGE_VIEW_RETENTION_MS = SHORT_RETENTION_MS;

export function retentionMsFor(kind: ActivityKind): number {
  return isSecurityKind(kind) ? SECURITY_RETENTION_MS : SHORT_RETENTION_MS;
}

/**
 * Where an event happened, frozen at the moment it did.
 *
 * Every field is optional and independently so, because the sources that produce
 * one resolve different amounts: a CDN may name a country and nothing else. The
 * `source` is carried for the same reason it is in `presence` — a location the
 * device reported and one guessed from an IP address are not the same claim, and
 * an operator comparing two sign-ins needs to know which is which.
 */
export interface EventLocation {
  readonly source: 'device' | 'edge' | 'network';
  readonly precision: 'exact' | 'city' | 'region' | 'country';
  readonly city: string | null;
  readonly region: string | null;
  /** ISO-3166-1 alpha-2. */
  readonly country: string | null;
  readonly latitude: string | null;
  readonly longitude: string | null;
}

/** What the client was, reduced at the edge so no user-agent string is stored. */
export interface EventAgent {
  readonly device: 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown';
  readonly browser: string | null;
}

export interface ActivityEventSnapshot {
  readonly id: string;
  readonly userId: UserId;
  readonly kind: ActivityKind;
  readonly occurredAt: Date;
  /** The route, for a page view. Null for everything else. */
  readonly path: string | null;
  /**
   * How long the page was open, in seconds.
   *
   * Recorded when the visitor *leaves* a page rather than when they arrive, which
   * is what lets the number exist at all — a dwell time is not knowable at the
   * moment it starts. The page someone is on right now therefore has no event yet;
   * that is `presence`'s job, and the two are shown together on the console.
   */
  readonly durationSeconds: number | null;
  /**
   * The thing this event is about — a withdrawal id, a transfer id.
   *
   * Deliberately not a foreign key. The activity trail outlives what it describes
   * and must survive a row being deleted in another context; a constraint would
   * make the audit record the first casualty of a cleanup elsewhere.
   */
  readonly reference: string | null;
  /** A short human summary, e.g. "0.50000000 BTC". Rendered, never parsed. */
  readonly detail: string | null;
  readonly location: EventLocation | null;
  readonly agent: EventAgent | null;
  /** Keyed digest of the connecting address. Never the address. */
  readonly ipDigest: string | null;
  /** The browsing context, so several events can be tied to one tab. */
  readonly visitorId: string | null;
}

/**
 * One thing that happened, once.
 *
 * There are no mutators. An audit record that can be edited is not an audit
 * record, and the absence of a setter is the cheapest way to enforce that — a
 * correction is a new event, not a rewrite of an old one.
 */
export class ActivityEvent {
  readonly id: string;
  readonly userId: UserId;
  readonly kind: ActivityKind;
  readonly occurredAt: Date;
  readonly path: string | null;
  readonly durationSeconds: number | null;
  readonly reference: string | null;
  readonly detail: string | null;
  readonly location: EventLocation | null;
  readonly agent: EventAgent | null;
  readonly ipDigest: string | null;
  readonly visitorId: string | null;

  private constructor(snapshot: ActivityEventSnapshot) {
    this.id = snapshot.id;
    this.userId = snapshot.userId;
    this.kind = snapshot.kind;
    this.occurredAt = snapshot.occurredAt;
    this.path = snapshot.path;
    this.durationSeconds = snapshot.durationSeconds;
    this.reference = snapshot.reference;
    this.detail = snapshot.detail;
    this.location = snapshot.location;
    this.agent = snapshot.agent;
    this.ipDigest = snapshot.ipDigest;
    this.visitorId = snapshot.visitorId;
  }

  static record(snapshot: ActivityEventSnapshot): ActivityEvent {
    if (Number.isNaN(snapshot.occurredAt.getTime())) {
      throw new TypeError('An activity event requires a valid time.');
    }
    // A page view without a route describes nothing, and a sign-in with one
    // implies a route mattered to it. Both are bugs in the caller rather than
    // states to store.
    if (snapshot.kind === 'page-view' && snapshot.path === null) {
      throw new TypeError('A page-view event requires a path.');
    }
    if (snapshot.durationSeconds !== null && snapshot.durationSeconds < 0) {
      throw new RangeError('A duration cannot be negative.');
    }
    return new ActivityEvent(snapshot);
  }

  static rehydrate(snapshot: ActivityEventSnapshot): ActivityEvent {
    return new ActivityEvent(snapshot);
  }

  get isSecurityEvent(): boolean {
    return isSecurityKind(this.kind);
  }

  /** When this event may be deleted. Drives the sweep. */
  expiresAt(): Date {
    return new Date(this.occurredAt.getTime() + retentionMsFor(this.kind));
  }
}
