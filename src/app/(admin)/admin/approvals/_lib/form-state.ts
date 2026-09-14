/**
 * The decision form's state.
 *
 * Its own directive-free module: a `'use server'` file may export only async
 * functions, so a type or a constant there is a build error.
 */
export interface DecisionFormState {
  readonly status: 'idle' | 'decided' | 'error';
  readonly message: string | null;
  readonly withdrawalId: string | null;
}

export const IDLE_DECISION_STATE: DecisionFormState = {
  status: 'idle',
  message: null,
  withdrawalId: null,
};
