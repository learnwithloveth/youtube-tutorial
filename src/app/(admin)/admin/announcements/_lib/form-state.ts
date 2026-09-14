/**
 * Form state for the announcements console.
 *
 * Its own module because a `'use server'` file may export only async functions.
 */
export interface ComposerFormState {
  readonly status: 'idle' | 'saved' | 'error';
  readonly message: string | null;
}

export const IDLE_COMPOSER: ComposerFormState = { status: 'idle', message: null };

export interface MoveFormState {
  readonly status: 'idle' | 'moved' | 'error';
  readonly message: string | null;
  /** Which announcement the message belongs to. */
  readonly id: string | null;
}

export const IDLE_MOVE: MoveFormState = { status: 'idle', message: null, id: null };
