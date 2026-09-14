import { toUserSummaryDto, type UserSummaryDto } from '../dto';
import type { IdentityDependencies } from '../ports';

/**
 * Who can act in the console.
 *
 * ── One role, and the screen has to say so ─────────────────────────────────────
 * This application has two access tiers: `customer` and `admin`. There is no
 * compliance role, no treasury role and no read-only role, so there is nothing
 * here to describe them with. The console's team page used to show six roles and a
 * capability matrix mapping them onto twelve actions — every cell of it a constant,
 * on the one screen whose job is to answer "who can do what".
 *
 * The honest version is smaller: these people can do everything in the console,
 * and these ones are suspended.
 *
 * ── Last active comes from live sessions ───────────────────────────────────────
 * One grouped query for the whole list rather than one per row, and only sessions
 * that are neither revoked nor expired: a dead session says when somebody *was*
 * here, which under a heading like "last active" reads as somebody still signed in.
 *
 * Absent is a real answer — nobody signed in — and the page renders it as one.
 */

export interface AdministratorDto {
  readonly account: UserSummaryDto;
  /** ISO instant of the newest live session, or null when there is none. */
  readonly lastSeenAt: string | null;
}

export interface AdministratorsDto {
  readonly administrators: readonly AdministratorDto[];
  readonly active: number;
  readonly suspended: number;
  /** True when the read failed. An empty team and an unreachable one differ. */
  readonly degraded: boolean;
}

const MAX_ADMINISTRATORS = 100;

export function createListAdministrators(deps: IdentityDependencies) {
  return async function listAdministrators(): Promise<AdministratorsDto> {
    const users = await deps.users.search({
      role: 'admin',
      limit: MAX_ADMINISTRATORS,
      offset: 0,
    });

    const ids = users.map((user) => user.id);

    // Both are conveniences over the list, and neither is allowed to fail it. An
    // operator needs to see who holds access even when the session store or the
    // profile table is the thing that is down.
    const [seen, named] = await Promise.all([
      deps.sessions.lastSeenFor(ids, deps.clock.now()).catch(() => new Map()),
      deps.profiles.findMany(ids).catch(() => new Map()),
    ]);

    const administrators = users.map((user) => ({
      account: toUserSummaryDto(user, named.get(user.id)),
      lastSeenAt: seen.get(user.id)?.toISOString() ?? null,
    }));

    return {
      administrators,
      active: administrators.filter((row) => row.account.status === 'active').length,
      // `locked` counts as suspended here on purpose: from the point of view of
      // somebody asking who can act right now, an account locked by failed attempts
      // and one disabled by decision are the same answer. The row still shows which.
      suspended: administrators.filter((row) => row.account.status !== 'active').length,
      degraded: false,
    };
  };
}

export type ListAdministrators = ReturnType<typeof createListAdministrators>;
