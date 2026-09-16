import type { UserId } from '@/shared/kernel/ids';

/**
 * An account at an external identity provider, linked to a local one.
 *
 * ── Keyed by the provider's subject, never by the address ─────────────────────
 * Google's `sub` is stable for the life of the account; the address on it is not.
 * A person can change the mail on their Google account, and a Workspace domain can
 * re-issue an address to somebody new. Keying on the address would mean the first
 * of those silently created a second account, and the second handed somebody the
 * first person's account. The address is stored anyway, but only so the security
 * page can say *which* Google account is connected.
 *
 * ── A record, not an entity ───────────────────────────────────────────────────
 * It has no behaviour and no lifecycle beyond existing: linking writes a row,
 * disconnecting deletes it. The rules that matter — who may link to whom, and
 * whether disconnecting would lock somebody out — are decisions about a *user*, so
 * they live in the use cases that hold one.
 */

export type AuthProvider = 'google';

export interface ConnectedAccount {
  readonly provider: AuthProvider;
  /** The provider's immutable identifier for the person. Google calls it `sub`. */
  readonly providerAccountId: string;
  readonly userId: UserId;
  /** The address the provider reported when the link was made. Display only. */
  readonly email: string;
  readonly linkedAt: Date;
}

/** How a provider is named in the interface. */
export const PROVIDER_LABELS: Readonly<Record<AuthProvider, string>> = {
  google: 'Google',
};
