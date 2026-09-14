import type { UserId } from '@/shared/kernel/ids';

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
}

export function toCurrentUserDto(user: User): CurrentUserDto {
  return {
    id: user.id,
    email: user.email.value,
    emailVerified: user.isEmailVerified,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
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
  id: UserId;
  email: string;
  emailVerified: boolean;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
}

export function toUserSummaryDto(user: User): UserSummaryDto {
  return {
    id: user.id,
    email: user.email.value,
    emailVerified: user.isEmailVerified,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
  };
}
