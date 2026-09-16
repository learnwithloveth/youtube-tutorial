import { err, ok, type Result } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import { Profile } from '../../domain/profile';
import { IdentityErrors, type IdentityError } from '../errors';
import { toCurrentUserDto, type CurrentUserDto } from '../dto';
import type { IdentityDependencies } from '../ports';

/**
 * The account holder changes how they appear.
 *
 * ── Only the fields that were sent ─────────────────────────────────────────────
 * `undefined` means "leave it alone"; an empty string means "clear it". A form
 * that renders two fields must not wipe a third it never showed, and that
 * distinction has to survive all the way from the request to the entity — which
 * is why the command's fields are optional rather than nullable.
 *
 * ── The uniqueness of a handle is decided by the index ─────────────────────────
 * Not by a read before the write. Two people claiming `@amara` in the same second
 * both find it free, and only the unique index can make exactly one of them win.
 * The repository turns that into a `HandleTakenError`; this turns that into a
 * value the form can render.
 *
 * ── Returns the whole user, not just the profile ───────────────────────────────
 * Because the caller's next act is to re-render a page that shows a name, an
 * avatar and an email together. Handing back only what changed would make every
 * caller re-fetch the rest.
 */

export interface UpdateProfileCommand {
  readonly userId: UserId;
  readonly displayName?: string | undefined;
  readonly handle?: string | undefined;
  /** ISO-3166-1 alpha-2, or an empty string to clear it. */
  readonly country?: string | undefined;
  /** E.164, or an empty string to clear it. */
  readonly phone?: string | undefined;
}

export type UpdateProfile = (
  command: UpdateProfileCommand,
) => Promise<Result<CurrentUserDto, IdentityError>>;

export function createUpdateProfile(deps: IdentityDependencies): UpdateProfile {
  return async function updateProfile(command) {
    const user = await deps.users.findById(command.userId);
    // The session said this account exists a moment ago. If it does not now, the
    // session is the thing that is wrong.
    if (user === null) return err(IdentityErrors.sessionInvalid());

    const now = deps.clock.now();
    const profile = (await deps.profiles.find(command.userId)) ?? Profile.empty(command.userId, now);

    const problems = profile.update(
      {
        displayName: command.displayName,
        handle: command.handle,
        country: command.country,
        phone: command.phone,
      },
      now,
    );

    const [first] = problems;
    if (first !== undefined) {
      // The first one, because the form shows one message and the person fixes one
      // thing at a time. The rest are reachable again on the next submit.
      switch (first) {
        case 'handle-invalid':
          return err(IdentityErrors.handleInvalid());
        case 'country-invalid':
          return err(IdentityErrors.countryInvalid());
        case 'phone-invalid':
          return err(IdentityErrors.phoneInvalid());
        case 'display-name-too-long':
          return err(IdentityErrors.displayNameTooLong());
      }
    }

    try {
      await deps.profiles.save(profile);
    } catch (error) {
      if (isHandleTaken(error)) return err(IdentityErrors.handleTaken());
      throw error;
    }

    return ok(toCurrentUserDto(user, profile));
  };
}

/**
 * Recognised by tag rather than by `instanceof`.
 *
 * The application layer must not import from `infrastructure` — that is the
 * dependency rule, and `HandleTakenError` is declared in the Drizzle adapter. A
 * structural check keeps the direction of the arrow intact and still lets a
 * different adapter signal the same condition.
 */
function isHandleTaken(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { _tag?: unknown })._tag === 'HandleTakenError'
  );
}
