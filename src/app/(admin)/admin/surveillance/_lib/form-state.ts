/**
 * Form state for the surveillance board.
 *
 * Its own module because a `'use server'` file may export only async functions.
 */
export interface TriageFormState {
  readonly status: 'idle' | 'decided' | 'error';
  readonly message: string | null;
  /** Which finding the message belongs to, so a stale one cannot appear beside another. */
  readonly key: string | null;
}

export const IDLE_TRIAGE: TriageFormState = { status: 'idle', message: null, key: null };
