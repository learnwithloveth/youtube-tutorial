/**
 * Form state for the settings page's Wallets tab.
 *
 * Its own module because a `'use server'` file may export only async functions —
 * a constant or an interface there is a build error. Same arrangement as
 * `(auth)/_lib/form-state.ts` and the alerts page.
 */

export interface WalletFormState {
  readonly status: 'idle' | 'linked' | 'watching' | 'enabled' | 'disabled' | 'error';
  readonly message: string | null;
}

export const IDLE_WALLET_FORM: WalletFormState = { status: 'idle', message: null };

export interface WalletRowState {
  readonly status: 'idle' | 'done' | 'error';
  readonly message: string | null;
  /** Which row the reply is about, so one form's error does not light up ten. */
  readonly id: string | null;
}

export const IDLE_WALLET_ROW: WalletRowState = { status: 'idle', message: null, id: null };

/**
 * What the browser gets back when it asks for a challenge.
 *
 * A discriminated union rather than `{ message?: string; error?: string }`,
 * because the panel has to decide whether to call `personal_sign` and a shape
 * where both fields are optional makes "neither arrived" a state it can reach.
 */
export type ChallengeReply =
  | { readonly ok: true; readonly nonce: string; readonly message: string; readonly expiresAt: string }
  | { readonly ok: false; readonly error: string };
