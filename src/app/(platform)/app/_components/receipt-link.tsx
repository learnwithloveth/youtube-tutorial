import Link from 'next/link';
import { Printer } from 'lucide-react';

import type { TransactionKind, TransactionStatus } from '@/modules/ledger';
import { cn } from '@/shared/lib/cn';

/**
 * The way a customer reaches the printable record of one transaction.
 *
 * ── The document already existed; nothing led to it ───────────────────────────
 * `/receipts/[kind]/[id]` has been a full printable page with its own print button
 * since receipts did, and it enforces its own authority — a customer may read only
 * their own. Until now the only link to it in the whole application was in the
 * operator console, so the one person it was written for could not get to it. This
 * is that link.
 *
 * ── A new tab, not a route change ─────────────────────────────────────────────
 * The same choice the console makes, for the same two reasons: the customer keeps
 * their place in the list they were reading, and the print dialog opens over a
 * page with no sidebar, no top bar and no support widget — which matters, because
 * what surrounds the document on screen is what comes out of the printer.
 *
 * ── It does not call itself a receipt before there is one ─────────────────────
 * The page renders an undecided record too, deliberately: somebody waiting on a
 * withdrawal should be able to look at it. But it heads that document "Transaction
 * pending" and says in the footnote that it is not a receipt, so a link labelled
 * "Receipt" would be promising something the page then declines to be. Undecided
 * records get "View" instead.
 */
export function ReceiptLink({
  kind,
  recordId,
  status,
  className,
}: {
  kind: TransactionKind;
  /** The claim's or withdrawal's own id — never the transfer's. */
  recordId: string;
  status: TransactionStatus;
  className?: string;
}) {
  const decided = status === 'approved' || status === 'rejected';

  return (
    <Link
      href={`/receipts/${kind}/${recordId}`}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-2xs font-medium text-fg-muted transition-colors hover:border-brand-soft/60 hover:text-fg',
        className,
      )}
    >
      <Printer className="size-3" />
      {decided ? 'Receipt' : 'View'}
    </Link>
  );
}
