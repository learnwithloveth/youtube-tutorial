'use client';

import { Check, Minus, Plus, ShieldCheck } from 'lucide-react';
import { AdminPageHeader, ConfirmButton, DangerButton, QuietButton } from '../../_components/admin-ui';
import { Panel, PanelHeader } from '../../../_console/components/page-header';
import { TableShell, Td, Th, Tr } from '../../../_console/components/table';
import { StatTile } from '@/shared/ui/charts/stat-tile';
import { Badge } from '@/shared/ui/primitives/badge';
import { useAdmin } from '../../_data/store';
import { PERMISSION_MATRIX } from '../../_data/data';
import { cn } from '@/shared/lib/cn';

const ROLES = ['Owner', 'Compliance', 'Support', 'Treasury', 'Engineer', 'Read-only'] as const;

export default function TeamPage() {

  const { state, run } = useAdmin();
  const active = state.team.filter((m) => m.status === 'active');

  return (
    <>
      <AdminPageHeader
        title="Admin team"
        description="Who can act in this console, and exactly what each role may do."
        actions={<QuietButton><Plus className="size-3.5" />Invite administrator</QuietButton>}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Administrators" value={String(state.team.length)} delta={{ value: `${active.length} active`, direction: 'flat', period: '' }} />
        <StatTile label="Hardware-key MFA" value={String(state.team.filter((m) => m.mfa === 'Hardware key').length)} delta={{ value: 'Strongest factor', direction: 'up', period: 'in use' }} />
        <StatTile label="Owners" value={String(state.team.filter((m) => m.role === 'Owner').length)} delta={{ value: 'Full capability', direction: 'flat', period: '' }} upIsGood={false} />
        <StatTile label="Suspended" value={String(state.team.filter((m) => m.status === 'suspended').length)} delta={{ value: 'No console access', direction: 'flat', period: '' }} />
      </div>

      <Panel className="mb-4">
        <PanelHeader title="Members" subtitle="Suspending an administrator revokes their session immediately" />
        <TableShell caption="Console administrators" minWidth="46rem">
          <thead>
            <tr>
              <Th>Administrator</Th><Th>Role</Th><Th>MFA</Th>
              <Th>Last active</Th><Th>Status</Th><Th numeric>{''}</Th>
            </tr>
          </thead>
          <tbody>
            {state.team.map((member) => (
              <Tr key={member.id}>
                <Td>
                  <span className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className="grid size-8 shrink-0 place-items-center rounded-full text-2xs font-semibold text-white"
                      style={{ background: `linear-gradient(140deg, ${member.hue}, color-mix(in oklab, ${member.hue} 40%, #05060b))` }}
                    >
                      {member.initials}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-fg">{member.name}</span>
                      <span className="block truncate text-2xs text-fg-subtle">{member.email}</span>
                    </span>
                  </span>
                </Td>
                <Td><Badge tone={member.role === 'Owner' ? 'brand' : 'neutral'}>{member.role}</Badge></Td>
                <Td>
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <ShieldCheck className={cn('size-3', member.mfa === 'TOTP' ? 'text-warn' : 'text-up')} />
                    {member.mfa}
                  </span>
                </Td>
                <Td>{member.lastActive}</Td>
                <Td><Badge tone={member.status === 'active' ? 'up' : 'down'} className="capitalize">{member.status}</Badge></Td>
                <Td numeric>
                  {member.status === 'active' ? (
                    <DangerButton onClick={() => run({ type: 'member/setStatus', id: member.id, status: 'suspended' })}>
                      Suspend
                    </DangerButton>
                  ) : (
                    <ConfirmButton onClick={() => run({ type: 'member/setStatus', id: member.id, status: 'active' })}>
                      Reinstate
                    </ConfirmButton>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableShell>
      </Panel>

      <Panel>
        <PanelHeader
          title="Permissions"
          subtitle="The console reads this matrix — it is the policy, not a picture of it"
        />
        <TableShell caption="Capability by role" minWidth="46rem">
          <thead>
            <tr>
              <Th>Capability</Th>
              {ROLES.map((role) => (
                <Th key={role} numeric className="text-center">{role}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_MATRIX.map((row) => (
              <Tr key={row.capability}>
                <Td className="text-fg">{row.capability}</Td>
                {ROLES.map((role) => (
                  <Td key={role} className="text-center">
                    <span className="inline-flex justify-center" title={`${role}: ${row.roles[role] ? 'allowed' : 'denied'}`}>
                      {row.roles[role] ? (
                        <Check className="size-3.5 text-up" />
                      ) : (
                        <Minus className="size-3.5 text-fg-subtle" />
                      )}
                      <span className="sr-only">{row.roles[role] ? 'Allowed' : 'Denied'}</span>
                    </span>
                  </Td>
                ))}
              </Tr>
            ))}
          </tbody>
        </TableShell>
      </Panel>
    </>
  );
}
