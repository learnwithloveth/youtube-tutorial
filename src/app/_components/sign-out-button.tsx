import { signOutAction } from '../(auth)/actions';
import { buttonStyles } from '@/shared/ui/primitives/button-styles';

/**
 * Sign out.
 *
 * A form posting to a Server Action rather than a link, because signing out is a
 * mutation: a GET that ends a session can be triggered by any `<img>` tag on any
 * site, which is a small but real cross-site nuisance. It also means this works
 * with JavaScript disabled.
 */
export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button type="submit" className={buttonStyles('outline', 'sm')}>
        Sign out
      </button>
    </form>
  );
}
