import { afterEach, describe, expect, it, vi } from 'vitest';

import type { UserId } from '@/shared/kernel/ids';

import { IdentityVerification } from '../../domain/identity-verification';
import type { IdentityDependencies, VerificationRepository } from '../ports';
import { getVerificationStanding } from '../queries/verification-standing';
import { FakeVerifications } from './fake-verifications';

/**
 * What a customer's own account says about their verification.
 *
 * Built from real aggregates rather than hand-written rows, so a state the domain
 * cannot produce, like an approval with no decision time, never makes a test pass.
 */

const USER = 'user_1' as UserId;
const OTHER = 'user_2' as UserId;
const OPERATOR = 'op_1' as UserId;

function submitted(id: string, userId: UserId, at: string): IdentityVerification {
  return IdentityVerification.submit({
    id,
    userId,
    fullName: 'Ada Lovelace',
    dateOfBirth: '1990-05-04',
    country: 'GB',
    documentType: 'passport',
    documentNumber: 'P1234567',
    documentId: `doc_${id}`,
    now: new Date(at),
  });
}

async function standingOf(entries: readonly IdentityVerification[], userId: UserId = USER) {
  const verifications = new FakeVerifications();
  for (const entry of entries) await verifications.save(entry);
  return getVerificationStanding({ verifications } as unknown as IdentityDependencies, userId);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verification standing', () => {
  it('is unverified when the account has submitted nothing', async () => {
    // Somebody else's submission is not this account's.
    const theirs = submitted('ver_1', OTHER, '2026-09-01T09:00:00Z');

    expect(await standingOf([theirs])).toEqual({ state: 'unverified' });
  });

  it('is pending while the newest submission waits for a reviewer', async () => {
    const waiting = submitted('ver_1', USER, '2026-09-01T09:00:00Z');

    expect(await standingOf([waiting])).toEqual({
      state: 'pending',
      submittedAt: '2026-09-01T09:00:00.000Z',
    });
  });

  it("carries the reviewer's reason after a rejection", async () => {
    const refused = submitted('ver_1', USER, '2026-09-01T09:00:00Z');
    refused.reject(OPERATOR, 'The document number is not readable.', new Date('2026-09-02T10:00:00Z'));

    expect(await standingOf([refused])).toEqual({
      state: 'rejected',
      decidedAt: '2026-09-02T10:00:00.000Z',
      reason: 'The document number is not readable.',
    });
  });

  it('is pending again once a refused customer submits a new document', async () => {
    const refused = submitted('ver_1', USER, '2026-09-01T09:00:00Z');
    refused.reject(OPERATOR, 'Glare over the photo.', new Date('2026-09-02T10:00:00Z'));
    const retry = submitted('ver_2', USER, '2026-09-03T08:00:00Z');

    expect((await standingOf([refused, retry])).state).toBe('pending');
  });

  it('is approved when any submission was approved, whatever was refused before it', async () => {
    const refused = submitted('ver_1', USER, '2026-09-01T09:00:00Z');
    refused.reject(OPERATOR, 'Glare over the photo.', new Date('2026-09-02T10:00:00Z'));
    const accepted = submitted('ver_2', USER, '2026-09-03T08:00:00Z');
    accepted.approve(OPERATOR, new Date('2026-09-04T11:00:00Z'));

    expect(await standingOf([refused, accepted])).toEqual({
      state: 'approved',
      decidedAt: '2026-09-04T11:00:00.000Z',
    });
  });

  it('reports unavailable, never unverified, when the history cannot be read', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing: Pick<VerificationRepository, 'listForUser'> = {
      listForUser: () => Promise.reject(new Error('connection terminated')),
    };

    const standing = await getVerificationStanding(
      { verifications: failing } as unknown as IdentityDependencies,
      USER,
    );

    // "Unverified" here would invite a second submission of a document already
    // in the queue, so the failure has to be visible as a failure.
    expect(standing).toEqual({ state: 'unavailable' });
    expect(logged).toHaveBeenCalledOnce();
  });
});
