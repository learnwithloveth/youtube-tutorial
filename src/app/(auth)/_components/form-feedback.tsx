import { CircleAlert, CircleCheck } from 'lucide-react';

import type { AuthFormState } from '../_lib/form-state';

/**
 * The single place an action's result is rendered.
 *
 * `role="alert"` announces an error the moment it appears; the success case uses
 * `role="status"` instead, which is polite and does not interrupt whatever a
 * screen-reader user is in the middle of. Both matter on a login screen, where the
 * error is often the only feedback a keyboard user gets.
 */
export function FormFeedback({ state }: { state: AuthFormState }) {
  if (state.error) {
    return (
      <p
        role="alert"
        className="flex items-start gap-2 rounded-md border border-[color-mix(in_oklab,var(--down)_32%,transparent)] bg-[color-mix(in_oklab,var(--down)_12%,transparent)] px-3.5 py-2.5 text-sm text-down"
      >
        <CircleAlert className="mt-0.5 size-4 shrink-0" />
        {state.error}
      </p>
    );
  }

  if (state.message) {
    return (
      <p
        role="status"
        className="flex items-start gap-2 rounded-md border border-[color-mix(in_oklab,var(--up)_32%,transparent)] bg-[color-mix(in_oklab,var(--up)_12%,transparent)] px-3.5 py-2.5 text-sm text-up"
      >
        <CircleCheck className="mt-0.5 size-4 shrink-0" />
        {state.message}
      </p>
    );
  }

  return null;
}

/** Submit button that reflects the action's pending state. */
export { SubmitButton } from './submit-button';
