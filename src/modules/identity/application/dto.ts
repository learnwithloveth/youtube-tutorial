import type { UserId } from '@/shared/kernel/ids';

import type { User } from '../domain/user';

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
  createdAt: string;
}

export function toCurrentUserDto(user: User): CurrentUserDto {
  return {
    id: user.id,
    email: user.email.value,
    emailVerified: user.isEmailVerified,
    createdAt: user.createdAt.toISOString(),
  };
}
