import { err, ok, type Result } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import { LedgerErrors, type LedgerError } from '../../domain/errors';
import { getReceipt, type ReceiptDto } from '../queries/receipt';
import type { TransactionKind } from '../queries/transactions';
import type { LedgerDependencies } from '../ports';

/**
 * Emails a customer their receipt.
 *
 * ── The wording lives here, the transport does not ─────────────────────────────
 * The port takes a rendered message rather than a template name, so what the email
 * *says* is reviewable in the same file as the rule about when it is sent — and the
 * adapter owns nothing but the connection. The same arrangement identity uses for
 * its verification mail.
 *
 * ── A receipt is only sent for something that happened ─────────────────────────
 * Pending is refused. A document headed "receipt" for a deposit nobody has
 * confirmed is a customer believing money has arrived when an operator has not yet
 * agreed that it did — and the whole point of the claim/credit split is that those
 * are different states.
 *
 * Rejections *are* sent, and deliberately: somebody whose deposit was refused needs
 * the reason in writing more than somebody whose deposit worked.
 */

export interface SendReceiptCommand {
  readonly kind: TransactionKind;
  readonly recordId: string;
  /** When given, only that customer's own record produces a receipt. */
  readonly requiredUserId?: UserId | undefined;
}

export interface SendReceiptResult {
  readonly reference: string;
  /** Masked before it leaves this layer — a console log should not carry it plain. */
  readonly sentTo: string;
}

export type SendReceipt = (
  command: SendReceiptCommand,
) => Promise<Result<SendReceiptResult, LedgerError>>;

export function createSendReceipt(deps: LedgerDependencies): SendReceipt {
  return async function sendReceipt(command) {
    const sender = deps.receipts;
    const directory = deps.directory;
    if (sender === undefined || directory === undefined) {
      return err(LedgerErrors.receiptsUnavailable());
    }

    const receipt = await getReceipt(
      deps,
      command.kind,
      command.recordId,
      command.requiredUserId,
    );
    if (receipt === null) {
      return err(
        command.kind === 'deposit'
          ? LedgerErrors.depositClaimNotFound(command.recordId)
          : LedgerErrors.withdrawalNotFound(command.recordId),
      );
    }

    if (receipt.status === 'pending') return err(LedgerErrors.receiptNotYetAvailable());

    const to = await directory.emailFor(receipt.userId as UserId);
    if (to === null) return err(LedgerErrors.receiptNoAddress());

    const delivery = await sender.send({
      to,
      subject: subjectFor(receipt),
      text: textFor(receipt),
      html: htmlFor(receipt),
    });

    if (!delivery.sent) {
      return err(LedgerErrors.receiptSendFailed(delivery.reason ?? 'The mail server refused it.'));
    }

    return ok({ reference: receipt.reference, sentTo: mask(to) });
  };
}

function subjectFor(receipt: ReceiptDto): string {
  const noun = receipt.kind === 'deposit' ? 'deposit' : 'withdrawal';
  return receipt.status === 'rejected'
    ? `Your ${noun} was not accepted — ${receipt.reference}`
    : `Receipt for your ${noun} — ${receipt.amount}`;
}

/**
 * The plain-text body.
 *
 * Written first and in full, not as a fallback afterthought: a mail client that
 * refuses HTML, a screen reader, and a person forwarding the message to their
 * accountant all read this one. It carries every figure the HTML does.
 */
function textFor(receipt: ReceiptDto): string {
  const rows = receipt.lines.map((line) => `  ${line.label}: ${line.value}`).join('\n');

  const outcome =
    receipt.status === 'rejected'
      ? `This ${receipt.kind} was not accepted.${receipt.reason ? `\nReason: ${receipt.reason}` : ''}`
      : `This ${receipt.kind} was completed.`;

  return [
    `Reference: ${receipt.reference}`,
    '',
    outcome,
    '',
    rows,
    '',
    `Requested: ${receipt.occurredAt}`,
    receipt.decidedAt !== null ? `Decided:   ${receipt.decidedAt}` : '',
    '',
    'This is a record of a movement on your account, not a tax invoice.',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

function htmlFor(receipt: ReceiptDto): string {
  const rows = receipt.lines
    .map(
      (line) =>
        `<tr><td style="padding:6px 0;color:#555">${escape(line.label)}</td>` +
        `<td style="padding:6px 0;text-align:right;font-family:ui-monospace,monospace">${escape(line.value)}` +
        (line.note ? `<div style="color:#888;font-size:12px">${escape(line.note)}</div>` : '') +
        `</td></tr>`,
    )
    .join('');

  // Inline styles and a table, because that is what mail clients render. No
  // external stylesheet, no web font, no image — each of which is stripped,
  // blocked, or turns a receipt into a tracking pixel.
  return `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;color:#111">
  <h1 style="font-size:18px;margin:0 0 4px">${receipt.status === 'rejected' ? 'Not accepted' : 'Receipt'}</h1>
  <p style="margin:0 0 16px;color:#666;font-size:13px">Reference ${escape(receipt.reference)}</p>
  <p style="font-size:24px;margin:0 0 16px;font-family:ui-monospace,monospace">${escape(receipt.amount)}</p>
  ${receipt.reason ? `<p style="margin:0 0 16px;padding:10px;background:#fdf2f2;font-size:13px">${escape(receipt.reason)}</p>` : ''}
  <table style="width:100%;border-collapse:collapse;font-size:13px">${rows}</table>
  <p style="margin:20px 0 0;color:#888;font-size:12px">
    This is a record of a movement on your account, not a tax invoice.
  </p>
</div>`;
}

/** Minimal, because every value here is our own data rather than user markup —
 *  but a deposit reference is typed by a customer, so it still gets escaped. */
function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mask(address: string): string {
  const [local = '', domain] = address.split('@');
  if (domain === undefined) return '•••';
  return `${local.slice(0, 1)}${'•'.repeat(Math.max(local.length - 1, 1))}@${domain}`;
}
