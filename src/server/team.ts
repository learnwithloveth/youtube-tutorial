import 'server-only';

import { cache } from 'react';

import type { AdministratorsDto } from '@/modules/identity';
import { logger } from '@/platform/observability/logger';

import { identity } from './auth';
import { getLiveActivity } from './presence';

/**
 * The console's own team.
 *
 * ── Two contexts, joined here ──────────────────────────────────────────────────
 * Who holds console access comes from identity. Whether they are at the screen
 * right now comes from presence — the same heartbeat that drives the live board
 * and the account map, rather than a second answer that could disagree with them.
 *
 * "Last active" and "on the console now" are deliberately different facts. The
 * first is the newest live session, which survives a closed laptop; the second is
 * a heartbeat in the last minute. A team screen needs both: one answers "does this
 * person still have a way in", the other "are they here".
 */

export interface TeamDto extends AdministratorsDto {
  /** Ids with a heartbeat right now. Rendered as a dot, not a timestamp. */
  readonly present: readonly string[];
}

const UNAVAILABLE: TeamDto = {
  administrators: [],
  active: 0,
  suspended: 0,
  degraded: true,
  present: [],
};

/**
 * Deduplicated per request, so the tiles and the table cost one read between them.
 */
export const getTeam = cache(async (): Promise<TeamDto> => {
  // `allSettled`, not `all`: losing presence costs a dot, and losing the roster
  // costs the page — they should not fail together. `all` would also leave the
  // second rejection unattached, which Node terminates the process for.
  const [roster, live] = await Promise.allSettled([
    identity().listAdministrators(),
    getLiveActivity({ limit: 200 }),
  ]);

  if (roster.status === 'rejected') {
    logger.error({ event: 'team_read_failed', module: 'identity' }, roster.reason);
    return UNAVAILABLE;
  }

  const present =
    live.status === 'fulfilled'
      ? [
          ...new Set(
            live.value.visitors
              .filter((visitor) => visitor.userId !== null)
              .map((visitor) => visitor.userId as string),
          ),
        ]
      : [];

  return { ...roster.value, present };
});
