/**
 * Form state for the demo-funds console.
 *
 * Its own module because a `'use server'` file may export only async functions —
 * the same reason `(auth)/_lib/form-state.ts` exists.
 */
export interface GrantFormState {
  readonly status: 'idle' | 'granted' | 'error';
  readonly message: string | null;
  /**
   * Whether the student was emailed, said separately from `status`.
   *
   * A grant that committed and an email that did not go is one outcome, not two
   * halves of a failure: the funds are on the account either way. Folding it into
   * `status` would mean either reporting an error for money that is there, or a
   * success for a message that never arrived. Null when no email was asked for.
   */
  readonly emailed: boolean | null;
  /** Why the email did not go, when it did not. Shown beside the success line. */
  readonly emailProblem: string | null;
}

export const IDLE_GRANT: GrantFormState = {
  status: 'idle',
  message: null,
  emailed: null,
  emailProblem: null,
};
