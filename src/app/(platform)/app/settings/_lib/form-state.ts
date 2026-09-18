/**
 * The settings forms' state shape.
 *
 * ── Why it is not in `actions.ts` ──────────────────────────────────────────────
 * A `'use server'` file may export only async functions. A type is erased and
 * would be fine, but `IDLE_PROFILE_FORM` is a value — and exporting a constant
 * from a server module is a build error, because the directive turns every export
 * into a remotely-callable endpoint.
 *
 * The same reason `(auth)/_lib/form-state.ts` exists.
 */

export interface ProfileFormState {
  readonly status: 'idle' | 'saved' | 'error';
  readonly message: string | null;
  /** Echoed back on success so the header can update without a refetch. */
  readonly name?: string | undefined;
}

export const IDLE_PROFILE_FORM: ProfileFormState = { status: 'idle', message: null };

/** The security tab's forms: the password, and the Google connection. */
export interface SecurityFormState {
  readonly status: 'idle' | 'saved' | 'error';
  readonly message: string | null;
  /**
   * True when the only thing standing in the way is a stale sign-in.
   *
   * Carried separately from the message because the remedy is a link, not a
   * sentence: setting a first password needs proof of identity from the last few
   * minutes, and on an account with no password the only way to give it is to sign
   * in again. Without this the form said so and left the person to work out how.
   */
  readonly reauth?: boolean | undefined;
}

export const IDLE_SECURITY_FORM: SecurityFormState = { status: 'idle', message: null };

/** Identity verification, submitted from the Verification tab. */
export interface VerifyIdentityFormState {
  readonly status: 'idle' | 'submitted' | 'error';
  readonly message: string | null;
}

export const IDLE_VERIFY_IDENTITY: VerifyIdentityFormState = { status: 'idle', message: null };
