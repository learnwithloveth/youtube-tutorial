import Link from 'next/link';

import { getCurrentUser } from '@/server/auth';
import { ButtonLink } from '@/shared/ui/primitives/button-link';

import { SignOutButton } from './sign-out-button';

/**
 * The navbar's account area.
 *
 * A Server Component, so the signed-in state is decided on the server and arrives
 * as HTML. Resolving it on the client would mean the header renders "Log in" and
 * then swaps to the account controls after hydration — a flicker on every page
 * load that also tells anyone watching that the check happens in the browser.
 *
 * ── The two states mirror each other ───────────────────────────────────────────
 * Signed out, the header's primary button is the one that starts an account.
 * Signed in, it is the one that opens the account: a visitor who already has a
 * dashboard is on a marketing page by accident or on their way back in, and
 * "Dashboard" is the only control either case wants. Before this the signed-in
 * header offered an email address and a way to leave, so the only route back into
 * the product was to know that `/app` exists and type it.
 */
export async function AccountMenu() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <>
        <ButtonLink href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
          Log in
        </ButtonLink>
        <ButtonLink href="/signup" size="sm" className="hidden sm:inline-flex">
          Get started
        </ButtonLink>
      </>
    );
  }

  return (
    <>
      <Link
        href="/wallet"
        className="hidden max-w-[12rem] truncate text-sm text-fg-muted transition-colors hover:text-fg sm:block"
        title={user.email}
      >
        {user.email}
      </Link>
      {/* Shown at every width, unlike the signed-out pair. Below `sm` the header
          is the only chrome a signed-in visitor has until they open the drawer,
          and the way into the product should not be the thing that is hidden. */}
      <ButtonLink href="/app" size="sm">
        Dashboard
      </ButtonLink>
      {/* Hidden on phones so the row cannot overflow beside the menu button. The
          drawer carries sign-out at that width — see `MobileAccountMenu`. */}
      <SignOutButton className="hidden sm:block" />
    </>
  );
}
