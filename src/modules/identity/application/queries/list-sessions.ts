import 'server-only';

import type { UserId } from '@/shared/kernel/ids';

import type { IdentityDependencies } from '../ports';

/**
 * A user's live sessions.
 *
 * ── What is deliberately not here ──────────────────────────────────────────────
 * No device name and no city. The obvious session list on a security page reads
 * "MacBook Pro · Lagos · 2 hours ago", and this one cannot, because `id_sessions`
 * stores a *keyed digest* of the user agent and the address rather than the values
 * — see the schema for why an unkeyed hash of an IPv4 address is worthless.
 *
 * Storing them in the clear to make the panel prettier would trade a real privacy
 * property for a cosmetic one. The information a customer actually needs to spot a
 * session they do not recognise is when it started and when it was last used, and
 * both are here. The device and location of each *sign-in* are in the activity
 * trail, which is where that question belongs.
 *
 * `current` is the row matching the caller's own session, so "this device" can be
 * labelled and the customer is not invited to lock themselves out.
 */

export interface SessionSummaryDto {
  readonly id: string;
  readonly createdAt: string;
  readonly lastSeenAt: string;
  readonly expiresAt: string;
  /** Last proof of identity — what the step-up window is measured from. */
  readonly authenticatedAt: string;
  readonly current: boolean;
}

export function createListSessions(deps: IdentityDependencies) {
  return async function listSessions(
    userId: UserId,
    currentSealed?: string | null | undefined,
  ): Promise<SessionSummaryDto[]> {
    const now = deps.clock.now();

    // Unsealed rather than compared as a cookie string: the cookie is ciphertext
    // with a fresh nonce per seal, so two seals of the same session id do not
    // compare equal. Only the plaintext id can identify the row.
    const currentId = currentSealed ? await deps.sealer.unseal(currentSealed) : null;

    const sessions = await deps.sessions.listActiveForUser(userId, now);

    return sessions.map((session) => ({
      id: session.id,
      createdAt: session.snapshot().createdAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      authenticatedAt: session.authenticatedAt.toISOString(),
      current: currentId !== null && session.id === currentId,
    }));
  };
}

export type ListSessions = ReturnType<typeof createListSessions>;
