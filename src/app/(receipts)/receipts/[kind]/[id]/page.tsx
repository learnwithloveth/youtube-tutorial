import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Check, Clock, X } from 'lucide-react';
import type { ReceiptDto } from '@/modules/ledger';
import { requireUser } from '@/server/auth';
import { getReceiptFor } from '@/server/ledger';
import { cn } from '@/shared/lib/cn';
import { formatDate, formatTimestamp } from '@/shared/lib/format';

import './receipt.css';

/**
 * A printable receipt for one transaction.
 *
 * ── Its own route group, with no application chrome ───────────────────────────
 * `(receipts)` sits outside `(platform)` and `(admin)` so this page has no sidebar,
 * no top bar and no support widget. A receipt is a document: what surrounds it on
 * screen is what comes out of the printer, and a navigation rail across the top of
 * somebody's tax paperwork is not it.
 *
 * ── The shape is a wallet's transaction detail, not a letterhead ──────────────
 * Title, counterparty, one enormous figure, the moment, the outcome — then the
 * itemisation underneath. Everything a person opens this for is above the fold and
 * legible at arm's length; everything they need only in a dispute is below it. The
 * earlier layout led with a reference code, which is the one line nobody reads
 * first.
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

/**
 * How each outcome reads on the document.
 *
 * ── Why the colours are semantic and not the reference's one accent ───────────
 * A wallet app can paint every confirmed transaction in its brand colour because
 * it only ever shows one outcome. This page renders three, and a refusal in the
 * same hue as a success is a document somebody skims and misfiles. So: the
 * platform's own up/down/warn set, which a reader already knows how to decode, in
 * the shape the reference uses — a filled disc, a mark, one word beneath it.
 */
const OUTCOMES = {
  approved: {
    document: 'Transaction receipt',
    label: 'Completed',
    Icon: Check,
    disc: 'bg-up',
  },
  rejected: {
    document: 'Transaction not accepted',
    label: 'Not accepted',
    Icon: X,
    disc: 'bg-down',
  },
  // A pending record still renders — a customer clicking through to a withdrawal
  // they are waiting on should see it — but it is never dressed as a receipt. The
  // strapline, the word under the mark and the footnote all say it has not been
  // decided, and `sendReceipt` refuses to email one at all.
  pending: {
    document: 'Transaction pending',
    label: 'Awaiting a decision',
    Icon: Clock,
    disc: 'bg-warn',
  },
} as const satisfies Record<ReceiptDto['status'], unknown>;

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

  const outcome = OUTCOMES[receipt.status];
  const verb = receipt.kind === 'deposit' ? 'Deposit' : 'Withdrawal';

  return (
    <main className="mx-auto max-w-lg px-5 py-10 print:max-w-none print:px-0 print:py-0">
      

      <article
         data-receipt
        className="overflow-hidden rounded-xl border border-line bg-bg-elev print:rounded-none print:border-0"
      >
        {/* ── The hero ─────────────────────────────────────────────────────── */}
        <div className="px-6 pb-8 pt-8 text-center sm:px-10">
           <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-fg-subtle">
             {outcome.document}
          </p>

          <h1 className="mt-5 text-xl font-semibold text-fg">
            {receipt.assetName} {verb}
          </h1>

          {receipt.counterparty !== null ? (
            <p className="mx-auto mt-1.5 max-w-xs break-all font-mono text-xs leading-relaxed text-fg-subtle">
              {receipt.counterparty}
            </p>
          ) : null}

          <p
           data-numeric
            className="mt-9 font-sans text-4xl font-semibold leading-tight tracking-tight text-fg sm:text-5xl"
          >
            <span className="break-words">{receipt.amount}</span>{' '}
            <span className="whitespace-nowrap">{receipt.asset}</span>
          </p>

          <p className="mt-3 text-sm text-fg-subtle">{formatTimestamp(receipt.occurredAt)}</p>

          <div className="mt-9 flex flex-col items-center gap-2.5">
            <span
              className={cn(
                'flex size-6 items-center justify-center rounded-full text-bg',
                outcome.disc,
              )}
            >
              <outcome.Icon className="size-3.5" strokeWidth={3} aria-hidden />
            </span>
            <p className="text-base font-semibold text-fg">{outcome.label}</p>
          </div>

          {receipt.reason !== null ? (
            <p
              className={cn(
                'mx-auto mt-5 max-w-sm rounded-md border px-3 py-2 text-left text-xs leading-relaxed text-fg-muted',
                // Tinted only on a refusal, where the reason is the single thing
                // the reader opened the document for. On anything else it is a
                // note, and a note in alarm colours trains people to ignore them.
                receipt.status === 'rejected'
                  ? 'border-down/35 bg-down/8'
                  : 'border-line bg-bg-sunken',
              )}
            >
              {receipt.reason}
            </p>
          ) : null}
        </div>

        {/* The reference's grey gutter: a band, not a rule. It separates the part
            of the document a person reads from the part they consult. */}
        <div aria-hidden className="h-2 bg-bg-sunken print:h-0 print:border-t print:border-line" />

        {/* ── The itemisation ──────────────────────────────────────────────── */}
        {/* The counterparty is deliberately not repeated here: it already has a
            line of its own in `lines` — "Destination" or "Your reference" — and
            the hero shows it in full. Three copies of one address is a document
            a reader starts checking against itself. */}
        <dl className="divide-y divide-line/60 px-6 sm:px-10">
          {receipt.lines.map((line) => (
            <Row
              key={line.label}
              label={line.label}
              value={line.value}
              note={line.note}
              mono={line.mono ?? false}
            />
          ))}

          {/* No "Requested" row: the hero already carries that instant, to the
              minute and with its zone named, and a document that prints the same
              date twice eight rows apart is one a careful reader starts
              double-checking. "Decided" is the one this cannot show up there —
              it is a different event, and on a rejection it is the one that
              matters. */}
          {receipt.decidedAt !== null ? (
            <Row label="Decided" value={formatTimestamp(receipt.decidedAt)} mono={false} />
          ) : null}
          <Row label="Reference" value={receipt.reference} mono />
          <Row label="Account" value={receipt.userId} mono />
        </dl>

        <footer className="border-t border-line px-6 py-6 text-2xs leading-relaxed text-fg-subtle sm:px-10">
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

/**
 * One line of the itemisation.
 *
 * Label and value on one row down to the narrowest phone, because the pair only
 * means anything read together — an `0.00008276` stacked under `Network fee` with
 * a full line between them is two facts, not one.
 */
function Row({
  label,
  value,
  note,
  mono,
}: {
  label: string;
  value: string;
  note?: string | undefined;
  mono: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-5 py-3.5">
      <dt className="shrink-0 text-sm text-fg-subtle">{label}</dt>
      <dd className="min-w-0 text-right">
        <span
          // `data-numeric` carries the mono face along with tabular figures and a
          // slashed zero, which is the whole reason an address is set in it.
          {...(mono ? { 'data-numeric': '' } : {})}
          className={cn('block break-all text-fg', mono ? 'text-xs' : 'text-sm')}
        >
          {value}
        </span>
        {note ? (
          <span className="mt-1 block text-2xs leading-relaxed text-fg-subtle">{note}</span>
        ) : null}
      </dd>
    </div>
  );
}
