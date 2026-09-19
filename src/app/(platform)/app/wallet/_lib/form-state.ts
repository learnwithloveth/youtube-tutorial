/**
 * Form state for the wallet's two write paths.
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
  /**
   * The route this answer was about.
   *
   * `useActionState` holds its last reply until the next submit, so a refusal for
   * one asset stayed on screen after the customer switched to another — "you have
   * 0 ETH available" under a TRX form, which reads as the balance being wrong
   * rather than the message being stale. The form compares these against what is
   * selected now and says nothing when they disagree.
   */
  readonly asset: string | null;
  readonly network: string | null;
}

export const IDLE_WITHDRAWAL_STATE: WithdrawalFormState = {
  status: 'idle',
  message: null,
  withdrawalId: null,
  asset: null,
  network: null,
};

export interface DepositFormState {
  readonly status: 'idle' | 'submitted' | 'error';
  readonly message: string | null;
}

export const IDLE_DEPOSIT_STATE: DepositFormState = { status: 'idle', message: null };
