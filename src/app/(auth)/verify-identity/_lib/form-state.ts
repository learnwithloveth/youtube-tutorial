/**
 * Form state for identity verification.
 *
 * Its own module because a `'use server'` file may export only async functions —
 * a constant or a type there is a build error.
 */
export interface VerifyIdentityFormState {
  readonly status: 'idle' | 'submitted' | 'error';
  readonly message: string | null;
}

export const IDLE_VERIFY_IDENTITY: VerifyIdentityFormState = {
  status: 'idle',
  message: null,
};
