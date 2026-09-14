import 'server-only';

import { cache } from 'react';

import type { ActivityKind, UserActivityDto } from '@/modules/activity';
import type { ListUsersOptions, UserListDto, UserSummaryDto } from '@/modules/identity';
import type { ActiveVisitorDto } from '@/modules/presence';
import { IDLE_WINDOW_MS } from '@/modules/presence';
import { toActiveVisitorDto } from '@/modules/presence/server';
import { logger } from '@/platform/observability/logger';
import { toUserId, type UserId } from '@/shared/kernel/ids';

import { getActivityForUser } from './activity';
import { identity } from './auth';
import { presence } from './presence';

/**
 * The console's read facade over accounts.
 *
 * ── Three contexts, joined here and nowhere else ───────────────────────────────
 * An operator looking at one account wants who they are (identity), what they have
 * done (activity), and whether they are on the site right now (presence). No
 * module can answer all three, and none of them should be able to — that they hold
 * only an opaque `UserId` about each other is what lets any of them be lifted out.
 *
 * So the join happens above all three, in this file, at the cost of three queries
 * where a schema with foreign keys would have used one. That cost is the price of
 * the boundary, and it is paid on a console page read by a handful of operators
 * rather than on a hot path.
 */

const EMPTY_LIST: UserListDto = {
  users: [],
  total: 0,
  limit: 50,
  offset: 0,
  tallies: [],
};

/**
 * The account list.
 *
 * Degrades to an empty list rather than throwing, for the reason every read path
 * in this console does: an operator opens it when something is already wrong, and
 * a page that 500s is the least useful possible response to that.
 */
export const getUsers = cache(async (options: ListUsersOptions = {}): Promise<UserListDto> => {
  try {
    return await identity().listUsers(options);
  } catch (error) {
    logger.error({ event: 'user_list_read_failed', module: 'identity' }, error);
    return { ...EMPTY_LIST, limit: options.limit ?? 50 };
  }
});

export interface UserDetail {
  readonly account: UserSummaryDto;
  readonly activity: UserActivityDto;
  /** Open tabs right now. Empty when they are not on the site. */
  readonly liveTabs: readonly ActiveVisitorDto[];
}

/**
 * Everything the console knows about one account.
 *
 * Returns null when no such account exists, which the page turns into a 404.
 * Deliberately not an error: an operator following a stale link is an ordinary
 * event, not a fault.
 */
export const getUserDetail = cache(
  async (
    id: string,
    options: { kinds?: readonly ActivityKind[]; limit?: number; offset?: number } = {},
  ): Promise<UserDetail | null> => {
    // A malformed id is a 404, not a 500. `toUserId` throws on anything that is
    // not a UUID, and a hand-edited URL is the ordinary way that happens.
    let userId: UserId;
    try {
      userId = toUserId(id);
    } catch {
      return null;
    }

    const accounts = await identity().describeUsers([userId]);
    const account = accounts.get(userId);
    if (account === undefined) return null;

    // Independent reads, awaited together: the page waits for the slowest rather
    // than the sum of the three.
    const [activity, liveTabs] = await Promise.all([
      getActivityForUser(userId, options),
      getLiveTabs(userId),
    ]);

    return { account, activity, liveTabs };
  },
);

/**
 * The account's open tabs.
 *
 * Scoped to the idle window, because past that the domain calls a row `gone` and
 * returning it would put someone on the console as "here" who closed their laptop
 * an hour ago.
 */
async function getLiveTabs(userId: UserId): Promise<ActiveVisitorDto[]> {
  const context = presence();
  if (context === null) return [];

  try {
    const since = new Date(Date.now() - IDLE_WINDOW_MS);
    const rows = await context.dependencies.presences.listForUser(userId, since, 20);

    return rows
      .map((row) => toActiveVisitorDto(row, context.dependencies.clock))
      .filter((dto): dto is ActiveVisitorDto => dto !== null);
  } catch (error) {
    // The account page is mostly history; losing the live strip costs one panel.
    logger.warn({ event: 'live_tabs_read_failed', module: 'presence', userId }, error);
    return [];
  }
}
