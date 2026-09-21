import { err, ok, type Result } from '@/shared/kernel';
import { trimDecimalString } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import { LedgerErrors, type LedgerError } from '../../domain/errors';
import type { LedgerDependencies } from '../ports';

export interface SendDemoFundsEmailCommand {
  readonly userId: UserId;
  readonly asset: string;
  /** Exact decimal string, as granted. Trimmed for display, never for the record. */
  readonly amount: string;
  /** How the network reads on a form — "Tron (TRC-20)". */
  readonly networkLabel: string;
  /** The grant's chain-shaped reference. Shown whole; it is short enough. */
  readonly txHash: string;
  /** The operator's note, if they wrote one. Shown to the student verbatim. */
  readonly note?: string | undefined;
  /** The account's balance in that asset after the grant. */
  readonly balance: string;
}

export interface SendDemoFundsEmailResult {
  /** Masked before it leaves this layer — a console log should not carry it plain. */
  readonly sentTo: string;
}

export function createSendDemoFundsEmail(deps: LedgerDependencies) {
  return async function sendDemoFundsEmail(
    command: SendDemoFundsEmailCommand,
  ): Promise<Result<SendDemoFundsEmailResult, LedgerError>> {
    if (deps.receipts === undefined || deps.directory === undefined) {
      return err(LedgerErrors.receiptsUnavailable());
    }

    const to = await deps.directory.emailFor(command.userId);
    if (to === null) return err(LedgerErrors.receiptNoAddress());

    const view: DemoFundsView = {
      siteName: deps.siteName,
      // Trimmed for reading: an 18-decimal asset would otherwise headline
      // "1.000000000000000000 ETH", which nobody reads to the end of.
      amount: trimDecimalString(command.amount.trim()),
      asset: command.asset,
      networkLabel: command.networkLabel,
      txHash: command.txHash,
      note: command.note?.trim() ?? '',
      balance: trimDecimalString(command.balance),
    };

    const delivery = await deps.receipts.send({
      to,
      subject: `New deposits added to your account — ${view.amount} ${view.asset}`,
      text: textFor(view),
      html: htmlFor(view),
    });

    if (!delivery.sent) {
      return err(
        LedgerErrors.receiptSendFailed(delivery.reason ?? 'The mail server refused it.'),
      );
    }

    return ok({ sentTo: mask(to) });
  };
}

export type SendDemoFundsEmail = ReturnType<typeof createSendDemoFundsEmail>;

interface DemoFundsView {
  readonly siteName: string;
  readonly amount: string;
  readonly asset: string;
  readonly networkLabel: string;
  readonly txHash: string;
  readonly note: string;
  readonly balance: string;
}


const WHAT_THIS_IS =
  'Your cryptocurrency deposit has been received and credited to your account.';

/**
 * The plain-text body.
 *
 * Written in full rather than as a fallback: a mail client that refuses HTML and a
 * screen reader both read this one, and it carries every figure the HTML does.
 */
function textFor(view: DemoFundsView): string {
  const heading = [
    'New deposits',
    `${view.amount} ${view.asset}`,
    `Network: ${view.networkLabel}`,
  ];

  const detail = [
    `  Amount: ${view.amount} ${view.asset}`,
    `  Network: ${view.networkLabel}`,
    `  Transaction: ${view.txHash}`,
    `  Your ${view.asset} balance: ${view.balance} ${view.asset}`,
    view.note.length > 0 ? `  Note: ${view.note}` : null,
  ];

  return [
    view.siteName,
    heading.join('\n'),
    WHAT_THIS_IS,
    detail.filter(isPresent).join('\n'),
    '',
  ].join('\n\n');
}

function isPresent(line: string | null): line is string {
  return line !== null;
}

/**
 * The HTML body, in the subset of CSS a mail client will honour.
 *
 * Inline styles and a table, no external stylesheet, no web font and no image —
 * each of which is stripped, blocked, or turns a message into a tracking pixel.
 * The same constraints `send-receipt.ts` works under, and deliberately a different
 * layout within them: no outcome mark and no invoice-styled reference row, so this
 * cannot be skim-read as a receipt.
 */
function htmlFor(view: DemoFundsView): string {
  const row = (label: string, value: string, mono = false): string =>
    `<tr><td style="padding:8px 0;color:#4a4a4a;border-top:1px solid #eee">${escape(label)}</td>` +
    `<td style="padding:8px 0;text-align:right;border-top:1px solid #eee;${mono ? "font-family:ui-monospace,Menlo,monospace;font-size:12px;" : ''}word-break:break-all">${escape(value)}</td></tr>`;
  return `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;color:#000">
  <div style="text-align:center;padding:24px 0 20px">
    <h1 style="margin:18px 0 0;font-size:18px;font-weight:600">New Deposit</h1>
    <p style="margin:24px 0 0;font-size:34px;font-weight:600;word-break:break-word">${escape(`${view.amount} ${view.asset}`)}</p>
    <p style="margin:10px 0 0;color:#4a4a4a;font-size:13px">${escape(view.networkLabel)}</p>
  </div>
  <p style="margin:0 0 20px;padding:12px 14px;background:#fbf8f1;border:1px solid #eee;font-size:13px;line-height:1.55;color:#303030">${escape(WHAT_THIS_IS)}</p>
  ${view.note.length > 0 ? `<p style="margin:0 0 20px;padding:10px 12px;background:#f7f7f7;border:1px solid #eee;font-size:13px;color:#303030">${escape(view.note)}</p>` : ''}
  <table style="width:100%;border-collapse:collapse;font-size:13px">
    ${row('Amount', `${view.amount} ${view.asset}`)}
    ${row('Network', view.networkLabel)}
    ${row('Transaction', view.txHash, true)}
    ${row(`Your ${view.asset} balance`, `${view.balance} ${view.asset}`, true)}
  </table>
  <p style="margin:20px 0 0;color:#888;font-size:11px;line-height:1.6">
    You can spend this balance anywhere on the platform, including requesting a
    withdrawal &mdash;.
  </p>
</div>`;
}

/** `a***@example.com` — enough to recognise an address without logging one. */
function mask(address: string): string {
  const at = address.indexOf('@');
  if (at < 1) return '***';
  return `${address.slice(0, 1)}${'*'.repeat(Math.max(at - 1, 1))}${address.slice(at)}`;
}

function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
