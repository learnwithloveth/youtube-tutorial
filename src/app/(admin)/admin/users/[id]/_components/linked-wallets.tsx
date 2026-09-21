import { BadgeCheck, ExternalLink, Eye, Paperclip } from 'lucide-react';

import type { LinkedWalletDto } from '@/modules/wallet-link';
import { formatDate } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/primitives/badge';

/**
 * The external wallets one account has attached, as an operator sees them.
 *
 * ── A Server Component, like the timeline beside it ───────────────────────────
 * It renders a fixed past. Nothing here is interactive, and nothing here is a
 * control — an operator cannot verify, unverify or remove a wallet from this
 * screen, because none of those use cases exist and a button that looked like it
 * did would be the kind of thing this page was rebuilt to remove.
 *
 * ── The attachment is never presented as proof ────────────────────────────────
 * A watch-only row with a screenshot on it still reads "Watch only". The paperclip
 * is an affordance to open the image, not a second tier of verification. An
 * operator who read a screenshot as proof would be making exactly the decision the
 * customer's own screen is written to prevent them making.
 */
export function LinkedWallets({ wallets }: { wallets: readonly LinkedWalletDto[] }) {
  if (wallets.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-fg-subtle">
        No external wallets attached to this account.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-line/60">
      {wallets.map((wallet) => (
        <li key={wallet.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
          <div className="min-w-0">
            {wallet.label ? (
              <p className="truncate text-sm font-medium text-fg">{wallet.label}</p>
            ) : null}
            <p className="break-all font-mono text-2xs text-fg-muted">{wallet.address}</p>
            <p className="mt-1 text-2xs text-fg-subtle">
              {wallet.chain}
              {' · '}
              {wallet.status === 'verified'
                ? `signature verified ${formatDate(wallet.verifiedAt ?? wallet.linkedAt)}`
                : `added ${formatDate(wallet.linkedAt)}`}
              {wallet.explorer ? (
                <>
                  {' · '}
                  <a
                    href={wallet.explorer}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 transition-colors hover:text-fg"
                  >
                    explorer
                    <ExternalLink className="size-3" />
                  </a>
                </>
              ) : null}
            </p>

            {wallet.evidenceId !== null ? (
              <a
                href={`/api/wallet-link/evidence/${encodeURIComponent(wallet.evidenceId)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1.5 text-2xs font-semibold text-brand-soft transition-colors hover:text-fg"
              >
                <Paperclip className="size-3" />
                Screenshot the customer attached
                {wallet.evidenceAt ? ` · ${formatDate(wallet.evidenceAt)}` : ''}
              </a>
            ) : null}
          </div>

          {wallet.status === 'verified' ? (
            <Badge tone="up">
              <BadgeCheck className="size-3" />
              Verified
            </Badge>
          ) : (
            <Badge tone="neutral">
              <Eye className="size-3" />
              Watch only
            </Badge>
          )}
        </li>
      ))}
    </ul>
  );
}
