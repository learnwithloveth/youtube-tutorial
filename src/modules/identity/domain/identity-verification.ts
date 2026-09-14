import { inspectImageBytes, type ImageContentType, type ImageInspection } from '@/shared/kernel/image-bytes';
import type { UserId } from '@/shared/kernel/ids';

/**
 * A customer's identity submission, awaiting a person's decision.
 *
 * ── What this is, and what it deliberately is not ──────────────────────────────
 * It is a record of what somebody claimed about themselves and the document they
 * uploaded to support it, plus the decision an operator reached. That is the whole
 * feature.
 *
 * It is *not* automated verification. There is no document-authenticity vendor
 * wired to this platform, no face-matching model, no liveness capture and no
 * sanctions or PEP screening list. The console this replaced displayed all five,
 * with MRZ checksums that were never computed, a "98.4% similarity to the liveness
 * capture" that came from a fixture, and a sanctions PASS against no list at all.
 * A compliance screen that reports checks nobody ran is worse than one that reports
 * nothing: it is the exact artefact somebody points at afterwards to explain why
 * they approved the account.
 *
 * So an operator here sees what the customer submitted and decides. When a vendor
 * is integrated, its results become fields on this aggregate and the queue starts
 * showing them — the shape is already right for that.
 *
 * ── Why a submission is immutable once decided ─────────────────────────────────
 * Same reasoning as a deposit claim. Re-deciding in place would overwrite the
 * record of what was decided and when, which is the only thing this table exists to
 * prove. A customer who was rejected submits again; that is a new row.
 */

export type VerificationStatus = 'pending' | 'approved' | 'rejected';

/**
 * Document types accepted.
 *
 * Kept narrow on purpose: each is a government-issued photo document with a number
 * an operator can read off the image and compare to the typed field. A utility bill
 * or a bank statement proves an address, which is a different claim needing a
 * different decision, and mixing them into one queue makes both harder to work.
 */
export type IdentityDocumentType = 'passport' | 'national-id' | 'drivers-licence';

export const DOCUMENT_TYPES: readonly IdentityDocumentType[] = [
  'passport',
  'national-id',
  'drivers-licence',
];

export function isDocumentType(value: string): value is IdentityDocumentType {
  return (DOCUMENT_TYPES as readonly string[]).includes(value);
}

export type DocumentContentType = ImageContentType;

/**
 * Largest identity document accepted.
 *
 * Four megabytes rather than the deposit proof's two: a proof is a screenshot of an
 * app, and this is a photograph of a physical document taken on a phone, where too
 * much compression is what makes a document number unreadable — and an unreadable
 * document is a rejection and a resubmission. It is still a cap, for the reason the
 * ledger's is: these bytes live in a 512 MB database.
 */
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

export function inspectDocument(bytes: Uint8Array): ImageInspection {
  return inspectImageBytes(bytes, { maxBytes: MAX_DOCUMENT_BYTES });
}

/** Bounds on the untrusted typed fields. */
export const MAX_FULL_NAME = 140;
export const MIN_FULL_NAME = 2;
export const MAX_DOCUMENT_NUMBER = 64;
export const MIN_DOCUMENT_NUMBER = 4;
export const MAX_REASON = 500;

/**
 * Youngest account holder accepted.
 *
 * Eighteen is the floor almost every jurisdiction puts under a financial account,
 * and checking it here rather than in the form means a submission that would have
 * to be rejected never reaches an operator's queue.
 */
export const MINIMUM_AGE_YEARS = 18;

export interface IdentityVerificationSnapshot {
  readonly id: string;
  readonly userId: UserId;
  /** As written on the document, not the display name on the account. */
  readonly fullName: string;
  /** Date-only. Stored and compared in UTC; a birthday has no time of day. */
  readonly dateOfBirth: string;
  /** ISO 3166-1 alpha-2, upper case. */
  readonly country: string;
  readonly documentType: IdentityDocumentType;
  readonly documentNumber: string;
  /** Key of the stored image. Never a filename the customer chose. */
  readonly documentId: string;
  readonly status: VerificationStatus;
  readonly submittedAt: Date;
  readonly decidedAt: Date | null;
  readonly decidedBy: UserId | null;
  /** Required on a rejection. The customer is shown it. */
  readonly reason: string | null;
}

export class IdentityVerification {
  readonly id: string;
  readonly userId: UserId;
  readonly fullName: string;
  readonly dateOfBirth: string;
  readonly country: string;
  readonly documentType: IdentityDocumentType;
  readonly documentNumber: string;
  readonly documentId: string;
  readonly submittedAt: Date;
  private _status: VerificationStatus;
  private _decidedAt: Date | null;
  private _decidedBy: UserId | null;
  private _reason: string | null;

  private constructor(snapshot: IdentityVerificationSnapshot) {
    this.id = snapshot.id;
    this.userId = snapshot.userId;
    this.fullName = snapshot.fullName;
    this.dateOfBirth = snapshot.dateOfBirth;
    this.country = snapshot.country;
    this.documentType = snapshot.documentType;
    this.documentNumber = snapshot.documentNumber;
    this.documentId = snapshot.documentId;
    this.submittedAt = snapshot.submittedAt;
    this._status = snapshot.status;
    this._decidedAt = snapshot.decidedAt;
    this._decidedBy = snapshot.decidedBy;
    this._reason = snapshot.reason;
  }

  /**
   * Builds a pending submission, or throws.
   *
   * Throws rather than returning a `Result` because every condition below is one
   * the calling use case has already turned into a `DomainError` for the customer.
   * Reaching this constructor with a blank name is a bug in that use case, not a
   * user mistake — and the aggregate is the last place that can guarantee no
   * malformed row ever reaches the table.
   */
  static submit(input: {
    id: string;
    userId: UserId;
    fullName: string;
    dateOfBirth: string;
    country: string;
    documentType: IdentityDocumentType;
    documentNumber: string;
    documentId: string;
    now: Date;
  }): IdentityVerification {
    const fullName = collapseSpaces(input.fullName);
    if (fullName.length < MIN_FULL_NAME || fullName.length > MAX_FULL_NAME) {
      throw new RangeError('A verification requires a name as written on the document.');
    }

    const country = input.country.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) {
      throw new RangeError('A verification requires a two-letter country code.');
    }

    const documentNumber = input.documentNumber.trim().toUpperCase();
    if (
      documentNumber.length < MIN_DOCUMENT_NUMBER ||
      documentNumber.length > MAX_DOCUMENT_NUMBER
    ) {
      throw new RangeError('A verification requires the document number.');
    }

    if (!isBirthDate(input.dateOfBirth, input.now)) {
      throw new RangeError('A verification requires a valid date of birth.');
    }

    if (input.documentId.trim().length === 0) {
      throw new RangeError('A verification requires a stored document.');
    }

    return new IdentityVerification({
      id: input.id,
      userId: input.userId,
      fullName,
      dateOfBirth: input.dateOfBirth,
      country,
      documentType: input.documentType,
      documentNumber,
      documentId: input.documentId,
      status: 'pending',
      submittedAt: input.now,
      decidedAt: null,
      decidedBy: null,
      reason: null,
    });
  }

  static rehydrate(snapshot: IdentityVerificationSnapshot): IdentityVerification {
    return new IdentityVerification(snapshot);
  }

  get status(): VerificationStatus {
    return this._status;
  }

  get isPending(): boolean {
    return this._status === 'pending';
  }

  approve(by: UserId, now: Date): void {
    this.assertPending();
    this._status = 'approved';
    this._decidedAt = now;
    this._decidedBy = by;
  }

  /**
   * A reason is mandatory and the customer is shown it.
   *
   * A refusal with no stated reason produces a person who resubmits the identical
   * document, and a queue that grows by one every time. It is also the only part of
   * this record that can be challenged, so it has to exist to be challenged.
   */
  reject(by: UserId, reason: string, now: Date): void {
    this.assertPending();
    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      throw new RangeError('A rejection requires a reason.');
    }
    this._status = 'rejected';
    this._decidedAt = now;
    this._decidedBy = by;
    this._reason = trimmed.slice(0, MAX_REASON);
  }

  private assertPending(): void {
    if (this._status !== 'pending') {
      throw new Error(`This verification was already ${this._status}.`);
    }
  }

  snapshot(): IdentityVerificationSnapshot {
    return {
      id: this.id,
      userId: this.userId,
      fullName: this.fullName,
      dateOfBirth: this.dateOfBirth,
      country: this.country,
      documentType: this.documentType,
      documentNumber: this.documentNumber,
      documentId: this.documentId,
      status: this._status,
      submittedAt: this.submittedAt,
      decidedAt: this._decidedAt,
      decidedBy: this._decidedBy,
      reason: this._reason,
    };
  }
}

/** `John  Smith ` → `John Smith`. A name is not compared on its whitespace. */
function collapseSpaces(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * True when the string is a real `YYYY-MM-DD` in the past, at least
 * `MINIMUM_AGE_YEARS` ago.
 *
 * Parsed by hand rather than handed to `new Date(value)`: that constructor accepts
 * `2026-02-31` and silently rolls it to March, so a typo would become a plausible
 * birthday instead of a rejection. Round-tripping through the parts is what makes
 * an impossible date impossible.
 */
function isBirthDate(value: string, now: Date): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;

  const [, year = '', month = '', day = ''] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(parsed.getTime())) return false;

  // The roll-over check: Date.UTC(2026, 1, 31) is 2026-03-03, whose month is not 1.
  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() !== Number(month) - 1 ||
    parsed.getUTCDate() !== Number(day)
  ) {
    return false;
  }

  if (parsed.getTime() >= now.getTime()) return false;

  const eighteenth = new Date(
    Date.UTC(Number(year) + MINIMUM_AGE_YEARS, Number(month) - 1, Number(day)),
  );
  return eighteenth.getTime() <= now.getTime();
}
