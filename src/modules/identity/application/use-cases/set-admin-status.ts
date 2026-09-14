import { err, ok, type Result } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import { IdentityErrors, type IdentityError } from '../errors';
import { toUserSummaryDto, type UserSummaryDto } from '../dto';
import type { IdentityDependencies } from '../ports';

/**
 * Suspends or reinstates an operator.
 *
 * ── Why this is in the console and granting admin is not ───────────────────────
 * `scripts/grant-admin.ts` says promotion is deliberately a script and not a UI,
 * because it hands somebody the ability to approve withdrawals. That reasoning is
 * about handing power *out*.
 *
 * Taking it away is the opposite direction, and it is the one that has to be fast:
 * an operator whose laptop was stolen is a problem measured in minutes, and a
 * response that requires shell access to the deployment is not a response. So this
 * screen can suspend, and it cannot promote — the tier you can reach from a browser
 * only ever goes down.
 *
 * Reinstating is the mirror of suspending, not a promotion: it only ever restores
 * an account that already holds the role. Becoming an administrator still means the
 * script.
 *
 * ── Three guards, each for a failure somebody has actually had ────────────────
 *  1. **Operators only.** This screen manages the console team; pointing it at a
 *     customer would make it a general account-freezing tool by accident, without
 *     any of the thinking that a customer-freezing feature deserves.
 *  2. **Never yourself.** Suspending your own account signs you out of the screen
 *     you would need to undo it.
 *  3. **Never the last one standing.** Suspending the only remaining active
 *     administrator locks every human out of the console, and the only way back is
 *     the database or the CLI.
 */

export interface SetAdminStatusCommand {
  readonly actorId: UserId;
  readonly targetId: UserId;
  readonly action: 'suspend' | 'reinstate';
}

export type SetAdminStatus = (
  command: SetAdminStatusCommand,
) => Promise<Result<UserSummaryDto, IdentityError>>;

export function createSetAdminStatus(deps: IdentityDependencies): SetAdminStatus {
  return async function setAdminStatus(command) {
    if (command.actorId === command.targetId) {
      return err(IdentityErrors.cannotSuspendSelf());
    }

    const target = await deps.users.findById(command.targetId);
    // Not-found rather than a distinct "not an operator": this screen only ever
    // shows operators, so an id that is not one did not come from it.
    if (target === null || target.role !== 'admin') {
      return err(IdentityErrors.administratorNotFound());
    }

    if (command.action === 'suspend') {
      // Counted rather than assumed. The check has to be "how many are left", not
      // "is this the only row I can see", because the screen may have been open
      // while somebody else was suspended.
      const activeAdmins = await deps.users.countMatching({ role: 'admin', status: 'active' });
      if (activeAdmins <= 1) return err(IdentityErrors.lastAdministrator());

      target.suspend();
      await deps.users.save(target);

      // The page promises the session goes immediately, so it does. `disabled` is
      // already refused by `resolveSession` on the next request, but "next request"
      // on an idle tab could be an hour — and a stolen laptop is measured in
      // minutes. Revoking makes it true now.
      await deps.sessions.revokeAllForUser(target.id, deps.clock.now());
    } else {
      target.reinstate();
      await deps.users.save(target);
    }

    const profile = await deps.profiles.find(target.id).catch(() => null);
    return ok(toUserSummaryDto(target, profile));
  };
}
