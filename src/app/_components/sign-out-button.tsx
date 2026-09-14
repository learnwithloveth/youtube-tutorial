import { signOutAction } from '../(auth)/actions';
import { buttonStyles, type ButtonSize } from '@/shared/ui/primitives/button-styles';
import { cn } from '@/shared/lib/cn';

/**
 * Sign out.
 *
 * A form posting to a Server Action rather than a link, because signing out is a
 * mutation: a GET that ends a session can be triggered by any `<img>` tag on any
 * site, which is a small but real cross-site nuisance. It also means this works
 * with JavaScript disabled.
 *
 * `className` lands on the form rather than the button, because the form is the
 * element a flex or grid parent actually lays out — styling the button inside it
 * would leave the wrapper at its intrinsic width and the rule would appear to do
 * nothing.
 */
export function SignOutButton({
  size = 'sm',
  className,
  full = false,
}: {
  size?: ButtonSize;
  className?: string;
  /** Stretches the button to the form's width, for the stacked mobile drawer. */
  full?: boolean;
}) {
  return (
    <form action={signOutAction} className={className}>
      <button type="submit" className={cn(buttonStyles('outline', size), full && 'w-full')}>
        Sign out
      </button>
    </form>
  );
}
