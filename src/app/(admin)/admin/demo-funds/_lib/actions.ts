'use server';

import { revalidatePath } from 'next/cache';

import { presentLedgerError } from '@/modules/ledger';
import { logger } from '@/platform/observability/logger';
import { identity, requireAdmin } from '@/server/auth';
import { ledger } from '@/server/ledger';
import { recordAndPush } from '@/server/push';
import { describeRequest } from '@/server/request-context';
import { trimDecimalString } from '@/shared/kernel';
import { toUserId, type UserId } from '@/shared/kernel/ids';

import type { GrantFormState } from './form-state';

/**
 * The demo-funds write boundary.
 *
 * ── The authorisation check is here, not in the layout ────────────────────────
 * `(admin)/layout.tsx` runs `requireAdmin` and that protects the *page*. It
 * protects nothing here: a Server Action is a public endpoint anyone can invoke
 * directly, and this one creates a balance out of nothing. So the check is
 * repeated, and the operator id it returns is the one recorded as the issuer —
 * never a value from the form, which would make "who funded this account" a
 * matter of typing somebody else's id.
 *
 * ── The recipient is checked to exist before anything is credited ─────────────
 * `findOrOpen` does what its name says: hand it a `UserId` nobody has and it
 * opens a ledger account for that nobody, and the transfer balances perfectly
 * into a void. Identity is asked first, so a typo or a stale form produces a
 * refusal rather than an orphaned account that shows up in a reconciliation
 * months later with no owner to attach it to.
 *
 * ── The email is awaited, unlike every other mail in this codebase ────────────
 * Elsewhere a message goes out in `after`, because nobody asked for it and a slow
 * mail server must not hold up a form. Here an operator ticked a box, so whether
 * it went is part of what they asked for — reporting "funded" while the message
 * silently failed in the background would answer a different question from the one
 * they put. It still cannot fail the grant: the send happens after the credit has
 * committed, and its failure is reported beside the success rather than instead of
 * it.
 */
export async function grantDemoFundsAction(
  _previous: GrantFormState,
  formData: FormData,
): Promise<GrantFormState> {
  const operator = await requireAdmin('/admin/demo-funds');

  const refuse = (message: string): GrantFormState => ({
    status: 'error',
    message,
    emailed: null,
    emailProblem: null,
  });

  const context = ledger();
  if (context === null) {
    return refuse('The ledger is unavailable on this deployment.');
  }

  // A hand-edited form field is an ordinary way to arrive here with something
  // that is not a UUID, and `toUserId` throws on one.
  let userId: UserId;
  try {
    userId = toUserId(String(formData.get('userId') ?? ''));
  } catch {
    return refuse('That is not an account this platform knows.');
  }

  const accounts = await identity().describeUsers([userId]);
  const recipient = accounts.get(userId);
  if (recipient === undefined) {
    return refuse('That account no longer exists.');
  }

  const asset = String(formData.get('asset') ?? '');
  const network = String(formData.get('network') ?? '');
  const amount = String(formData.get('amount') ?? '');
  const note = String(formData.get('note') ?? '');
  // An unchecked checkbox submits nothing at all, which is why this reads as a
  // presence test rather than comparing to 'false'.
  const notify = formData.get('notify') !== null;

  const result = await context.grantDemoFunds({
    userId,
    asset,
    network,
    amount,
    note,
    issuedBy: operator.id as UserId,
  });

  if (!result.ok) {
    logger.warn({
      event: 'demo_funds_refused',
      module: 'ledger',
      reason: result.error.kind,
      userId,
    });
    return refuse(presentLedgerError(result.error));
  }

  const shown = trimDecimalString(amount.trim());
  const request = await describeRequest();

  // Recorded against the *recipient*, not the operator, for the reason every
  // other money entry in this trail is: the question it answers is "what happened
  // to this account". The operator is named in the reference, so the entry is
  // still attributable to a person.
  await recordAndPush({
    userId,
    kind: 'demo-funds-granted',
    reference: `by ${operator.email}`,
    // Trimmed: an 18-decimal asset would otherwise put
    // "1.000000000000000000 ETH" in the customer's notification bell.
    detail: `${shown} ${result.value.asset} on ${result.value.networkLabel}`,
    location: request.location,
    agent: request.agent,
    ipDigest: request.ipDigest,
  });

  logger.info({
    event: 'demo_funds_granted',
    module: 'ledger',
    userId,
    asset: result.value.asset,
    transferId: result.value.transferId,
    txHash: result.value.txHash,
  });

  let emailed: boolean | null = null;
  let emailProblem: string | null = null;

  if (notify) {
    const sent = await context.sendDemoFundsEmail({
      userId,
      asset: result.value.asset,
      amount: amount.trim(),
      networkLabel: result.value.networkLabel,
      txHash: result.value.txHash,
      note,
      balance: result.value.balance,
    });

    emailed = sent.ok;
    if (!sent.ok) {
      emailProblem = presentLedgerError(sent.error);
      logger.warn({
        event: 'demo_funds_email_failed',
        module: 'ledger',
        reason: sent.error.kind,
        userId,
      });
    }
  }

  // Their balance moved, so every surface that states one is now stale. The
  // operator's own list is revalidated too — they may well have just funded
  // themselves, and the console shows balances nowhere else.
  revalidatePath('/admin/demo-funds');
  revalidatePath('/app');
  revalidatePath('/app/wallet');
  revalidatePath('/app/transactions');

  return {
    status: 'granted',
    message: `${shown} ${result.value.asset} on ${result.value.networkLabel} added to ${recipient.name}. Their balance is now ${trimDecimalString(result.value.balance)} ${result.value.asset}.`,
    emailed,
    emailProblem,
  };
}
