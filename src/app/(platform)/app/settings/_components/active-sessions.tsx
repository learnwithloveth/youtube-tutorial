import { Laptop, ShieldCheck } from 'lucide-react';

import type { SessionSummaryDto } from '@/modules/identity';
import { formatDate } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/primitives/badge';

import { PanelHeader } from '../../../../_console/components/page-header';
import { RevokeSessionsButton } from './revoke-sessions-button';

/**
 * The real session list.
 *
 * ── What it does not show, and why ─────────────────────────────────────────────
 * The panel this replaced listed "MacBook Pro · Lagos · 2 hours ago" from a
 * fixture. This one cannot, and the reason is a deliberate design decision made
 * elsewhere: `identity.sessions` stores a *keyed digest* of the user agent and the
 * connecting address, never the values, because an unkeyed hash of an IPv4 address
 * is brute-forceable in seconds and the clear values are a tracking vector.
 *
 * Storing them in the clear to make this panel prettier would trade a real privacy
 * property for a cosmetic one. What a customer needs in order to spot a session
 * they do not recognise is when it started and when it was last used — and both of
 * those are real here. The device and place of each *sign-in* live in the activity
 * trail, which is a different question with a different answer.
 *
 * A Server Component; only the revoke button hydrates.
 */
export function ActiveSessions({ sessions }: { sessions: readonly SessionSummaryDto[] }) {
  return (
    <>
      <PanelHeader
        title="Active sessions"
        subtitle="Signing out everywhere revokes these server-side, immediately"
        actions={sessions.length > 0 ? <RevokeSessionsButton /> : undefined}
      />

      {sessions.length === 0 ? (
        <p className="py-8 text-center text-sm text-fg-subtle">
          No other sessions are active.
        </p>
      ) : (
        <ul className="divide-y divide-line/60">
          {sessions.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center gap-3 py-3.5">
              <Laptop className="size-4 shrink-0 text-fg-subtle" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm text-fg">
                  Session
                  <span className="font-mono text-2xs text-fg-subtle">
                    {session.id.slice(0, 8)}
                  </span>
                  {session.current ? <Badge tone="up">This device</Badge> : null}
                </p>
                <p className="mt-0.5 text-2xs text-fg-subtle">
                  Started {formatDate(session.createdAt)} · last used{' '}
                  {formatDate(session.lastSeenAt)}
                </p>
              </div>
              <span className="shrink-0 text-2xs text-fg-subtle">
                expires {formatDate(session.expiresAt)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-5 flex items-start gap-2 border-t border-line pt-4 text-xs leading-relaxed text-fg-subtle">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-up" />
        Sessions are rows on our server, not tokens in your browser, which is why
        signing out everywhere takes effect immediately rather than whenever a token
        would have expired. Where each sign-in came from is on your account&rsquo;s
        activity record.
      </p>
    </>
  );
}
