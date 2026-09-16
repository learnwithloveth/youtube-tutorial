import { MailWarning } from 'lucide-react';

import { ResendVerification } from './resend-verification';

/**
 * Prompts a signed-in user to confirm their address.
 *
 * Shown rather than enforced. Registration issues a session immediately — an
 * account with nothing in it is not worth a verification wall — so the unconfirmed
 * state has to be visible somewhere, and this is it. The gate belongs on the
 * actions that genuinely need a reachable address, not on browsing.
 *
 * A Server Component: the only interactive part is the resend control, and that is
 * its own client leaf, so this bar ships no JavaScript of its own.
 */
export function VerificationBanner({ email }: { email: string }) {
  return (
    <div className="border-b border-line bg-[color-mix(in_oklab,var(--warn)_12%,transparent)]">
      <div className="shell flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 py-2.5 text-center text-xs">
        <MailWarning aria-hidden className="size-4 shrink-0 text-warn" />
        <span className="text-fg-muted">
          Confirm <span className="font-medium text-fg">{email}</span> to secure your account.
        </span>
        <ResendVerification className="font-semibold text-brand-soft underline-offset-4 hover:underline">
          Resend the link
        </ResendVerification>
      </div>
    </div>
  );
}
