/**
 * The withdrawal form's state.
 *
 * Its own directive-free module because `actions.ts` carries `'use server'`, and a
 * `'use server'` file may export only async functions — a type or a constant there
 * is a build error. The same reason `(auth)/_lib/form-state.ts` exists.
 */
export interface WithdrawalFormState {
  readonly status: 'idle' | 'submitted' | 'error';
  readonly message: string | null;
  /** Set on success, so the form can show which request was created. */
  readonly withdrawalId: string | null;
}

export const IDLE_WITHDRAWAL_STATE: WithdrawalFormState = {
  status: 'idle',
  message: null,
  withdrawalId: null,
};
