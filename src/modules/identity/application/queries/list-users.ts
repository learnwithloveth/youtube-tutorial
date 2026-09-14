import 'server-only';

import type { UserStatus } from '../../domain/user';
import { toUserSummaryDto, type UserSummaryDto } from '../dto';
import type { IdentityDependencies } from '../ports';

/**
 * The console's account list.
 *
 * Replaces a fixture array. Worth stating what that change costs, because the
 * fixture was not merely fake — it was a different *shape*: it carried a display
 * name, a country, a balance, a 30-day volume and a risk score, none of which
 * identity holds or should hold. A user's balance belongs to a ledger context and
 * their risk score to a compliance one; letting those fields in here is how the
 * forty-field object forms that every team edits and nobody understands.
 *
 * So the real list is narrower than the mock it replaces, and deliberately so. The
 * columns that disappeared are not missing data — they are data that belongs to
 * contexts this application has not built yet.
 */

export interface ListUsersOptions {
  /** Matches an email, or an account id pasted whole. */
  readonly term?: string | undefined;
  readonly status?: UserStatus | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

export interface UserListDto {
  readonly users: readonly UserSummaryDto[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  /** One entry per status, for the header tiles. Absent statuses are simply zero. */
  readonly tallies: readonly { status: UserStatus; total: number }[];
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function createListUsers(deps: IdentityDependencies) {
  return async function listUsers(options: ListUsersOptions = {}): Promise<UserListDto> {
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = Math.max(options.offset ?? 0, 0);
    const filter = { term: options.term, status: options.status };

    // Three independent reads against the same table, awaited together so the page
    // waits for the slowest rather than the sum.
    //
    // `allSettled` rather than `all`, and not as a style preference: `all` rejects
    // on the first failure and leaves the other two rejections unattached, which
    // Node terminates the process for by default. The realistic failure here is an
    // unreachable database, in which case all three fail — so the obvious version
    // turns a degraded page into a crashed server. It also degrades better: losing
    // the tallies costs the header tiles rather than the list.
    const [users, total, tallies] = await Promise.allSettled([
      deps.users.search({ ...filter, limit, offset }),
      deps.users.countMatching(filter),
      deps.users.tallyByStatus(),
    ]);

    // The list is the page; without it there is nothing to render and the caller's
    // own degrade path is the right answer.
    if (users.status === 'rejected') throw users.reason;

    const rows = users.value;

    // Fetched for the page, not for the whole result set: one extra query keyed on
    // the ids already in hand, rather than a join that would have to be threaded
    // through `search`, `countMatching` and `tallyByStatus` alike.
    //
    // Degrades to no names rather than no list. An operator can act on an email;
    // they cannot act on a page that failed to render.
    const named = await deps.profiles
      .findMany(rows.map((user) => user.id))
      .catch(() => new Map());

    return {
      users: rows.map((user) => toUserSummaryDto(user, named.get(user.id))),
      total: total.status === 'fulfilled' ? total.value : rows.length,
      limit,
      offset,
      tallies: tallies.status === 'fulfilled' ? tallies.value : [],
    };
  };
}

export type ListUsers = ReturnType<typeof createListUsers>;
