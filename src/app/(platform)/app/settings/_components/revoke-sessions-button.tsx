import { LogOut } from 'lucide-react';

import { buttonStyles } from '@/shared/ui/primitives/button-styles';

import { revokeAllSessionsAction } from '../_lib/actions';

/**
 * Sign out everywhere.
 *
 * A form posting to a Server Action rather than a link, because this is a
 * mutation — and because it then works with JavaScript disabled, which is the
 * right property for the control someone reaches for when they think their
 * account has been taken.
 */
export function RevokeSessionsButton() {
  return (
    <form action={revokeAllSessionsAction}>
      <button type="submit" className={buttonStyles('outline', 'sm')}>
        <LogOut className="size-3.5" />
        Sign out everywhere
      </button>
    </form>
  );
}
