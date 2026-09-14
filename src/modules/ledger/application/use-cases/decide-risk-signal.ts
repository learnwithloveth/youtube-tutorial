import { err, ok, type Result } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import { LedgerErrors, type LedgerError } from '../../domain/errors';
import type { LedgerDependencies, RiskDisposition } from '../ports';

/**
 * An operator clears or escalates one finding.
 *
 * ── It records a decision, it does not act on one ─────────────────────────────
 * Escalating writes a row saying somebody thought this needed more attention. It
 * does not freeze an account, block a payout or notify anybody, and it must not
 * start doing so quietly — a button that reads "Escalate" and silently suspends
 * accounts is how somebody gets locked out by a click they thought was a bookmark.
 * Freezing an account is the users page, deliberately somewhere else and
 * deliberately harder.
 *
 * ── A note is required to escalate ────────────────────────────────────────────
 * The rule already says what matched; what the next person needs is why *this one*
 * was not ordinary. Clearing takes an optional note, because "checked, it is the
 * customer's own second account" is worth recording and "nothing here" is not worth
 * typing.
 */

export interface DecideRiskSignalCommand {
  readonly key: string;
  readonly disposition: RiskDisposition;
  readonly decidedBy: UserId;
  readonly note?: string | undefined;
}

export type DecideRiskSignal = (
  command: DecideRiskSignalCommand,
) => Promise<Result<{ key: string }, LedgerError>>;

export function createDecideRiskSignal(deps: LedgerDependencies): DecideRiskSignal {
  return async function decideRiskSignal(command) {
    const store = deps.dispositions;
    if (store === undefined) return err(LedgerErrors.riskUnavailable());

    const note = command.note?.trim() ?? '';
    if (command.disposition === 'escalated' && note.length === 0) {
      return err(LedgerErrors.riskNoteRequired());
    }

    if (command.key.trim().length === 0) return err(LedgerErrors.riskSignalNotFound());

    await store.record({
      key: command.key,
      disposition: command.disposition,
      decidedBy: command.decidedBy,
      decidedAt: deps.clock.now(),
      note: note.length === 0 ? null : note.slice(0, 500),
    });

    return ok({ key: command.key });
  };
}
