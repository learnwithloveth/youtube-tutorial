import type { Metadata } from 'next';
import Link from 'next/link';
import { MapPin, TriangleAlert } from 'lucide-react';

import type { ActivityEventDto } from '@/modules/activity';
import { requireAdmin } from '@/server/auth';
import { getAuditTrailFor } from '@/server/activity';
import { formatDate } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/primitives/badge';
import { StatTile } from '@/shared/ui/charts/stat-tile';

import { AdminPageHeader } from '../../_components/admin-ui';
import { Panel, PanelHeader } from '../../../_console/components/page-header';

/**
 * The audit trail.
 *
 * ── It reads the trail the application actually writes ─────────────────────────
 * Every entry here is an `activity.events` row: sign-ins, password resets, email
 * verifications, withdrawal decisions, deposits credited, and console access
 * withdrawn or restored. Page views are excluded by default — a trail that
 * includes every navigation is one nobody reads, because the thing an audit is
 * opened for is a rounding error next to it.
 *
 * It replaced six invented entries in an in-memory array, with invented operators
 * and a severity field that existed only to colour a dot.
 *
 * ── The page says what this trail is worth ─────────────────────────────────────
 * Activity writes are best-effort by design — `src/server/activity.ts` explains
 * why: a sign-in that succeeded must not become an error page because an audit
 * insert timed out. The consequence is that this trail can have holes, and a
 * screen headed "Audit log" has an obligation to say so rather than let somebody
 * treat it as evidence. The ledger is the record of truth for money.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Audit log',
  robots: { index: false, follow: false },
};

/** Which entries deserve the eye. Derived from the kind, never stored as a field. */
function severityOf(kind: ActivityEventDto['kind']): 'critical' | 'notice' | 'info' {
  switch (kind) {
    case 'admin-suspended':
    case 'withdrawal-approved':
      return 'critical';
    case 'admin-reinstated':
    case 'verification-approved':
    case 'verification-rejected':
    case 'withdrawal-requested':
    case 'withdrawal-rejected':
    case 'deposit-recorded':
    case 'deposit-rejected':
    // Notice, not info: somebody credited an account from nothing, and an audit
    // log where that sits at the same weight as a page view is one nobody would
    // spot it in.
    case 'demo-funds-granted':
    case 'password-reset':
      return 'notice';
    default:
      return 'info';
  }
}

const LABELS: Record<ActivityEventDto['kind'], string> = {
  'page-view': 'Viewed a page',
  'sign-up': 'Created an account',
  'sign-in': 'Signed in',
  'sign-out': 'Signed out',
  'password-reset': 'Reset a password',
  'verification-sent': 'Verification email sent',
  'email-verified': 'Confirmed their email',
  'withdrawal-requested': 'Requested a withdrawal',
  'withdrawal-approved': 'Withdrawal approved',
  'withdrawal-rejected': 'Withdrawal rejected',
  'deposit-recorded': 'Deposit credited',
  'deposit-confirming': 'Deposit marked pending on chain',
  'deposit-rejected': 'Deposit refused',
  'demo-funds-granted': 'Demo funds issued',
  'admin-suspended': 'Console access suspended',
  'admin-reinstated': 'Console access restored',
  'receipt-sent': 'Receipt emailed',
  'verification-submitted': 'Submitted identity documents',
  'verification-approved': 'Identity verified',
  'verification-rejected': 'Identity verification refused',
  'price-alert-triggered': 'Price alert fired',
  'visit-started': 'Arrived on the site',
  'support-message-sent': 'Wrote to support',
  'wallet-linked': 'Connected an external wallet',
  'wallet-unlinked': 'Disconnected an external wallet',
};

export default async function AuditPage() {
  await requireAdmin('/admin/audit');
  const trail = await getAuditTrailFor({ limit: 100 });

  const critical = trail.entries.filter((entry) => severityOf(entry.kind) === 'critical').length;
  const actors = new Set(trail.entries.map((entry) => entry.userId)).size;

  return (
    <>
      <AdminPageHeader
        title="Audit log"
        description="Security and money events across the platform, newest first. Page views are excluded."
      />

      {trail.degraded ? (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-down/35 bg-down/8 px-4 py-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-down" />
          <p className="text-xs leading-relaxed text-fg-muted">
            The trail could not be read. This is an empty page, not an empty log.
          </p>
        </div>
      ) : null}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile
          label="Entries"
          value={trail.total.toLocaleString('en-US')}
          delta={{
            value: `Showing the newest ${trail.entries.length}`,
            direction: 'flat',
            period: '',
          }}
        />
        <StatTile
          label="Needing a second look"
          value={String(critical)}
          delta={{ value: 'Approvals and access changes', direction: 'flat', period: '' }}
          upIsGood={false}
        />
        <StatTile
          label="Distinct accounts"
          value={String(actors)}
          delta={{ value: 'On this page', direction: 'flat', period: '' }}
        />
      </div>

      <Panel padded={false} className="overflow-hidden">
        <div className="px-5 pt-5">
          <PanelHeader
            title="Events"
            subtitle="Written by the same request that performed the action"
          />
        </div>

        {trail.entries.length === 0 ? (
          <p className="px-5 py-10 text-center text-xs text-fg-subtle">
            Nothing recorded yet.
          </p>
        ) : (
          <ul className="divide-y divide-line/60">
            {trail.entries.map((entry) => {
              const severity = severityOf(entry.kind);
              const actor = trail.actors[entry.userId];

              return (
                <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
                  <span
                    aria-hidden
                    className={cn(
                      'mt-1.5 size-1.5 shrink-0 rounded-full',
                      severity === 'critical'
                        ? 'bg-down'
                        : severity === 'notice'
                          ? 'bg-warn'
                          : 'bg-fg-subtle',
                    )}
                  />

                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 text-sm text-fg">
                      <span className="font-mono text-xs text-brand-soft">{entry.kind}</span>
                      <span className="text-fg-muted">{LABELS[entry.kind]}</span>
                      {entry.reference !== null ? (
                        <span className="font-mono text-2xs text-fg-subtle">
                          {entry.reference}
                        </span>
                      ) : null}
                    </p>

                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 truncate text-xs text-fg-subtle">
                      {/* The id, never a placeholder, when the directory could not
                          answer: an operator can act on an id. */}
                      <Link
                        href={`/admin/users/${entry.userId}`}
                        className="truncate hover:text-fg hover:underline"
                      >
                        {actor?.email ?? entry.userId}
                      </Link>
                      <span aria-hidden>·</span>
                      <span>{formatDate(entry.occurredAt)}</span>
                      {entry.detail !== null ? (
                        <>
                          <span aria-hidden>·</span>
                          <span className="truncate">{entry.detail}</span>
                        </>
                      ) : null}
                      {entry.location?.city || entry.location?.country ? (
                        <>
                          <span aria-hidden>·</span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3" />
                            {[entry.location.city, entry.location.country]
                              .filter(Boolean)
                              .join(', ')}
                          </span>
                        </>
                      ) : null}
                    </p>
                  </div>

                  {severity !== 'info' ? (
                    <Badge tone={severity === 'critical' ? 'down' : 'warn'}>{severity}</Badge>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        <p className="border-t border-line px-5 py-4 text-2xs leading-relaxed text-fg-subtle">
          {/* Said here rather than assumed. A screen headed "Audit log" is one
              somebody will eventually treat as evidence, and this one is not. */}
          Activity is recorded on a best-effort path, so a sign-in never fails
          because a log write did. This trail can therefore have gaps: it is an
          operations aid, not an evidential record. The ledger remains the record of
          truth for every movement of money.
        </p>
      </Panel>
    </>
  );
}
