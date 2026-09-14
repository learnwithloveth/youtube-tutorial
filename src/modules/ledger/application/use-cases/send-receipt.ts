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

/** `Ethereum Withdrawal` — the same title the printed page carries. */
function titleFor(receipt: ReceiptDto): string {
  return `${receipt.assetName} ${receipt.kind === 'deposit' ? 'Deposit' : 'Withdrawal'}`;
}

/** `1 ETH` — trailing zeros dropped, for the headline and the subject only. */
function headlineFor(receipt: ReceiptDto): string {
  return `${receipt.amount} ${receipt.asset}`;
}

function subjectFor(receipt: ReceiptDto): string {
  const noun = receipt.kind === 'deposit' ? 'deposit' : 'withdrawal';
  return receipt.status === 'rejected'
    ? `Your ${noun} was not accepted — ${receipt.reference}`
    : // The figure, not the reference: a subject line is read in a list of forty
      // others, and `1 ETH` identifies the message where a uuid identifies
      // nothing. The reference is the first line of the body.
      `Receipt for your ${noun} — ${headlineFor(receipt)}`;
}

/**
 * The plain-text body.
 *
 * Written first and in full, not as a fallback afterthought: a mail client that
 * refuses HTML, a screen reader, and a person forwarding the message to their
 * accountant all read this one. It carries every figure the HTML does.
 */
function textFor(receipt: ReceiptDto): string {
  const heading = [
    titleFor(receipt),
    headlineFor(receipt),
    receipt.counterparty !== null ? `${receipt.counterpartyLabel}: ${receipt.counterparty}` : null,
    receipt.status === 'rejected' ? 'Not accepted.' : 'Completed.',
    receipt.reason !== null ? `Reason: ${receipt.reason}` : null,
  ];

  const detail = receipt.lines.map((line) => `  ${line.label}: ${line.value}`);

  const trailer = [
    `  Requested: ${receipt.occurredAt}`,
    receipt.decidedAt !== null ? `  Decided: ${receipt.decidedAt}` : null,
    `  Reference: ${receipt.reference}`,
  ];

  // Blocks, joined by blank lines — rather than one flat array with `''`
  // separators in it. The flat version filtered its own spacers out along with
  // the absent optional lines, and every text-only reader got a dense wall.
  return [
    heading.filter(isPresent).join('\n'),
    detail.join('\n'),
    trailer.filter(isPresent).join('\n'),
    'This is a record of a movement on your account, not a tax invoice.',
  ].join('\n\n');
}

function isPresent(line: string | null): line is string {
  return line !== null;
}

/**
 * The HTML body — the same document as the printed page, in the subset of CSS a
 * mail client will honour.
 *
 * Inline styles and a table, because that is what mail clients render. No
 * external stylesheet, no web font, no image — each of which is stripped,
 * blocked, or turns a receipt into a tracking pixel. The outcome mark is a text
 * glyph inside a coloured cell rather than an icon, for the same reason.
 */
function htmlFor(receipt: ReceiptDto): string {
  const refused = receipt.status === 'rejected';

  const rows = receipt.lines
    .map(
      (line) =>
        `<tr><td style="padding:8px 0;color:#4a4a4a;border-top:1px solid #eee">${escape(line.label)}</td>` +
        `<td style="padding:8px 0;text-align:right;border-top:1px solid #eee;${line.mono ? "font-family:ui-monospace,Menlo,monospace;font-size:12px;" : ''}word-break:break-all">${escape(line.value)}` +
        (line.note ? `<div style="color:#888;font-size:11px;margin-top:2px">${escape(line.note)}</div>` : '') +
        `</td></tr>`,
    )
    .join('');

  const counterparty =
    receipt.counterparty === null
      ? ''
      : `<p style="margin:4px 0 0;color:#4a4a4a;font-size:12px;font-family:ui-monospace,Menlo,monospace;word-break:break-all">${escape(receipt.counterparty)}</p>`;

  return `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;color:#000">
  <div style="text-align:center;padding:24px 0 28px">
    <p style="margin:0;font-size:11px;letter-spacing:0.18em;color:#4a4a4a;font-weight:600">NOVEX</p>
    <h1 style="margin:18px 0 0;font-size:18px;font-weight:600">${escape(titleFor(receipt))}</h1>
    ${counterparty}
    <p style="margin:28px 0 0;font-size:34px;font-weight:600;word-break:break-word">${escape(headlineFor(receipt))}</p>
    <p style="margin:10px 0 0;color:#4a4a4a;font-size:13px">${escape(receipt.occurredAt)}</p>
    <p style="margin:26px 0 0">
      <span style="display:inline-block;width:22px;height:22px;line-height:22px;border-radius:11px;color:#fff;font-size:13px;background:${refused ? '#b91c1c' : '#047857'}">${refused ? '&#10005;' : '&#10003;'}</span>
    </p>
    <p style="margin:8px 0 0;font-size:15px;font-weight:600">${refused ? 'Not accepted' : 'Completed'}</p>
  </div>
  ${receipt.reason ? `<p style="margin:0 0 20px;padding:10px 12px;background:#faf6f6;border:1px solid #eee;font-size:13px;color:#303030">${escape(receipt.reason)}</p>` : ''}
  <table style="width:100%;border-collapse:collapse;font-size:13px">
    ${rows}
    <tr><td style="padding:8px 0;color:#4a4a4a;border-top:1px solid #eee">Reference</td><td style="padding:8px 0;text-align:right;border-top:1px solid #eee;font-family:ui-monospace,Menlo,monospace;font-size:12px;word-break:break-all">${escape(receipt.reference)}</td></tr>
  </table>
  <p style="margin:20px 0 0;color:#888;font-size:11px;line-height:1.6">
    Every figure here is the value recorded at the time of the transaction and is
    never recalculated — a value shown in dollars is the price when the request was
    made, not today&rsquo;s. This is a record of a movement on your account. It is
    not a tax invoice and carries no VAT treatment.
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
