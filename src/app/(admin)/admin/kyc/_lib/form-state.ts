/**
 * Form state for the KYC review actions.
 *
 * Its own module because a `'use server'` file may export only async functions —
 * a constant or a type there is a build error. Same reason `AuthFormState` lives
 * beside its actions rather than in them.
 */
export interface AdjudicationFormState {
  readonly status: 'idle' | 'decided' | 'error';
  readonly message: string | null;
  /** Which case the message belongs to, so a stale one cannot be shown beside another. */
  readonly verificationId: string | null;
}

export const IDLE_ADJUDICATION: AdjudicationFormState = {
  status: 'idle',
  message: null,
  verificationId: null,
};
