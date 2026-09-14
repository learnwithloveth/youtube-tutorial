'use server';

import { revalidatePath } from 'next/cache';

import { presentLedgerError } from '@/modules/ledger';
import { logger } from '@/platform/observability/logger';
import { requireAdmin } from '@/server/auth';
import { ledger } from '@/server/ledger';
import type { UserId } from '@/shared/kernel/ids';

import type { TriageFormState } from './form-state';

/**
 * Clearing or escalating one finding.
 *
 * ── The check is repeated here ────────────────────────────────────────────────
 * A Server Action is a public endpoint and the console layout protects only the
 * page. The operator id recorded against the decision is the one this check
 * returns, never a value from the form.
 *
 * ── No activity entry, and that is deliberate ─────────────────────────────────
 * The trail is keyed by *account*, and a finding like "one address, several
 * accounts" concerns a set of them — filing it against one would misattribute it,
 * and filing it against all of them would put "somebody looked at you" on several
 * customers' records for an operator's bookkeeping. The decision, the operator and
 * the moment are on the disposition row, which is where a reviewer of this queue
 * already is.
 */
export async function triageRiskSignalAction(
  _previous: TriageFormState,
  formData: FormData,
): Promise<TriageFormState> {
  const operator = await requireAdmin('/admin/surveillance');

  const context = ledger();
  if (context === null) {
    return { status: 'error', message: 'The ledger is unavailable.', key: null };
  }

  const key = String(formData.get('key') ?? '');
  const disposition = formData.get('disposition') === 'escalate' ? 'escalated' : 'cleared';
  const note = String(formData.get('note') ?? '');

  const result = await context.decideRiskSignal({
    key,
    disposition,
    decidedBy: operator.id as UserId,
    note,
  });

  if (!result.ok) {
    return { status: 'error', message: presentLedgerError(result.error), key };
  }

  logger.info({
    event: 'risk_signal_triaged',
    module: 'ledger',
    disposition,
    operatorId: operator.id,
  });

  revalidatePath('/admin/surveillance');
  revalidatePath('/admin');

  return {
    status: 'decided',
    message: disposition === 'escalated' ? 'Escalated.' : 'Cleared.',
    key,
  };
}
