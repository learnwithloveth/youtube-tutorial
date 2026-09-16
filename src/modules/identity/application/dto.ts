import type { UserId } from '@/shared/kernel/ids';

import { displayNameFor, initialsFor, type Profile } from '../domain/profile';
import type { User, UserRole, UserStatus } from '../domain/user';

/**
 * Identity DTOs — the module's public data contract.
 *
 * Note what CurrentUserDto does not contain: no password hash, no failed-attempt
 * count, no lockout timestamps, no IP or user-agent hashes. Those exist so the
 * server can make decisions; the browser has no use for them and every field that
 * crosses the boundary is a field that can leak.
 */

export interface SessionDto {
  /** The sealed cookie value. Opaque to everything outside this module. */
  sealed: string;
  expiresAt: string;
  userId: UserId;
}

export interface CurrentUserDto {
  id: UserId;
  email: string;
  emailVerified: boolean;
  role: UserRole;
  createdAt: string;
  /** What the account holder set, or null. Most never will. */
  displayName: string | null;
  /** Without the leading `@`, which the interface adds. */
  handle: string | null;
  /** Country of residence as the account holder gave it. ISO-3166-1 alpha-2. */
  country: string | null;
  /** E.164, or null. The settings form is the only place it is shown. */
  phone: string | null;
  /**
   * What to actually render, resolved once here.
   *
   * Every surface that shows a person — the top bar, the sidebar, a support
   * thread, an operator's account page — needs the same answer, and four call
   * sites each falling back differently is four subtly different names for one
   * account. So the fallback chain runs at the boundary and the UI renders a
   * string.
   */
  name: string;
  /** Two letters for an avatar, derived from `name`. */
  initials: string;
}

export function toCurrentUserDto(user: User, profile?: Profile | null): CurrentUserDto {
  const name = displayNameFor({
    displayName: profile?.displayName,
    handle: profile?.handle,
    email: user.email.value,
  });

  return {
    id: user.id,
    email: user.email.value,
    emailVerified: user.isEmailVerified,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    displayName: profile?.displayName ?? null,
    handle: profile?.handle ?? null,
    country: profile?.country ?? null,
    phone: profile?.phone ?? null,
    name,
    initials: initialsFor(name),
  };
}

/**
 * What another context is allowed to learn about a user it holds an id for.
 *
 * Separate from `CurrentUserDto` because the two answer different questions.
 * `CurrentUserDto` is "who am I", read by the person it describes. This is "who is
 * that", read by an operator about someone else — so it carries `status`, which an
 * operator needs in order to tell a frozen account from a working one, and which
 * the account holder is told through the UI rather than through a field.
 *
 * It still carries no password hash, no lockout counters and no address digests.
 * A console is a screen in an office, and every field here is one that can end up
 * in a screenshot.
 */
export interface UserSummaryDto {
  /** Resolved the same way `CurrentUserDto.name` is, so one account reads the
   *  same in the console as it does to its owner. */
  name: string;
  initials: string;
  displayName: string | null;
  handle: string | null;
  id: UserId;
  email: string;
  emailVerified: boolean;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
}

export function toUserSummaryDto(user: User, profile?: Profile | null): UserSummaryDto {
  const name = displayNameFor({
    displayName: profile?.displayName,
    handle: profile?.handle,
    email: user.email.value,
  });

  return {
    id: user.id,
    email: user.email.value,
    emailVerified: user.isEmailVerified,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    displayName: profile?.displayName ?? null,
    handle: profile?.handle ?? null,
    name,
    initials: initialsFor(name),
  };
}
