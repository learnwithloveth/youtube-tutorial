import type { Metadata } from 'next';
import { ShieldCheck, Terminal, TriangleAlert } from 'lucide-react';

import { requireAdmin } from '@/server/auth';
import { getTeam } from '@/server/team';

import { AdminPageHeader } from '../../_components/admin-ui';
import { Panel, PanelHeader } from '../../../_console/components/page-header';
import { StatTile } from '@/shared/ui/charts/stat-tile';
import { TeamTable } from './_components/team-table';

/**
 * Who can act in this console.
 *
 * ── The permissions matrix is gone, and that is the honest change ──────────────
 * This page carried six roles — Owner, Compliance, Support, Treasury, Engineer,
 * Read-only — against twelve capabilities, under the heading "The console reads
 * this matrix — it is the policy, not a picture of it". It was a constant. Nothing
 * read it, and there are no such roles: this application has exactly two access
 * tiers, `customer` and `admin`, and `requireAdmin` is a single boolean gate.
 *
 * A capability matrix is the worst possible thing to fake. It is the one artefact
 * whose entire purpose is to answer "who can do what", and somebody would have
 * read that grid and concluded a Support account could not approve a withdrawal.
 * It can. What replaced it says so.
 *
 * ── MFA is gone for the same reason ───────────────────────────────────────────
 * The table showed hardware keys, passkeys and TOTP per administrator, and a tile
 * counting how many used the strongest factor. None of it exists — sign-in is a
 * password and a sealed session cookie, which the customer settings page now says
 * out loud as well.
 *
 * ── What is real ──────────────────────────────────────────────────────────────
 * The roster is every account with the operator role. Last-active is the newest
 * live session. The dot is the presence heartbeat that drives the live board.
 * Suspending revokes their sessions immediately, which is what the subtitle
 * promised and now does.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin team',
  robots: { index: false, follow: false },
};

export default async function AdminTeamPage() {
  const viewer = await requireAdmin('/admin/team');
  const team = await getTeam();

  const present = new Set(team.present);
  const online = team.administrators.filter((row) => present.has(row.account.id)).length;

  return (
    <>
      <AdminPageHeader
        title="Admin team"
        description="Who can act in this console. Every administrator can do everything in it — there are no roles yet."
      />

      {team.degraded ? (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-down/35 bg-down/8 px-4 py-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-down" />
          <p className="text-xs leading-relaxed text-fg-muted">
            The team could not be read. This is an empty page, not an empty console —
            nothing below is a statement about who holds access.
          </p>
        </div>
      ) : null}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile
          label="Administrators"
          value={String(team.administrators.length)}
          delta={{ value: `${team.active} can sign in`, direction: 'flat', period: '' }}
        />
        <StatTile
          label="Suspended"
          value={String(team.suspended)}
          delta={{
            value: team.suspended === 0 ? 'Everyone has access' : 'No console access',
            direction: 'flat',
            period: '',
          }}
          upIsGood={false}
        />
        <StatTile
          label="On the console now"
          value={String(online)}
          delta={{ value: 'From the presence heartbeat', direction: 'flat', period: '' }}
        />
      </div>

      <Panel padded={false} className="mb-4 overflow-hidden">
        <div className="px-5 pt-5">
          <PanelHeader
            title="Members"
            subtitle="Suspending an administrator revokes their sessions immediately"
          />
        </div>
        <TeamTable
          administrators={team.administrators}
          present={team.present}
          viewerId={viewer.id}
        />
      </Panel>
    </>
  );
}
