import 'server-only';

import type { UserId } from '@/shared/kernel/ids';

import type { IdentityDependencies } from '../ports';
import { toUserSummaryDto, type UserSummaryDto } from '../dto';

/**
 * Resolves a set of user ids to the little that other contexts may see of them.
 *
 * ── Why this exists rather than a join ─────────────────────────────────────────
 * The presence context holds `UserId` and nothing more — no foreign key, no read
 * of `id_users` — which is the rule that keeps identity extractable. The live
 * console still has to show an email next to a visitor, so the join has to happen
 * *above* both modules, in a facade that is allowed to talk to each of them.
 *
 * This is the identity half of that join: give it ids, get back a map. When
 * identity moves behind an HTTP boundary this becomes one request and no caller
 * changes, which is the whole point of the arrangement.
 *
 * ── The cap is a safety rail, not a page size ──────────────────────────────────
 * A caller with ten thousand ids has a bug, and answering it would turn one
 * console refresh into a query with a ten-thousand-element `IN` clause. The limit
 * is well above the console's own page size, so reaching it means something is
 * wrong upstream.
 */

export const MAX_DESCRIBE_USERS = 500;

export function createDescribeUsers(deps: IdentityDependencies) {
  return async function describeUsers(
    ids: readonly UserId[],
  ): Promise<Map<UserId, UserSummaryDto>> {
    // Deduplicated first: a live board showing one account in four tabs would
    // otherwise ask for the same row four times.
    const unique = [...new Set(ids)].slice(0, MAX_DESCRIBE_USERS);
    if (unique.length === 0) return new Map();

    const users = await deps.users.findManyByIds(unique);

    return new Map(users.map((user) => [user.id, toUserSummaryDto(user)]));
  };
}

export type DescribeUsers = ReturnType<typeof createDescribeUsers>;
