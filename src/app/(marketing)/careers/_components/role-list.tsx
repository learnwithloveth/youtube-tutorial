'use client';

import { ArrowRight } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { Role } from '@/modules/content';
import { cn } from '@/shared/lib/cn';
import { StaggerGroup, StaggerItem } from '@/shared/ui/motion/reveal';
import { Badge } from '@/shared/ui/primitives/badge';

/**
 * The filterable roles list.
 *
 * The only interactive part of the careers page, so the only part that ships as
 * JavaScript. Roles arrive as a prop, so the list is server-rendered on first
 * paint and the filter operates on data that is already present.
 */
export function RoleList({ roles }: { roles: readonly Role[] }) {
  const teams = useMemo(() => ['All', ...new Set(roles.map((role) => role.team))], [roles]);
  const [team, setTeam] = useState('All');

  const visible = useMemo(
    () => (team === 'All' ? roles : roles.filter((role) => role.team === team)),
    [roles, team],
  );

  return (
    <>
      <div className="mask-x mt-12 overflow-x-auto pb-1">
        <div className="flex gap-2">
          {teams.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setTeam(option)}
              aria-pressed={team === option}
              className={cn(
                'whitespace-nowrap rounded-full border px-4 py-1.5 text-sm transition-all duration-300',
                team === option
                  ? 'border-brand-soft/60 bg-brand/15 text-fg'
                  : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <StaggerGroup className="mt-8 overflow-hidden rounded-lg border border-line">
        {visible.map((role) => (
          <StaggerItem key={role.title}>
            <a
              href="#apply"
              className="group flex flex-col gap-2 border-b border-line/60 bg-bg-elev/40 px-6 py-5 transition-colors last:border-0 hover:bg-surface-hover sm:flex-row sm:items-center sm:gap-6"
            >
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-lg font-semibold text-fg">{role.title}</h3>
                <p className="mt-1 text-sm text-fg-subtle">
                  {role.team} · {role.location}
                </p>
              </div>
              <Badge tone="neutral">{role.level}</Badge>
              <Badge tone="brand">{role.type}</Badge>
              <ArrowRight className="hidden size-4 shrink-0 text-fg-subtle transition-all duration-300 group-hover:translate-x-1 group-hover:text-fg sm:block" />
            </a>
          </StaggerItem>
        ))}
      </StaggerGroup>

      {visible.length === 0 ? (
        <p className="mt-10 text-center text-sm text-fg-muted">
          No open roles on that team right now.
        </p>
      ) : null}
    </>
  );
}
