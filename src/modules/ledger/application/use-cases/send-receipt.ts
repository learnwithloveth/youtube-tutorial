import { err, ok, type Result } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import { LedgerErrors, type LedgerError } from '../../domain/errors';
import { getReceipt, type ReceiptDto } from '../queries/receipt';
import type { TransactionKind } from '../queries/transactions';
import type { CustomerDirectory, LedgerDependencies, ReceiptSender } from '../ports';

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

export interface SendTransactionEmailCommand {
  readonly kind: TransactionKind;
  readonly recordId: string;
}

export type SendTransactionEmail = (
  command: SendTransactionEmailCommand,
) => Promise<Result<SendReceiptResult, LedgerError>>;

export function createSendReceipt(deps: LedgerDependencies): SendReceipt {
  return async function sendReceipt(command) {
    const mail = mailFor(deps);
    if (mail === null) return err(LedgerErrors.receiptsUnavailable());

    const receipt = await getReceipt(deps, command.kind, command.recordId, command.requiredUserId);
    if (receipt === null) return err(notFound(command));

    if (receipt.status === 'pending') return err(LedgerErrors.receiptNotYetAvailable());

    return deliver(mail, deps.siteName, receipt);
  };
}

/**
 * Emails a customer where one of their deposits or withdrawals now stands:
 * acknowledged while it waits for a decision, the receipt once it has one.
 *
 * Reads the record rather than being told its state, and is called after the step
 * has committed — so the message describes what the ledger holds, not what the
 * caller expected. A withdrawal with one of two signatures is still pending, and
 * this says so rather than announcing an approval.
 */
export function createSendTransactionEmail(deps: LedgerDependencies): SendTransactionEmail {
  return async function sendTransactionEmail(command) {
    const mail = mailFor(deps);
    if (mail === null) return err(LedgerErrors.receiptsUnavailable());

    const receipt = await getReceipt(deps, command.kind, command.recordId);
    if (receipt === null) return err(notFound(command));

    return deliver(mail, deps.siteName, receipt);
  };
}

interface Mail {
  readonly sender: ReceiptSender;
  readonly directory: CustomerDirectory;
}

function mailFor(deps: LedgerDependencies): Mail | null {
  if (deps.receipts === undefined || deps.directory === undefined) return null;
  return { sender: deps.receipts, directory: deps.directory };
}

function notFound(command: { kind: TransactionKind; recordId: string }): LedgerError {
  return command.kind === 'deposit'
    ? LedgerErrors.depositClaimNotFound(command.recordId)
    : LedgerErrors.withdrawalNotFound(command.recordId);
}

async function deliver(
  mail: Mail,
  siteName: string,
  receipt: ReceiptDto,
): Promise<Result<SendReceiptResult, LedgerError>> {
  const to = await mail.directory.emailFor(receipt.userId as UserId);
  if (to === null) return err(LedgerErrors.receiptNoAddress());

  const delivery = await mail.sender.send({
    to,
    subject: subjectFor(receipt),
    text: textFor(receipt, siteName),
    html: htmlFor(receipt, siteName),
  });

  if (!delivery.sent) {
    return err(LedgerErrors.receiptSendFailed(delivery.reason ?? 'The mail server refused it.'));
  }

  return ok({ reference: receipt.reference, sentTo: mask(to) });
}

/**
 * The word under the mark, and the mark itself — the three the printed page uses,
 * so an email and the page it describes never disagree about where a request
 * stands. A text glyph in a coloured disc rather than an icon: see `htmlFor`.
 */
const OUTCOMES = {
  approved: { word: 'Completed', glyph: '&#10003;', colour: '#047857' },
  rejected: { word: 'Not accepted', glyph: '&#10005;', colour: '#b91c1c' },
  pending: { word: 'Awaiting a decision', glyph: '&#8230;', colour: '#b45309' },
} as const satisfies Record<ReceiptDto['status'], unknown>;

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

  switch (receipt.status) {
    case 'pending':
      // "Being reviewed", never "received": in a list of subjects, "we received your
      // deposit" reads as "your money arrived", which is the one thing that has not
      // been established yet.
      return receipt.kind === 'deposit'
        ? `Your deposit is being reviewed — ${headlineFor(receipt)}`
        : `Your withdrawal request is being reviewed — ${headlineFor(receipt)}`;
    case 'rejected':
      return `Your ${noun} was not accepted — ${receipt.reference}`;
    case 'approved':
      // The figure, not the reference: a subject line is read in a list of forty
      // others, and `1 ETH` identifies the message where a uuid identifies
      // nothing. The reference is in the body, beside every other figure.
      return `Receipt for your ${noun} — ${headlineFor(receipt)}`;
  }
}

/**
 * What has not happened yet, said outright while a request waits.
 *
 * The part of an acknowledgement that keeps it from being mistaken for a receipt:
 * the figures on it are the same ones a receipt carries, so the difference has to
 * be in words.
 */
function pendingNoteFor(receipt: ReceiptDto): string | null {
  if (receipt.status !== 'pending') return null;

  return receipt.kind === 'deposit'
    ? 'Nothing has been credited yet. An operator confirms the transaction on chain first, and you will get another email when they decide.'
    : 'Nothing has left your account yet. The amount and fee are on hold until an operator reviews the request, and you will get another email when they decide.';
}

function footnoteFor(receipt: ReceiptDto): string {
  return receipt.status === 'pending'
    ? 'This confirms what you submitted. It is not a receipt: one follows once the request is decided.'
    : 'This is a record of a movement on your account, not a tax invoice.';
}

/**
 * The plain-text body.
 *
 * Written first and in full, not as a fallback afterthought: a mail client that
 * refuses HTML, a screen reader, and a person forwarding the message to their
 * accountant all read this one. It carries every figure the HTML does.
 */
function textFor(receipt: ReceiptDto, siteName: string): string {
  const heading = [
    titleFor(receipt),
    headlineFor(receipt),
    receipt.counterparty !== null ? `${receipt.counterpartyLabel}: ${receipt.counterparty}` : null,
    `${OUTCOMES[receipt.status].word}.`,
    receipt.reason !== null ? `Reason: ${receipt.reason}` : null,
    pendingNoteFor(receipt),
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
    siteName,
    heading.filter(isPresent).join('\n'),
    detail.join('\n'),
    trailer.filter(isPresent).join('\n'),
    footnoteFor(receipt),
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
function htmlFor(receipt: ReceiptDto, siteName: string): string {
  const outcome = OUTCOMES[receipt.status];
  const pendingNote = pendingNoteFor(receipt);

  const rows = receipt.lines
    .map(
      (line) =>
        `<tr><td style="padding:8px 0;color:#4a4a4a;border-top:1px solid #eee">${escape(line.label + siteName ? '' : '')}</td>` +
        `<td style="padding:8px 0;text-align:right;border-top:1px solid #eee;${line.mono ? 'font-family:ui-monospace,Menlo,monospace;font-size:12px;' : ''}word-break:break-all">${escape(line.value)}` +
        (line.note
          ? `<div style="color:#888;font-size:11px;margin-top:2px">${escape(line.note)}</div>`
          : '') +
        `</td></tr>`,
    )
    .join('');

  const counterparty =
    receipt.counterparty === null
      ? ''
      : `<p style="margin:4px 0 0;color:#4a4a4a;font-size:12px;font-family:ui-monospace,Menlo,monospace;word-break:break-all">${escape(receipt.counterparty)}</p>`;

  return `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;color:#000">
  <div style="text-align:center;padding:24px 0 28px">
    <h1 style="margin:18px 0 0;font-size:18px;font-weight:600">${escape(titleFor(receipt))}</h1>
    ${counterparty}
    <p style="margin:28px 0 0;font-size:34px;font-weight:600;word-break:break-word">${escape(headlineFor(receipt))}</p>
    <p style="margin:10px 0 0;color:#4a4a4a;font-size:13px">${escape(receipt.occurredAt)}</p>
    <p style="margin:26px 0 0">
      <span style="display:inline-block;width:22px;height:22px;line-height:22px;border-radius:11px;color:#fff;font-size:13px;background:${outcome.colour}">${outcome.glyph}</span>
    </p>
    <p style="margin:8px 0 0;font-size:15px;font-weight:600">${outcome.word}</p>
  </div>
  ${receipt.reason ? `<p style="margin:0 0 20px;padding:10px 12px;background:#faf6f6;border:1px solid #eee;font-size:13px;color:#303030">${escape(receipt.reason)}</p>` : ''}
  ${pendingNote ? `<p style="margin:0 0 20px;padding:10px 12px;background:#fbf8f1;border:1px solid #eee;font-size:13px;line-height:1.5;color:#303030">${escape(pendingNote)}</p>` : ''}
  <table style="width:100%;border-collapse:collapse;font-size:13px">
    ${rows}
    <tr><td style="padding:8px 0;color:#4a4a4a;border-top:1px solid #eee">Reference</td><td style="padding:8px 0;text-align:right;border-top:1px solid #eee;font-family:ui-monospace,Menlo,monospace;font-size:12px;word-break:break-all">${escape(receipt.reference)}</td></tr>
  </table>
  <p style="margin:20px 0 0;color:#888;font-size:11px;line-height:1.6">
    Every figure here is the value recorded at the time of the transaction and is
    never recalculated — a value shown in dollars is the price when the request was
    made, not today&rsquo;s. ${
      receipt.status === 'pending'
        ? 'This confirms what you submitted. It is not a receipt: one follows once the request is decided.'
        : 'This is a record of a movement on your account. It is not a tax invoice and carries no VAT treatment.'
    }
  </p>
</div>`;
}

/** Minimal, because every value here is our own data rather than user markup —
 *  but a deposit reference is typed by a customer, so it still gets escaped. The
 *  site's name comes from the environment and can hold any character, so it is
 *  escaped too. */
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
