import type { Metadata } from 'next';
import { TriangleAlert } from 'lucide-react';

import { requireAdmin } from '@/server/auth';
import { getVerificationConsole } from '@/server/verifications';
import { StatTile } from '@/shared/ui/charts/stat-tile';

import { AdminPageHeader, EmptyState } from '../../_components/admin-ui';
import { ReviewQueue } from './_components/review-queue';

/**
 * KYC review.
 *
 * ── It reads real submissions ─────────────────────────────────────────────────
 * Every case here is an `identity.verifications` row: what a customer typed and the
 * document they uploaded, awaiting a decision. Approving or rejecting writes the
 * decision, the operator and the moment to that row and an entry to the activity
 * trail.
 *
 * ── What was removed, and why it is not coming back as a placeholder ──────────
 * The screen this replaced showed an "Automated checks" panel — document
 * authenticity with an MRZ checksum, face match at 98.4% similarity, liveness
 * completed in 6.2 seconds, address, sanctions & PEP — every one of them a green
 * PASS, every one from a fixture. There is no document-verification vendor wired to
 * this platform, no face-matching model, no liveness capture and no screening list.
 *
 * A compliance screen that reports checks nobody ran is worse than one that reports
 * nothing. It is the precise artefact somebody produces afterwards to explain why
 * an account was approved, and it would have been false. So the panel is gone
 * rather than greyed out: a disabled control implies a switch somewhere, and there
 * is no switch. When a vendor is integrated its results become fields on the
 * verification row and this page grows a panel that means something.
 *
 * The "Sanctions hits", "PEP matches" and "Median decision" tiles went with it, for
 * the same reason — two counted nothing and the third was the literal string
 * "4h 12m".
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'KYC review',
  robots: { index: false, follow: false },
};

export default async function KycPage() {
  await requireAdmin('/admin/kyc');
  const queue = await getVerificationConsole();

  const decidedToday = queue.decided.filter((entry) => isToday(entry.decidedAt)).length;

  return (
    <>
      <AdminPageHeader
        title="KYC review"
        description="Identity documents customers submitted, awaiting a decision. Oldest first — a queue is worked in the order people joined it."
      />

      {queue.degraded ? (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-down/35 bg-down/8 px-4 py-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-down" />
          <p className="text-xs leading-relaxed text-fg-muted">
            The queue could not be read. This is an empty page, not an empty queue —
            do not treat it as nothing waiting.
          </p>
        </div>
      ) : null}

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Awaiting a decision"
          value={String(queue.counts.pending)}
          delta={{ value: 'Oldest first', direction: 'flat', period: '' }}
          upIsGood={false}
        />
        <StatTile
          label="Verified"
          value={String(queue.counts.approved)}
          delta={{ value: 'All time', direction: 'flat', period: '' }}
        />
        <StatTile
          label="Decided today"
          value={String(decidedToday)}
          delta={{
            value: `${queue.counts.rejected} refused all time`,
            direction: 'flat',
            period: '',
          }}
        />
      </div>

      {queue.pending.length === 0 && queue.decided.length === 0 ? (
        <EmptyState
          title="Nothing submitted yet"
          body="Cases appear here when a customer completes identity verification. Nobody has yet."
        />
      ) : (
        <ReviewQueue
          pending={queue.pending}
          decided={queue.decided}
          accounts={queue.accounts}
        />
      )}
    </>
  );
}

/**
 * Today in UTC, decided on the server.
 *
 * The console pins every timestamp to UTC — see `formatClock` — so "today" has to
 * mean the same thing, or the tile disagrees with the list beside it for anybody
 * working an evening shift west of Greenwich.
 */
function isToday(iso: string | null): boolean {
  if (iso === null) return false;
  return iso.slice(0, 10) === new Date().toISOString().slice(0, 10);
}
