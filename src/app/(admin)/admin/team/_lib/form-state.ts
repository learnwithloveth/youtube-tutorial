/**
 * The team screen's form state.
 *
 * Not in `actions.ts`: a `'use server'` file may export only async functions, and
 * `IDLE_TEAM_FORM` is a value — exporting a constant from a server module is a
 * build error, because the directive turns every export into a remotely-callable
 * endpoint. The same reason `(auth)/_lib/form-state.ts` exists.
 */

export interface TeamFormState {
  readonly status: 'idle' | 'saved' | 'error';
  readonly message: string | null;
}

export const IDLE_TEAM_FORM: TeamFormState = { status: 'idle', message: null };
