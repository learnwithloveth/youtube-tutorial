import { describe, expect, it } from 'vitest';

import { fixedClock } from '@/shared/kernel/clock';
import type { UserId } from '@/shared/kernel/ids';

import { createDecideVerification } from '../use-cases/decide-verification';
import { createSubmitVerification } from '../use-cases/submit-verification';
import type { IdentityDependencies } from '../ports';
import { FakeDocuments, FakeVerifications, pngBytes } from './fake-verifications';

/**
 * The submission and adjudication path, against in-memory ports.
 *
 * Only the two verification ports are real here — the rest of the dependency bag is
 * never touched by these use cases, and supplying working fakes for a scrypt hasher
 * and an SMTP sender to test a file upload would be noise.
 */

const USER = 'user_1' as UserId;
const OPERATOR = 'op_1' as UserId;
const NOW = new Date('2026-09-14T12:00:00Z');

function makeDeps() {
  const verifications = new FakeVerifications();
  const documents = new FakeDocuments();

  const deps = {
    verifications,
    documents,
    clock: fixedClock(NOW),
  } as unknown as IdentityDependencies;

  return { deps, verifications, documents };
}

const VALID = {
  userId: USER,
  fullName: 'Ada Lovelace',
  dateOfBirth: '1990-05-04',
  country: 'GB',
  documentType: 'passport',
  documentNumber: 'P1234567',
  document: pngBytes(),
};

describe('submitting', () => {
  it('stores the document and files a pending case', async () => {
    const { deps, verifications, documents } = makeDeps();
    const result = await createSubmitVerification(deps)(VALID);

    expect(result.ok).toBe(true);
    expect(documents.store.size).toBe(1);

    const [stored] = [...verifications.store.values()];
    expect(stored?.status).toBe('pending');
    expect(stored?.userId).toBe(USER);
  });

  it('refuses bytes that are not a real image, whatever the client called them', async () => {
    const { deps, documents } = makeDeps();

    // An HTML file named `passport.png`. The declared type is discarded entirely —
    // this is the check that stops a stored-XSS being served back to an operator.
    const html = new TextEncoder().encode('<html><script>alert(1)</script></html>'.repeat(20));
    const result = await createSubmitVerification(deps)({ ...VALID, document: html });

    expect(result.ok).toBe(false);
    // And nothing was written: a rejected upload must not leave bytes behind.
    expect(documents.store.size).toBe(0);
  });

  it('refuses a second submission while one is waiting', async () => {
    const { deps, verifications } = makeDeps();
    const submit = createSubmitVerification(deps);

    await submit(VALID);
    const second = await submit(VALID);

    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error._tag).toBe('VerificationAlreadyPending');
    expect(verifications.store.size).toBe(1);
  });

  it('refuses a resubmission once the account is verified', async () => {
    const { deps, verifications } = makeDeps();
    const submit = createSubmitVerification(deps);
    const decide = createDecideVerification(deps);

    const first = await submit(VALID);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    await decide({
      verificationId: first.value.verificationId,
      decidedBy: OPERATOR,
      action: 'approve',
    });

    const again = await submit(VALID);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error._tag).toBe('VerificationAlreadyApproved');
    expect(verifications.store.size).toBe(1);
  });

  it('lets a refused customer submit again', async () => {
    // The counterpart to the rule above, and the reason a decision is never
    // reopened in place: a rejection has to leave a path forward.
    const { deps, verifications } = makeDeps();
    const submit = createSubmitVerification(deps);
    const decide = createDecideVerification(deps);

    const first = await submit(VALID);
    if (!first.ok) throw new Error('setup failed');

    await decide({
      verificationId: first.value.verificationId,
      decidedBy: OPERATOR,
      action: 'reject',
      reason: 'The document number is unreadable.',
    });

    const second = await submit(VALID);
    expect(second.ok).toBe(true);
    expect(verifications.store.size).toBe(2);
  });

  it('turns an impossible date into a refusal rather than a thrown error', async () => {
    const { deps } = makeDeps();
    const result = await createSubmitVerification(deps)({ ...VALID, dateOfBirth: '1990-02-31' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error._tag).toBe('VerificationDateOfBirthInvalid');
  });
});

describe('deciding', () => {
  it('refuses a rejection with no reason, and leaves the case decidable', async () => {
    const { deps } = makeDeps();
    const submitted = await createSubmitVerification(deps)(VALID);
    if (!submitted.ok) throw new Error('setup failed');

    const decide = createDecideVerification(deps);
    const refused = await decide({
      verificationId: submitted.value.verificationId,
      decidedBy: OPERATOR,
      action: 'reject',
      reason: '   ',
    });

    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error._tag).toBe('VerificationReasonRequired');

    // Still workable afterwards, rather than stuck half-decided.
    const retry = await decide({
      verificationId: submitted.value.verificationId,
      decidedBy: OPERATOR,
      action: 'reject',
      reason: 'Blurred.',
    });
    expect(retry.ok).toBe(true);
  });

  it('refuses the second of two operators deciding the same case', async () => {
    const { deps } = makeDeps();
    const submitted = await createSubmitVerification(deps)(VALID);
    if (!submitted.ok) throw new Error('setup failed');

    const decide = createDecideVerification(deps);
    const first = await decide({
      verificationId: submitted.value.verificationId,
      decidedBy: OPERATOR,
      action: 'approve',
    });
    const second = await decide({
      verificationId: submitted.value.verificationId,
      decidedBy: 'op_2' as UserId,
      action: 'reject',
      reason: 'Changed my mind.',
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error._tag).toBe('VerificationAlreadyDecided');
  });

  it('answers not-found for an id that does not exist', async () => {
    const { deps } = makeDeps();
    const result = await createDecideVerification(deps)({
      verificationId: 'nope',
      decidedBy: OPERATOR,
      action: 'approve',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error._tag).toBe('VerificationNotFound');
  });
});
