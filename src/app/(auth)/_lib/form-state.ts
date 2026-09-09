/**
 * The shape every auth Server Action returns.
 *
 * In its own module because a `'use server'` file may export *only* async
 * functions — Next has to treat every export as a callable server endpoint, so a
 * plain object or constant there is a build error. The type and the idle value
 * live here; `actions.ts` imports them.
 */

export interface AuthFormState {
  /** A message to display, or null when nothing has gone wrong yet. */
  error: string | null;
  /** Set on flows that report success in place rather than redirecting. */
  message: string | null;
}

export const IDLE_FORM_STATE: AuthFormState = { error: null, message: null };
