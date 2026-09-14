import { describe, expect, it } from 'vitest';

import type { UserId } from '@/shared/kernel/ids';

import { IdentityVerification, MINIMUM_AGE_YEARS } from '../identity-verification';

const USER = 'user_1' as UserId;
const NOW = new Date('2026-09-14T12:00:00Z');

function submit(overrides: Partial<Parameters<typeof IdentityVerification.submit>[0]> = {}) {
  return IdentityVerification.submit({
    id: 'ver_1',
    userId: USER,
    fullName: 'Ada Lovelace',
    dateOfBirth: '1990-05-04',
    country: 'gb',
    documentType: 'passport',
    documentNumber: 'p1234567',
    documentId: 'doc_1',
    now: NOW,
    ...overrides,
  });
}

describe('IdentityVerification.submit', () => {
  it('normalises the fields an operator will compare against the image', () => {
    const snapshot = submit({ fullName: '  Ada   Lovelace ' }).snapshot();

    // Collapsed, upper-cased: two submissions of the same document must not look
    // different because somebody double-spaced a name or typed a lowercase code.
    expect(snapshot.fullName).toBe('Ada Lovelace');
    expect(snapshot.country).toBe('GB');
    expect(snapshot.documentNumber).toBe('P1234567');
    expect(snapshot.status).toBe('pending');
  });

  it('refuses a date that only looks like one', () => {
    // `new Date('2026-02-31')` rolls to March and would turn a typo into a
    // plausible birthday. The parse is done by hand for exactly this.
    expect(() => submit({ dateOfBirth: '1990-02-31' })).toThrow(RangeError);
    expect(() => submit({ dateOfBirth: '1990-13-01' })).toThrow(RangeError);
    expect(() => submit({ dateOfBirth: '04/05/1990' })).toThrow(RangeError);
  });

  it('refuses a birth date in the future', () => {
    expect(() => submit({ dateOfBirth: '2030-01-01' })).toThrow(RangeError);
  });

  it('applies the age floor on the birthday itself, not a year either side', () => {
    const onTheDay = `${NOW.getUTCFullYear() - MINIMUM_AGE_YEARS}-09-14`;
    const dayLate = `${NOW.getUTCFullYear() - MINIMUM_AGE_YEARS}-09-15`;

    // Eighteen today is eighteen. Eighteen tomorrow is not.
    expect(() => submit({ dateOfBirth: onTheDay })).not.toThrow();
    expect(() => submit({ dateOfBirth: dayLate })).toThrow(RangeError);
  });

  it('refuses a submission with no stored document', () => {
    // The aggregate cannot be constructed without one, so no path through the code
    // produces an unevidenced case for an operator to approve by accident.
    expect(() => submit({ documentId: '  ' })).toThrow(RangeError);
  });

  it('refuses a country that is not two letters', () => {
    expect(() => submit({ country: 'GBR' })).toThrow(RangeError);
    expect(() => submit({ country: '' })).toThrow(RangeError);
  });
});

describe('deciding', () => {
  it('records who decided and when', () => {
    const verification = submit();
    const operator = 'op_1' as UserId;
    const at = new Date('2026-09-15T09:30:00Z');

    verification.approve(operator, at);

    const snapshot = verification.snapshot();
    expect(snapshot.status).toBe('approved');
    expect(snapshot.decidedBy).toBe(operator);
    expect(snapshot.decidedAt).toEqual(at);
  });

  it('refuses a second decision', () => {
    // Two operators working the same queue is ordinary. Without this the later
    // click silently replaces the earlier decision, including the reason the
    // customer has already been told.
    const verification = submit();
    verification.approve('op_1' as UserId, NOW);

    expect(() => verification.approve('op_2' as UserId, NOW)).toThrow(/already approved/);
    expect(() => verification.reject('op_2' as UserId, 'Blurred', NOW)).toThrow(
      /already approved/,
    );
  });

  it('requires a reason to reject', () => {
    const verification = submit();
    expect(() => verification.reject('op_1' as UserId, '   ', NOW)).toThrow(RangeError);
    // And the refusal leaves the case decidable, rather than half-rejected.
    expect(verification.isPending).toBe(true);
  });

  it('keeps the reason the customer is shown', () => {
    const verification = submit();
    verification.reject('op_1' as UserId, '  The document number is unreadable.  ', NOW);
    expect(verification.snapshot().reason).toBe('The document number is unreadable.');
  });
});
