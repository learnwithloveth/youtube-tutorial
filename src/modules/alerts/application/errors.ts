/**
 * The alerts module's error catalogue.
 *
 * No `server-only`: the alert form renders these messages, so the presenter has
 * to be reachable from a Client Component.
 */

export type AlertError =
  | { readonly kind: 'not-found' }
  | { readonly kind: 'symbol-unknown'; readonly symbol: string }
  | { readonly kind: 'target-invalid' }
  | { readonly kind: 'duplicate' }
  | { readonly kind: 'unavailable' };

export const AlertErrors = {
  notFound: (): AlertError => ({ kind: 'not-found' }),
  symbolUnknown: (symbol: string): AlertError => ({ kind: 'symbol-unknown', symbol }),
  targetInvalid: (): AlertError => ({ kind: 'target-invalid' }),
  duplicate: (): AlertError => ({ kind: 'duplicate' }),
  unavailable: (): AlertError => ({ kind: 'unavailable' }),
} as const;

export function presentAlertError(error: AlertError): string {
  switch (error.kind) {
    case 'not-found':
      return 'That alert no longer exists.';
    case 'symbol-unknown':
      // Names the symbol: somebody who typed DOGE needs to know it was DOGE that
      // is not listed, not that "something" was wrong.
      return `${error.symbol} is not a market on this platform.`;
    case 'target-invalid':
      return 'Enter a target price above zero.';
    case 'duplicate':
      // The rule, not just a refusal: two identical alerts would fire twice and
      // read as a bug in the alert system rather than as a duplicate.
      return 'You already have that exact alert.';
    case 'unavailable':
      return 'Alerts are not available on this deployment.';
  }
}
