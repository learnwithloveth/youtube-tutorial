/**
 * Form state for the alerts page.
 *
 * Its own module because a `'use server'` file may export only async functions.
 */
export interface AlertFormState {
  readonly status: 'idle' | 'created' | 'error';
  readonly message: string | null;
}

export const IDLE_ALERT_FORM: AlertFormState = { status: 'idle', message: null };

export interface AlertMoveState {
  readonly status: 'idle' | 'moved' | 'error';
  readonly message: string | null;
  readonly id: string | null;
}

export const IDLE_ALERT_MOVE: AlertMoveState = { status: 'idle', message: null, id: null };
