/**
 * The receipt form's state.
 *
 * Not in `actions.ts`: a `'use server'` file may export only async functions, and
 * `IDLE_RECEIPT_FORM` is a value — exporting a constant from a server module is a
 * build error, because the directive turns every export into a remotely-callable
 * endpoint.
 */

export interface ReceiptFormState {
  readonly status: 'idle' | 'sent' | 'error';
  readonly message: string | null;
}

export const IDLE_RECEIPT_FORM: ReceiptFormState = { status: 'idle', message: null };
