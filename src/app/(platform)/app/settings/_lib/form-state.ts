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
