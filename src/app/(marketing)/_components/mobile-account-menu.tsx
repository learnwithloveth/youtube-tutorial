import { getCurrentUser } from '@/server/auth';
import { ButtonLink } from '@/shared/ui/primitives/button-link';

import { SignOutButton } from '../../_components/sign-out-button';
import { ThemeToggle } from './theme-toggle';

/**
 * The account block at the foot of the mobile drawer.
 *
 * A Server Component passed into `MobileNav` as a slot, for the reason the header's
 * `AccountMenu` is: the drawer is interactive and therefore a Client Component, but
 * the session can only be read on the server. Rendered output crosses that boundary;
 * a module would have to be executed in the browser.
 *
 * Before this the drawer hardcoded "Create free account" and "Log in" whichever way
 * the session went, so a signed-in visitor on a phone was invited to make a second
 * account and had no route to their dashboard at all.
 *
 * The theme toggle sits inside this component rather than beside it because it
 * shares the secondary action's row, and that row is what differs between the two
 * states.
 */
export async function MobileAccountMenu() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <>
        <ButtonLink href="/signup" size="lg" sheen>
          Create free account
        </ButtonLink>
        <div className="flex items-center gap-3">
          <ButtonLink href="/login" variant="outline" size="lg" className="flex-1">
            Log in
          </ButtonLink>
          <ThemeToggle className="size-12" />
        </div>
      </>
    );
  }

  return (
    <>
      <p className="truncate text-center text-sm text-fg-subtle" title={user.email}>
        {user.email}
      </p>
      <ButtonLink href="/app" size="lg" sheen>
        Dashboard
      </ButtonLink>
      <div className="flex items-center gap-3">
        <SignOutButton size="lg" className="flex-1" full />
        <ThemeToggle className="size-12" />
      </div>
    </>
  );
}
