'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  BadgeCheck,
  Copy,
  ExternalLink,
  ImageOff,
  Loader2,
  Mail,
  Printer,
  TriangleAlert,
  X,
} from 'lucide-react';

import type { TransactionDto } from '@/modules/ledger';
import type { TransactionAccountDto } from '@/server/transactions';
import { formatDate } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/primitives/badge';

import { usd } from '../../../../(platform)/app/_lib/format-usd';
import { sendReceiptAction } from '../_lib/actions';
import { IDLE_RECEIPT_FORM } from '../_lib/form-state';

/**
 * Everything recorded about one transaction.
 *
 * ── A panel beside the feed, not a page ────────────────────────────────────────
 * Navigating away would discard the scroll position and every page already loaded,
 * so an operator working down a long feed would pay for the whole scroll again
 * after each row they opened. The panel keeps the list mounted behind it.
 *
 * ── The screenshot loads here and only here ────────────────────────────────────
 * Proofs are stored at full size — up to two megabytes — and served by a route
 * that streams the original bytes. A thumbnail in every row would mean fetching
 * every one of them to render them at forty pixels, which on a twenty-row page is
 * tens of megabytes to show almost nothing. The row carries an icon saying a
 * screenshot exists; opening the row is what fetches it.
 *
 * A resized variant would make row thumbnails affordable, and that belongs in the
 * proof route as a rendition rather than here as a CSS width.
 */

export function TransactionDetail({
  transaction,
  account,
  onClose,
}: {
  transaction: TransactionDto | null;
  account: TransactionAccountDto | undefined;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Escape closes it. A panel that can only be dismissed by finding a small button
  // is one an operator learns to work around by reloading the page.
  useEffect(() => {
    if (transaction === null) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    closeRef.current?.focus();

    return () => window.removeEventListener('keydown', onKey);
  }, [transaction, onClose]);

  if (transaction === null) return null;

  const deposit = transaction.kind === 'deposit';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0 bg-bg/70 backdrop-blur-sm"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${deposit ? 'Deposit' : 'Withdrawal'} details`}
        className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-line bg-bg-elev shadow-float"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-bg-elev/95 px-5 py-4 backdrop-blur-xl">
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold text-fg">
              {deposit ? 'Deposit' : 'Withdrawal'}
              <span className="ml-2 font-mono text-xs font-normal text-fg-subtle">
                {transaction.asset}
              </span>
            </h2>
            <p className="mt-0.5 font-mono text-2xs text-fg-subtle">{transaction.recordId}</p>
          </div>

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-md border border-line p-1.5 text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </button>
        </header>

        <Actions transaction={transaction} account={account} />

        <div className="space-y-6 px-5 py-5">
          <dl className="space-y-2">
            <Field label="Status">
              <Badge
                tone={
                  transaction.status === 'approved'
                    ? 'up'
                    : transaction.status === 'rejected'
                      ? 'down'
                      : 'warn'
                }
              >
                {transaction.status}
              </Badge>
            </Field>

            <Field label={deposit ? 'Claimed' : 'Requested'}>
              <span data-numeric>
                {transaction.amount} {transaction.asset}
              </span>
            </Field>

            {transaction.settledAmount !== null ? (
              <Field label={deposit ? 'Credited' : 'Paid out'}>
                <span
                  data-numeric
                  className={cn(
                    transaction.settledAmount !== transaction.amount && 'text-warn',
                  )}
                >
                  {transaction.settledAmount} {transaction.asset}
                </span>
              </Field>
            ) : null}

            {transaction.fee !== null ? (
              <Field label="Fee">
                <span data-numeric>
                  {transaction.fee} {transaction.asset}
                </span>
              </Field>
            ) : null}

            <Field
              label="Value"
              // The valuation is frozen at request time and never recomputed —
              // saying so is the difference between a historical fact and a number
              // that changes every time the page is opened.
              hint={transaction.valueUsd !== null ? 'at the time of the request' : undefined}
            >
              {transaction.valueUsd !== null ? (
                <span data-numeric>{usd(transaction.valueUsd)}</span>
              ) : (
                <span className="text-fg-subtle">
                  {/* Was "a claim is not checked against a limit", which read as
                      the contrast with a withdrawal. Withdrawals are not checked
                      against a limit either now, so the two cases say the same
                      plain thing: the feed had no price. */}
                  {deposit ? 'Not valued' : 'Unpriced'}
                </span>
              )}
            </Field>
          </dl>

          <Divider />

          <dl className="space-y-2">
            <Field label="Account">
              {account ? (
                <Link
                  href={`/admin/users/${transaction.userId}`}
                  className="inline-flex items-center gap-1.5 text-brand-soft hover:underline"
                >
                  {account.email}
                  <ExternalLink className="size-3" />
                </Link>
              ) : (
                <span className="text-fg-subtle">Directory unavailable</span>
              )}
            </Field>
            <Field label="Account id">
              <span className="break-all font-mono text-2xs">{transaction.userId}</span>
            </Field>
            <Field label="Network">{transaction.network}</Field>

            {transaction.destination !== null ? (
              <Field label="Destination" hint="in full — check it before approving">
                <span className="break-all font-mono text-2xs">{transaction.destination}</span>
              </Field>
            ) : null}

            {transaction.reference !== null ? (
              <Field label="Reference" hint="as the customer gave it">
                <span className="break-all font-mono text-2xs">{transaction.reference}</span>
              </Field>
            ) : null}
          </dl>

          <Divider />

          <dl className="space-y-2">
            <Field label={deposit ? 'Submitted' : 'Requested'}>
              {formatDate(transaction.occurredAt)}
            </Field>
            <Field label="Decided">
              {transaction.decidedAt !== null ? (
                formatDate(transaction.decidedAt)
              ) : (
                <span className="text-fg-subtle">Awaiting a decision</span>
              )}
            </Field>
            {transaction.decidedBy !== null ? (
              <Field label="Decided by">
                <span className="break-all font-mono text-2xs">{transaction.decidedBy}</span>
              </Field>
            ) : null}
            {transaction.reason !== null ? (
              <Field label="Reason" hint="shown to the customer">
                <span className="text-fg">{transaction.reason}</span>
              </Field>
            ) : null}
            {!deposit ? (
              <Field label="Signatures">
                <span data-numeric>
                  {transaction.approvalsHeld} of {transaction.approvalsRequired}
                </span>
              </Field>
            ) : null}
            {transaction.transferId !== null ? (
              <Field label="Ledger transfer" hint="the balanced entries this posted">
                <span className="break-all font-mono text-2xs">{transaction.transferId}</span>
              </Field>
            ) : null}
          </dl>

          {transaction.hasProof ? (
            <>
              <Divider />
              <section>
                <h3 className="mb-2 text-2xs uppercase tracking-[0.12em] text-fg-subtle">
                  Screenshot filed with the claim
                </h3>
                {/* Keyed, so opening a second transaction remounts this with a
                    fresh loading state rather than showing the previous proof's
                    resolved one under a new image. */}
                <Proof key={transaction.recordId} claimId={transaction.recordId} />
                <p className="mt-2 text-2xs leading-relaxed text-fg-subtle">
                  Opens full size in a new tab. Uploaded by the customer. It is evidence of what they say they
                  sent, not confirmation that it arrived — the chain or the bank
                  statement is what confirms that.
                </p>
              </section>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

/**
 * The proof image.
 *
 * Rendered with a plain `<img>` rather than `next/image`: the bytes are served by
 * an authorised route that answers 404 to anyone who is not the owner or an
 * operator, and the optimiser would need to fetch them itself — without the
 * requester's session, which is the only thing that makes the fetch legal.
 */
function Proof({ claimId }: { claimId: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-bg-sunken">
      {state === 'loading' ? (
        <div className="flex items-center justify-center gap-2 py-12 text-2xs text-fg-subtle">
          <Loader2 className="size-4 animate-spin" />
          Loading the screenshot
        </div>
      ) : null}

      {state === 'failed' ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-2xs text-fg-subtle">
          <ImageOff className="size-5" />
          The screenshot could not be loaded.
        </div>
      ) : null}

      <a
        href={`/api/deposits/${claimId}/proof`}
        target="_blank"
        rel="noreferrer noopener"
        className={cn('block', state !== 'ready' && 'hidden')}
      >
        {/* eslint-disable-next-line @next/next/no-img-element --
            next/image would proxy this through the optimiser, which caches by URL
            and would leave a customer's bank screenshot in a shared cache. A plain
            img keeps it on the no-store route that authorises every request. */}
        <img
          src={`/api/deposits/${claimId}/proof`}
          alt="Deposit screenshot submitted by the customer"
          onLoad={() => setState('ready')}
          onError={() => setState('failed')}
          className="block w-full bg-surface object-contain"
        />
      </a>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[9rem_1fr] items-start gap-3 text-xs">
      <dt className="pt-0.5 text-2xs uppercase tracking-[0.12em] text-fg-subtle">
        {label}
        {hint ? <span className="block normal-case tracking-normal opacity-70">{hint}</span> : null}
      </dt>
      <dd className="min-w-0 text-fg-muted">{children}</dd>
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-line" />;
}

/**
 * What an operator can do with one transaction.
 *
 * ── Deciding is not here, on purpose ──────────────────────────────────────────
 * A pending transaction links to the approvals queue rather than growing approve
 * and reject buttons of its own. Two places that move money are two places that
 * drift, and the queue already carries the things this panel does not: the frozen
 * valuation, the dual-control signature count, and the reason field a rejection
 * requires. A second set of buttons would eventually be the ones missing a rule.
 */
function Actions({
  transaction,
  account,
}: {
  transaction: TransactionDto;
  account: TransactionAccountDto | undefined;
}) {
  const [state, submit, pending] = useActionState(sendReceiptAction, IDLE_RECEIPT_FORM);
  const [copied, setCopied] = useState(false);

  const decided = transaction.status !== 'pending';
  const receiptHref = `/receipts/${transaction.kind}/${transaction.recordId}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(transaction.recordId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard is unavailable in some embedded contexts */
    }
  };

  return (
    <div className="border-b border-line px-5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* A new tab, not a route change: the panel and the operator's place in the
            feed survive, and the print dialog opens on a page with no chrome. */}
        <a
          href={decided ? receiptHref : undefined}
          target="_blank"
          rel="noreferrer noopener"
          aria-disabled={!decided}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-medium transition-colors',
            decided
              ? 'text-fg-muted hover:border-line-strong hover:text-fg'
              : 'pointer-events-none opacity-40',
          )}
        >
          <Printer className="size-3.5" />
          Receipt
        </a>

        <form action={submit} className="inline">
          <input type="hidden" name="kind" value={transaction.kind} />
          <input type="hidden" name="recordId" value={transaction.recordId} />
          <input type="hidden" name="userId" value={transaction.userId} />
          <button
            type="submit"
            // Refused for a pending transaction by the use case as well. Disabled
            // here so nobody discovers the rule by being told off — a receipt for
            // something nobody has confirmed would tell a customer their money
            // arrived when an operator has not yet agreed that it did.
            disabled={!decided || pending}
            title={decided ? undefined : 'A receipt is issued once this has a decision'}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-line-strong hover:text-fg disabled:pointer-events-none disabled:opacity-40"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />}
            Email {account ? 'customer' : 'receipt'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
        >
          {copied ? <BadgeCheck className="size-3.5 text-up" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy id'}
        </button>

        {!decided ? (
          <Link
            href="/admin/approvals"
            className="inline-flex items-center gap-1.5 rounded-md border border-warn/40 bg-warn/10 px-3 py-1.5 text-xs font-medium text-warn transition-colors hover:border-warn/70"
          >
            Decide in approvals
            <ExternalLink className="size-3" />
          </Link>
        ) : null}
      </div>

      {state.message !== null ? (
        <p
          role="status"
          className={cn(
            'mt-2 flex items-start gap-2 rounded-md border px-3 py-2 text-2xs leading-relaxed',
            state.status === 'error'
              ? 'border-down/35 bg-down/8 text-fg'
              : 'border-up/35 bg-up/8 text-fg',
          )}
        >
          {state.status === 'error' ? (
            <TriangleAlert className="mt-0.5 size-3 shrink-0 text-down" />
          ) : (
            <BadgeCheck className="mt-0.5 size-3 shrink-0 text-up" />
          )}
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
