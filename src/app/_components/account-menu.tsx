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
      <SignOutButton />
    </>
  );
}
