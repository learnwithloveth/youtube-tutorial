'use server';

import { notFound } from 'next/navigation';

import { presentLedgerError } from '@/modules/ledger';
import { logger } from '@/platform/observability/logger';
import { recordActivity } from '@/server/activity';
import { getCurrentUser } from '@/server/auth';
import { ledger } from '@/server/ledger';
import { describeRequest } from '@/server/request-context';
import { toUserId } from '@/shared/kernel/ids';

import type { ReceiptFormState } from './form-state';

/**
 * Emails a customer the receipt for one transaction.
 *
 * ── The action re-derives its own authority ────────────────────────────────────
 * A Server Action is a public endpoint. The console's layout protects the page and
 * nothing else, so the session is read again here and a signed-in customer gets a
 * 404 rather than a 403 — the reason the rest of the console does.
 *
 * ── It is written to the activity trail ────────────────────────────────────────
 * Against the *customer's* account, because "what happened to this account"
 * includes being emailed about their own money — and an operator investigating a
 * dispute needs to see that a receipt went out, when, and to which address. The
 * address is masked before it is recorded: a trail that prints addresses in full
 * is one that leaks them to everybody who can read it.
 */
export async function sendReceiptAction(
  _state: ReceiptFormState,
  formData: FormData,
): Promise<ReceiptFormState> {
  const operator = await getCurrentUser();
  if (operator === null || operator.role !== 'admin') notFound();

  const kind = formData.get('kind');
  const recordId = formData.get('recordId');

  if ((kind !== 'deposit' && kind !== 'withdrawal') || typeof recordId !== 'string') {
    return { status: 'error', message: 'That request was not understood.' };
  }

  const context = ledger();
  if (context === null) {
    return { status: 'error', message: 'The ledger is unavailable.' };
  }

  // No `requiredUserId`: an operator may send any customer their own receipt. The
  // *customer-facing* path passes their id, and both go through the same use case
  // so the rule cannot diverge between them.
  const result = await context.sendReceipt({ kind, recordId });

  if (!result.ok) {
    return { status: 'error', message: presentLedgerError(result.error) };
  }

  // Parsed rather than cast: the id arrives in a form field, and a malformed one
  // must not become a row keyed on nonsense. A trail entry is worth losing before
  // the receipt that was already sent is worth failing over.
  const customerId = formData.get('userId');
  const request = await describeRequest();

  try {
    await recordActivity({
      userId: toUserId(typeof customerId === 'string' ? customerId : ''),
      kind: 'receipt-sent',
      reference: result.value.reference,
      detail: `to ${result.value.sentTo}`,
      location: request.location,
      agent: request.agent,
      ipDigest: request.ipDigest,
    });
  } catch {
    logger.warn({ event: 'receipt_trail_write_skipped', module: 'ledger' });
  }

  logger.info({
    event: 'receipt_sent',
    module: 'ledger',
    kind,
    reference: result.value.reference,
    operatorId: operator.id,
  });

  return { status: 'sent', message: `Receipt sent to ${result.value.sentTo}.` };
}
