/**
 * Form state for the demo-funds console.
 *
 * Its own module because a `'use server'` file may export only async functions —
 * the same reason `(auth)/_lib/form-state.ts` exists.
 */
export interface GrantFormState {
  readonly status: 'idle' | 'granted' | 'error';
  readonly message: string | null;
}

export const IDLE_GRANT: GrantFormState = { status: 'idle', message: null };
