import { err, ok, type Result } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import type { VerificationStatus } from '../../domain/identity-verification';
import { IdentityErrors, type IdentityError } from '../errors';
import type { IdentityDependencies } from '../ports';

/**
 * An operator approves or rejects an identity submission.
 *
 * ── A decision is made once ───────────────────────────────────────────────────
 * The aggregate refuses a second one. Two operators opening the same case is the
 * ordinary way a queue is worked, and without this the later click silently
 * overwrites the earlier decision — including the reason the customer was already
 * told. Whoever loses the race is shown what was decided instead of a blank result.
 *
 * ── The decider is recorded, and it is not optional ───────────────────────────
 * "Who approved this account" is the first question asked after an account turns
 * out to be somebody else's. It is a column, not a log line.
 */

export interface DecideVerificationCommand {
  readonly verificationId: string;
  readonly decidedBy: UserId;
  readonly action: 'approve' | 'reject';
  /** Required when rejecting. The customer is shown it. */
  readonly reason?: string | undefined;
}

export interface DecideVerificationResult {
  readonly verificationId: string;
  readonly userId: UserId;
  readonly status: VerificationStatus;
}

export type DecideVerification = (
  command: DecideVerificationCommand,
) => Promise<Result<DecideVerificationResult, IdentityError>>;

export function createDecideVerification(deps: IdentityDependencies): DecideVerification {
  return async function decideVerification(command) {
    const verification = await deps.verifications.find(command.verificationId);
    if (verification === null) return err(IdentityErrors.verificationNotFound());

    if (!verification.isPending) {
      return err(IdentityErrors.verificationAlreadyDecided(verification.status));
    }

    const now = deps.clock.now();

    if (command.action === 'approve') {
      verification.approve(command.decidedBy, now);
    } else {
      const reason = command.reason?.trim() ?? '';
      if (reason.length === 0) return err(IdentityErrors.verificationReasonRequired());
      verification.reject(command.decidedBy, reason, now);
    }

    await deps.verifications.save(verification);

    return ok({
      verificationId: verification.id,
      userId: verification.userId,
      status: verification.status,
    });
  };
}
