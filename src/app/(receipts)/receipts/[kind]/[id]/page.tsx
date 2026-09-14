import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { requireUser } from '@/server/auth';
import { getReceiptFor } from '@/server/ledger';
import { formatDate } from '@/shared/lib/format';

import { PrintButton } from './_components/print-button';

/**
 * A printable receipt for one transaction.
 *
 * ── Its own route group, with no application chrome ───────────────────────────
 * `(receipts)` sits outside `(platform)` and `(admin)` so this page has no sidebar,
 * no top bar and no support widget. A receipt is a document: what surrounds it on
 * screen is what comes out of the printer, and a navigation rail across the top of
 * somebody's tax paperwork is not it.
 *
 * ── Who may read one ──────────────────────────────────────────────────────────
 * The customer it belongs to, and operators. Enforced here rather than by the link
 * that led here — a receipt URL is guessable in exactly the way an id is, and a
 * page is a public endpoint the moment it exists.
 *
 * ── It is not an invoice, and says so ─────────────────────────────────────────
 * An invoice is a demand for payment with a legal issuer, a tax treatment and a
 * sequential number a jurisdiction cares about. None of those exist in this system,
 * and inventing a company registration on a document somebody might hand to an
 * accountant is the worst possible place to guess. This is a record of a movement.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Receipt',
  robots: { index: false, follow: false },
};

export default async function ReceiptPage({
  params,
}: {
  // Next 16: route params are a Promise.
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = await params;
  if (kind !== 'deposit' && kind !== 'withdrawal') notFound();

  const viewer = await requireUser(`/receipts/${kind}/${id}`);

  // An operator may read any; a customer only their own. The scoping is passed
  // down rather than checked here, so the same rule applies to the emailed copy.
  const receipt = await getReceiptFor(
    kind,
    id,
    viewer.role === 'admin' ? undefined : viewer.id,
  );
  if (receipt === null) notFound();

  const refused = receipt.status === 'rejected';

  return (
    <main className="mx-auto max-w-2xl px-6 py-10 print:px-0 print:py-0">
      <div className="mb-6 flex items-start justify-between gap-4 print:hidden">
        <p className="text-xs leading-relaxed text-fg-subtle">
          Printed from your Novex account. This is a record of a movement, not a tax
          invoice.
        </p>
        <PrintButton />
      </div>

      <article className="rounded-lg border border-line bg-bg-elev p-8 print:rounded-none print:border-0 print:bg-transparent print:p-0">
        <header className="flex items-start justify-between gap-6 border-b border-line pb-6">
          <div>
            <p className="font-display text-lg font-semibold text-fg">Novex</p>
            <p className="mt-0.5 text-2xs text-fg-subtle">
              {refused ? 'Transaction not accepted' : 'Transaction receipt'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xs uppercase tracking-[0.12em] text-fg-subtle">Reference</p>
            <p className="mt-0.5 break-all font-mono text-xs text-fg">{receipt.reference}</p>
          </div>
        </header>

        <div className="border-b border-line py-6">
          <p className="text-2xs uppercase tracking-[0.12em] text-fg-subtle">
            {receipt.kind === 'deposit' ? 'Deposited' : 'Withdrawn'}
          </p>
          <p data-numeric className="mt-1 font-sans text-3xl font-semibold text-fg">
            {receipt.amount}
          </p>
          {refused && receipt.reason !== null ? (
            <p className="mt-3 rounded-md border border-down/35 bg-down/8 px-3 py-2 text-xs leading-relaxed text-fg">
              {receipt.reason}
            </p>
          ) : null}
        </div>

        <dl className="divide-y divide-line/60">
          {receipt.lines.map((line) => (
            <div key={line.label} className="flex justify-between gap-6 py-3 text-xs">
              <dt className="text-fg-subtle">{line.label}</dt>
              <dd className="min-w-0 text-right">
                <span data-numeric className="block break-all font-mono text-fg">
                  {line.value}
                </span>
                {line.note ? (
                  <span className="mt-0.5 block text-2xs leading-relaxed text-fg-subtle">
                    {line.note}
                  </span>
                ) : null}
              </dd>
            </div>
          ))}

          <div className="flex justify-between gap-6 py-3 text-xs">
            <dt className="text-fg-subtle">Requested</dt>
            <dd className="text-right text-fg">{formatDate(receipt.occurredAt)}</dd>
          </div>
          {receipt.decidedAt !== null ? (
            <div className="flex justify-between gap-6 py-3 text-xs">
              <dt className="text-fg-subtle">Decided</dt>
              <dd className="text-right text-fg">{formatDate(receipt.decidedAt)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-6 py-3 text-xs">
            <dt className="text-fg-subtle">Account</dt>
            <dd className="break-all text-right font-mono text-2xs text-fg">{receipt.userId}</dd>
          </div>
        </dl>

        <footer className="mt-6 border-t border-line pt-6 text-2xs leading-relaxed text-fg-subtle">
          <p>
            Issued {formatDate(receipt.issuedAt)}. Every figure here is the value
            recorded at the time of the transaction and is never recalculated —
            {/* Said on the document itself, because a reader comparing it to today's
                price will otherwise conclude the receipt is wrong. */}{' '}
            a value shown in dollars is the price when the request was made, not
            today&rsquo;s.
          </p>
          <p className="mt-2">
            This is a record of a movement on an account. It is not a tax invoice and
            carries no VAT treatment.
          </p>
        </footer>
      </article>
    </main>
  );
}
