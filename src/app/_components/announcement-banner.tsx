import { CircleAlert, Info, TriangleAlert } from 'lucide-react';

import type { AnnouncementDto, AnnouncementSurface } from '@/modules/announcements';
import { getSurfaceAnnouncements } from '@/server/announcements';
import { cn } from '@/shared/lib/cn';

/**
 * The strip a published announcement actually appears in.
 *
 * ── This is what makes the console screen true ────────────────────────────────
 * "Live on customer surfaces" was a count of fixtures against no surface at all —
 * publishing wrote to a reducer and a reload undid it. This component is the other
 * half: the console writes a row, and every page render reads it back here.
 *
 * ── A Server Component, with no dismiss ───────────────────────────────────────
 * No `'use client'`, so a notice costs no JavaScript and is in the HTML a crawler
 * and a screen reader receive. That rules out a per-visitor dismiss button, which
 * would need client state — and deliberately: the thing worth announcing on a
 * banner is usually the thing somebody would dismiss without reading. `expiresAt`
 * is how a notice goes away, and it goes away for everybody at once.
 *
 * ── It renders nothing when there is nothing ──────────────────────────────────
 * Including when the read fails. A layout that throws takes the whole page with
 * it, and a missing notice is the state the site was in a moment earlier anyway.
 * The console is where a failure to read has to be visible, and it is.
 */

const TONES = {
  info: {
    Icon: Info,
    wrapper: 'border-brand-soft/30 bg-[color-mix(in_oklab,var(--brand)_10%,transparent)]',
    icon: 'text-brand-soft',
  },
  warning: {
    Icon: TriangleAlert,
    wrapper: 'border-warn/35 bg-[color-mix(in_oklab,var(--warn)_12%,transparent)]',
    icon: 'text-warn',
  },
  critical: {
    Icon: CircleAlert,
    wrapper: 'border-down/40 bg-[color-mix(in_oklab,var(--down)_12%,transparent)]',
    icon: 'text-down',
  },
} as const satisfies Record<AnnouncementDto['tone'], unknown>;

export async function AnnouncementBanner({ surface }: { surface: AnnouncementSurface }) {
  const live = await getSurfaceAnnouncements(surface);
  if (live.length === 0) return null;

  return (
    <div role="region" aria-label="Platform announcements">
      {live.map((item) => {
        const tone = TONES[item.tone];
        return (
          <div key={item.id} className={cn('border-b', tone.wrapper)}>
            <div className="shell flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2.5 text-center text-xs">
              <tone.Icon aria-hidden className={cn('size-4 shrink-0', tone.icon)} />
              <span className="font-medium text-fg">{item.title}</span>
              <span className="text-fg-muted">{item.body}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
