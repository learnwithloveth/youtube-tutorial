'use server';

import { revalidatePath } from 'next/cache';

import { presentLedgerError } from '@/modules/ledger';
import { logger } from '@/platform/observability/logger';
import { recordForAdmins } from '@/server/admin-alerts';
import { getCurrentUser } from '@/server/auth';
import { emailCustomerAbout, ledger } from '@/server/ledger';
import { describeRequest } from '@/server/request-context';
import type { UserId } from '@/shared/kernel/ids';

import type { WithdrawalFormState } from './form-state';
import { trimDecimalString } from '@/shared/kernel';

/**
 * The wallet's write boundary.
 *
 * ── Authority is re-derived here, always ───────────────────────────────────────
 * A Server Action is a public endpoint. The page that rendered the form protects
 * nothing — anyone who can read the page's JavaScript can invoke this directly with
 * whatever arguments they like. So the user id comes from the session cookie and
 * never from the form, and no amount of tampering with the payload can move another
 * account's money.
 *
 * This is the rule that matters most on this particular file. Everywhere else in
 * the application, getting it wrong leaks information; here it moves funds.
 */

export async function requestWithdrawalAction(
  _previous: WithdrawalFormState,
  formData: FormData,
): Promise<WithdrawalFormState> {
  const user = await getCurrentUser();
  if (!user) {
    return { status: 'error', message: 'Sign in to withdraw.', withdrawalId: null };
  }

  const context = ledger();
  if (context === null) {
    return {
      status: 'error',
      message: 'Withdrawals are unavailable right now. Nothing has been taken from your balance.',
      withdrawalId: null,
    };
  }

  const result = await context.requestWithdrawal({
    userId: user.id as UserId,
    asset: String(formData.get('asset') ?? ''),
    network: String(formData.get('network') ?? ''),
    destination: String(formData.get('destination') ?? ''),
    // A string all the way down. Parsing to a number here would defeat every
    // precaution the ledger takes below it.
    amount: String(formData.get('amount') ?? ''),
  });

  if (!result.ok) {
    logger.info({
      event: 'withdrawal_rejected',
      module: 'ledger',
      reason: result.error.kind,
    });
    return {
      status: 'error',
      message: presentLedgerError(result.error),
      withdrawalId: null,
    };
  }

  const context_ = await describeRequest();
  // Recorded for operators as well: a withdrawal request is waiting on one of them.
  await recordForAdmins({
    userId: user.id as UserId,
    kind: 'withdrawal-requested',
    reference: result.value.withdrawalId,
    detail: `${trimDecimalString(result.value.amount)} ${result.value.asset}`,
    location: context_.location,
    agent: context_.agent,
    ipDigest: context_.ipDigest,
  });

  // The customer's written copy of what they asked for, and what is now on hold.
  emailCustomerAbout('withdrawal', result.value.withdrawalId);

  // The balance and the pending list both changed, and the page reads them on the
  // server — without this the customer would see their old available balance until
  // something else happened to re-render.
  revalidatePath('/app/wallet');

  return {
    status: 'submitted',
    message:
      result.value.approvalsRequired > 1
        ? `Submitted. Withdrawals of this size need two approvals, so this one may take longer.`
        : 'Submitted for approval. Your balance is on hold until it is reviewed.',
    withdrawalId: result.value.withdrawalId,
  };
}
