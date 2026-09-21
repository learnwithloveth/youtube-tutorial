import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  ChevronRight,
  Clock,
  History,
  IdCard,
  MailWarning,
  Settings,
  TriangleAlert,
} from 'lucide-react';

import { requireUser } from '@/server/auth';
import { getWalletFor, withdrawableAssets } from '@/server/ledger';
import { getMarkets } from '@/server/market-data';
import { getVerificationStandingFor } from '@/server/verifications';
import { shortenDecimalString } from '@/shared/kernel';
import { cn } from '@/shared/lib/cn';
import { AssetMark } from '@/shared/ui/visuals/asset-mark';
import type { UserId } from '@/shared/kernel/ids';

import { AccountNumber } from './_components/account-number';
import { BalanceActions } from './_components/balance-actions';
import { ResendVerification } from '../../_components/resend-verification';
import { usd } from './_lib/format-usd';
import { marketMove, type HoldingMove } from './_lib/portfolio-move';

/**
 * The signed-in overview: a balance, four actions, and what you hold.
 *
 * ── What moved out, and why this page is short now ────────────────────────────
 * The holdings table, the allocation, the recent-movements list and the market
 * strip all live on `/app/portfolio` now. They were a dense analyst's screen on
 * the page somebody lands on twenty times a day to answer one question — "how much
 * have I got" — and answering it meant reading past three panels first.
 *
 * What is left is that answer, the four things anyone does next, and the token
 * list. Everything removed is one tap away and none of it was deleted.
 *
 * ── Every number here is observed, not assembled ──────────────────────────────
 * Balances come from the ledger. Prices and 24h moves come from `market-data`, and
 * only from *live* quotes — a stale one renders as an absent price rather than a
 * number with no date on it. The headline change is labelled for exactly what it
 * measures; see `_lib/portfolio-move.ts` for why it is not called performance.
 *
 * ── The card slot holds what is true, not a yield ─────────────────────────────
 * The design has a "Money balance · 7.1% APY" card under the actions. There is no
 * savings product, no staking and no yield in this application, so a card quoting
 * an APY would be inventing the one number on the screen somebody would act on.
 * That slot carries the account's real outstanding business instead — an
 * unconfirmed email, an unverified identity, a withdrawal waiting on an operator —
 * and is absent when there is none.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Overview',
  robots: { index: false, follow: false },
};

export default async function OverviewPage() {
  const user = await requireUser('/app');

  // Independent reads. `Promise.all` is safe here because each already catches its
  // own failures and resolves to a degraded value — none can reject, so there is
  // no unattached rejection to leak.
  const [wallet, markets, verification] = await Promise.all([
    getWalletFor(user.id as UserId),
    getMarkets(),
    getVerificationStandingFor(user.id),
  ]);

  const marks = new Map(markets.map((market) => [market.symbol, market]));

  /*
   * Every asset this platform custodies, whether or not this account holds any.
   *
   * A wallet lists what it can hold, not only what it currently does — the design
   * shows four zero rows for exactly that reason, and a new account whose token
   * list was empty would look broken rather than new. The ledger only creates a
   * balance row on first credit, so the catalogue is the left side of this join
   * and a missing row is a genuine zero.
   */
  const balances = new Map(wallet.balances.map((balance) => [balance.asset, balance]));
  const tokens = withdrawableAssets().map((asset) => {
    const balance = balances.get(asset.code);
    const market = marks.get(asset.code);

    return {
      code: asset.code,
      name: balance?.name ?? asset.name,
      total: balance?.total ?? '0',
      valueUsd: balance?.valueUsd ?? null,
      // Live only. A stale quote is rendered as no price at all rather than as a
      // figure with an unknown timestamp sitting next to somebody's balance.
      quote: market?.quote.state === 'live' ? market.quote : null,
      glyph: market?.glyph ?? asset.code.slice(0, 1),
      hue: market?.hue ?? 'var(--chart-1)',
    };
  });

  // Held first, largest first, then the rest of the catalogue alphabetically —
  // the order the design shows and the order somebody scans in.
  tokens.sort((a, b) => {
    const left = a.valueUsd === null ? 0 : Number(a.valueUsd);
    const right = b.valueUsd === null ? 0 : Number(b.valueUsd);
    if (left !== right) return right - left;
    return a.code.localeCompare(b.code);
  });

  const measurable: HoldingMove[] = [];
  let unmeasured = 0;
  for (const token of tokens) {
    if (Number(token.total) <= 0) continue;
    if (token.valueUsd === null || token.quote === null) {
      unmeasured += 1;
      continue;
    }
    measurable.push({ valueUsd: token.valueUsd, change24hPercent: token.quote.change24hPercent });
  }
  const move = marketMove(measurable, unmeasured);

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* ── Who this is, and the number other people ask you for ────────────── */}
      <header className="mb-7 flex flex-wrap items-center justify-between gap-3">
        <AccountNumber value={user.accountNumber} />

        <div className="flex items-center gap-1">
          <IconLink href="/app/transactions" label="History">
            <History className="size-4" />
          </IconLink>
          <IconLink href="/app/settings" label="Settings">
            <Settings className="size-4" />
          </IconLink>
        </div>
      </header>

      {/* ── The one question this page exists to answer ─────────────────────── */}
      <section className="mb-7">
        <p className="font-display text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
          {wallet.totalValueUsd === null ? '—' : usd(wallet.totalValueUsd)}
        </p>

        {wallet.totalValueUsd === null ? (
          <p className="mt-2 text-sm text-fg-subtle">
            {wallet.degraded
              ? 'Balances could not be read just now.'
              : 'Nothing here can be priced right now.'}
          </p>
        ) : move.percent === null ? (
          <p className="mt-2 text-sm text-fg-subtle">No live quote to measure a move against.</p>
        ) : (
          <>
            <p
              className={cn(
                'mt-2 text-sm font-medium tabular-nums',
                move.delta >= 0 ? 'text-up' : 'text-down',
              )}
            >
              {move.delta >= 0 ? '+' : '−'}
              {usd(Math.abs(move.delta).toFixed(2))} ({move.delta >= 0 ? '+' : '−'}
              {Math.abs(move.percent).toFixed(2)}%)
            </p>
            {/* The caption is not decoration. Without it this reads as "your
                portfolio is up 0.19%", which is a claim about deposits and
                withdrawals that this number does not make. */}
            <p className="mt-1 text-2xs text-fg-subtle">
              24h market move on what you hold now
              {move.excluded > 0
                ? ` · ${move.excluded} holding${move.excluded === 1 ? '' : 's'} unpriced and excluded`
                : ''}
            </p>
          </>
        )}
      </section>

      <BalanceActions className="mb-6" />

      {/* ── Outstanding business, where the design puts its yield card ──────── */}
      <div className="mb-8 space-y-2.5 empty:mb-0">
        {wallet.degraded ? (
          <NoticeCard
            tone="down"
            icon={<TriangleAlert className="size-4" />}
            title="Your balances could not be loaded"
            body="This is a failed query, not an empty account."
          />
        ) : null}

        {!user.emailVerified ? (
          <NoticeCard
            tone="warn"
            icon={<MailWarning className="size-4" />}
            title="Confirm your email address"
            body="We sent a link when you signed up."
            /* A button, not a link. `/verify-email` consumes a token rather than
               issuing one, so pointing at it navigated away and sent nothing. */
            action={
              <ResendVerification className="text-xs font-medium text-warn hover:underline">
                Resend
              </ResendVerification>
            }
          />
        ) : null}

        {verification.state === 'unverified' || verification.state === 'rejected' ? (
          <NoticeCard
            tone={verification.state === 'rejected' ? 'warn' : 'neutral'}
            icon={<IdCard className="size-4" />}
            title={
              verification.state === 'rejected'
                ? 'Your identity verification was not accepted'
                : 'Verify your identity'
            }
            body={
              verification.state === 'rejected'
                ? 'A reviewer left a reason.'
                : 'Optional for now, and quick to start.'
            }
            action={
              <Link
                href="/app/settings?tab=verification"
                className={cn(
                  'text-xs font-medium hover:underline',
                  verification.state === 'rejected' ? 'text-warn' : 'text-brand-soft',
                )}
              >
                {verification.state === 'rejected' ? 'See why' : 'Start'}
              </Link>
            }
          />
        ) : null}

        {wallet.pendingWithdrawals.length > 0 ? (
          <NoticeCard
            tone="neutral"
            icon={<Clock className="size-4" />}
            title={`${wallet.pendingWithdrawals.length} withdrawal${
              wallet.pendingWithdrawals.length === 1 ? '' : 's'
            } awaiting approval`}
            /* "Held, not moved" is the ledger's own word for it — the funds are
               reserved and the statement shows no movement until an operator
               decides. See `docs/architecture.md` §14. */
            body="The amount is held on your account, not moved."
            action={
              <Link
                href="/app/wallet"
                className="text-xs font-medium text-brand-soft hover:underline"
              >
                Wallet
              </Link>
            }
          />
        ) : null}
      </div>

      {/* ── Tokens ─────────────────────────────────────────────────────────── */}
      <section>
        <Link
          href="/app/portfolio"
          className="group mb-1 inline-flex items-center gap-1 font-display text-xl font-semibold tracking-tight text-fg"
        >
          Tokens
          <ChevronRight className="size-5 text-fg-subtle transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>

        {tokens.length === 0 ? (
          <p className="py-10 text-center text-sm text-fg-subtle">
            No assets are configured on this deployment.
          </p>
        ) : (
          <ul className="divide-y divide-line/60">
            {tokens.map((token) => (
              <li key={token.code} className="flex items-center gap-3 py-3.5">
                <AssetMark symbol={token.code} glyph={token.glyph} hue={token.hue} size="md" />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{token.name}</p>
                  <p className="mt-0.5 truncate text-2xs text-fg-subtle">
                    {token.quote === null ? (
                      // Never a dash pretending to be a price. The feed has not
                      // spoken for this asset and the row says so.
                      'No live price'
                    ) : (
                      <>
                        {usd(token.quote.price)}
                        {' · '}
                        <span
                          className={
                            token.quote.change24hPercent >= 0 ? 'text-up' : 'text-down'
                          }
                        >
                          {token.quote.change24hPercent >= 0 ? '+' : ''}
                          {token.quote.change24hPercent.toFixed(2)}%
                        </span>
                      </>
                    )}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-sm font-medium tabular-nums text-fg">
                    {token.valueUsd === null ? '—' : usd(token.valueUsd)}
                  </p>
                  {/* The exact ledger amount, shortened for width but never
                      rounded into a different number — see `shortenDecimalString`. */}
                  <p className="mt-0.5 font-mono text-2xs text-fg-subtle">
                    {shortenDecimalString(token.total)} {token.code}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function IconLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="grid size-9 place-items-center rounded-lg text-fg-muted transition-colors duration-200 hover:bg-surface-hover hover:text-fg"
    >
      {children}
    </Link>
  );
}

/**
 * One piece of outstanding business.
 *
 * Shaped like the card the design puts under the action row, and rendered only
 * when there is something to say — an account with nothing outstanding sees the
 * token list directly under the actions, which is the common case.
 */
function NoticeCard({
  tone,
  icon,
  title,
  body,
  action,
}: {
  tone: 'warn' | 'down' | 'neutral';
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  const TONES = {
    warn: 'border-warn/35 bg-warn/8 text-warn',
    down: 'border-down/35 bg-down/8 text-down',
    neutral: 'border-line bg-surface text-brand-soft',
  } as const;

  return (
    <div
      role="status"
      className={cn('flex items-center gap-3 rounded-xl border px-4 py-3.5', TONES[tone])}
    >
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fg">{title}</p>
        <p className="truncate text-2xs text-fg-subtle">{body}</p>
      </div>
      {action ? <span className="shrink-0">{action}</span> : null}
    </div>
  );
}
