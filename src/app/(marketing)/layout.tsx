import { getCurrentUser } from '@/server/auth';
import { AmbientBackdrop } from '@/shared/ui/visuals/ambient-backdrop';

import { AccountMenu } from '../_components/account-menu';
import { AnnouncementBanner } from '../_components/announcement-banner';
import { VerificationBanner } from '../_components/verification-banner';

import { Footer } from './_components/footer';
import { MobileAccountMenu } from './_components/mobile-account-menu';
import { Navbar } from './_components/navbar';

/**
 * Marketing chrome.
 *
 * A route group, so `(marketing)` never appears in a URL — `/fees` stays
 * `/fees`. The group exists to give every public page the same navbar, footer
 * and ambient wash without nesting them under a path segment.
 *
 * Replaces the SPA's `<MarketingLayout>` and its `<Outlet />`: the App Router
 * passes the matched page in as `children`, and because this layout is a Server
 * Component the chrome is rendered once on the server rather than re-rendered in
 * the browser on every route change.
 */
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-dvh flex-col">
      <AmbientBackdrop />
      <a
        href="#main"
        className="sr-only rounded-full bg-brand px-5 py-2 text-sm font-medium text-on-brand focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100]"
      >
        Skip to content
      </a>
      {/* Above the verification prompt: a platform notice outranks a personal
          one, and both being present is the reason the order had to be chosen
          rather than left to whichever was added last. */}
      <AnnouncementBanner surface="banner" />
      {user && !user.emailVerified ? <VerificationBanner email={user.email} /> : null}
      <Navbar account={<AccountMenu />} mobileAccount={<MobileAccountMenu />} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}
