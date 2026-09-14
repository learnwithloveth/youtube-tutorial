'use client';

import { useActionState, useState } from 'react';
import { Archive, Megaphone, Plus, Send, Undo2 } from 'lucide-react';

import type { AnnouncementDto } from '@/modules/announcements';
import { MAX_BODY, MAX_TITLE, SURFACES } from '@/modules/announcements';
import { cn } from '@/shared/lib/cn';
import { formatTimestamp } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/primitives/badge';

import { Panel, PanelHeader } from '../../../../_console/components/page-header';
import { QuietButton } from '../../../_components/admin-ui';
import { composeAnnouncementAction, moveAnnouncementAction } from '../_lib/actions';
import { IDLE_COMPOSER, IDLE_MOVE } from '../_lib/form-state';

/**
 * The composer and the board.
 *
 * ── Why the composer is one form with three submit buttons ────────────────────
 * Save as draft, schedule and publish are the same fields with different intent,
 * and the intent belongs on the button that carries it: a `name`/`value` pair in
 * the submitted FormData. A separate "mode" dropdown above the buttons would let
 * somebody pick Publish in one control and press Save in another.
 */

const SURFACE_LABELS = Object.fromEntries(
  SURFACES.map((surface) => [surface.id, surface.label]),
) as Record<AnnouncementDto['surface'], string>;

export function AnnouncementsBoard({
  items,
  authors,
  disabled,
}: {
  items: readonly AnnouncementDto[];
  authors: Readonly<Record<string, string>>;
  disabled: boolean;
}) {
  const [composing, setComposing] = useState(false);

  return (
    <>
      <div className="mb-4 flex justify-end">
        <QuietButton onClick={() => setComposing((open) => !open)} disabled={disabled}>
          <Plus className="size-3.5" />
          {composing ? 'Close composer' : 'New announcement'}
        </QuietButton>
      </div>

      {composing ? <Composer onSaved={() => setComposing(false)} /> : null}

      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <AnnouncementCard
            key={item.id}
            item={item}
            author={authors[item.authorId] ?? null}
          />
        ))}
      </div>
    </>
  );
}

function Composer({ onSaved }: { onSaved: () => void }) {
  const [state, submit, pending] = useActionState(composeAnnouncementAction, IDLE_COMPOSER);
  const [surface, setSurface] = useState<string>('banner');

  if (state.status === 'saved') {
    // Rendered instead of the form rather than beside it: the fields are cleared
    // by the server round trip anyway, and leaving them filled invites a second
    // identical notice from somebody who did not notice the first went through.
    return (
      <Panel className="mb-4">
        <PanelHeader title="Saved" subtitle={state.message ?? undefined} />
        <div className="mt-3">
          <QuietButton onClick={onSaved}>Done</QuietButton>
        </div>
      </Panel>
    );
  }

  const reach = SURFACES.find((entry) => entry.id === surface)?.reach ?? '';

  return (
    <Panel className="mb-4">
      <PanelHeader
        title="Compose"
        subtitle="Publishing puts it on the customer surface immediately"
      />

      <form action={submit} className="mt-4 grid gap-4 lg:grid-cols-2">
        <label className="grid gap-1.5 lg:col-span-2">
          <span className="text-xs font-medium text-fg-muted">Title</span>
          <input
            name="title"
            required
            maxLength={MAX_TITLE}
            placeholder="Scheduled maintenance — staking distribution"
            className="rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-brand-soft"
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Surface</span>
          <select
            name="surface"
            value={surface}
            onChange={(event) => setSurface(event.target.value)}
            className="rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-brand-soft"
          >
            {SURFACES.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
          {/* Who this actually reaches, said where the choice is made. The old
              screen had a separate "Audience" dropdown that decided nothing. */}
          <span className="text-2xs text-fg-subtle">{reach}</span>
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Tone</span>
          <select
            name="tone"
            defaultValue="info"
            className="rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-brand-soft"
          >
            <option value="info">Information</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
          <span className="text-2xs text-fg-subtle">Colours the notice. Nothing else.</span>
        </label>

        <label className="grid gap-1.5 lg:col-span-2">
          <span className="text-xs font-medium text-fg-muted">Body</span>
          <textarea
            name="body"
            required
            rows={3}
            maxLength={MAX_BODY}
            placeholder="Keep it to what changes and when."
            className="resize-y rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-brand-soft"
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Show from</span>
          <input
            name="publishAt"
            type="datetime-local"
            className="rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-brand-soft"
          />
          <span className="text-2xs text-fg-subtle">
            Your local time. Only used by &ldquo;Schedule&rdquo;.
          </span>
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Take down at</span>
          <input
            name="expiresAt"
            type="datetime-local"
            className="rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-brand-soft"
          />
          <span className="text-2xs text-fg-subtle">
            {/* Offered here because this is the moment somebody knows the answer.
                A banner nobody remembers to remove is how this feature fails. */}
            Optional, and worth setting for anything dated.
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-2 lg:col-span-2">
          <button
            type="submit"
            name="intent"
            value="publish"
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-up/40 bg-up/10 px-3 py-1.5 text-xs font-medium text-up transition-colors hover:border-up/70 hover:bg-up/18 disabled:pointer-events-none disabled:opacity-40"
          >
            <Send className="size-3.5" />
            {pending ? 'Working…' : 'Publish now'}
          </button>
          <button
            type="submit"
            name="intent"
            value="schedule"
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-brand-soft/40 bg-brand/12 px-3 py-1.5 text-xs font-medium text-brand-soft transition-colors hover:border-brand-soft/70 hover:bg-brand/20 disabled:pointer-events-none disabled:opacity-40"
          >
            Schedule
          </button>
          <button
            type="submit"
            name="intent"
            value="draft"
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-line-strong hover:text-fg disabled:pointer-events-none disabled:opacity-40"
          >
            Save as draft
          </button>
        </div>

        {state.message === null ? null : (
          <p className="text-xs text-down lg:col-span-2" role="alert">
            {state.message}
          </p>
        )}
      </form>
    </Panel>
  );
}

function AnnouncementCard({
  item,
  author,
}: {
  item: AnnouncementDto;
  author: string | null;
}) {
  const [state, submit, pending] = useActionState(moveAnnouncementAction, IDLE_MOVE);
  const message = state.id === item.id ? state.message : null;

  return (
    <Panel className={cn(!item.live && item.status !== 'scheduled' && 'opacity-80')}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{SURFACE_LABELS[item.surface]}</Badge>
        {/* Both, because they differ for exactly the minutes that matter: a
            scheduled notice whose moment has arrived is on the site, and a board
            still calling it "Scheduled" would be lying about the site. */}
        {item.live ? (
          <Badge tone="up">Live</Badge>
        ) : (
          <Badge tone={item.status === 'scheduled' ? 'accent' : 'neutral'} className="capitalize">
            {item.status}
          </Badge>
        )}
        {item.tone === 'info' ? null : (
          <Badge tone={item.tone === 'critical' ? 'down' : 'warn'} className="capitalize">
            {item.tone}
          </Badge>
        )}
      </div>

      <h2 className="flex items-start gap-2 font-display text-base font-semibold text-fg">
        <Megaphone className="mt-0.5 size-4 shrink-0 text-brand-soft" />
        {item.title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-fg-muted">{item.body}</p>

      <dl className="mt-4 grid gap-1 text-2xs text-fg-subtle">
        {item.publishAt === null ? null : (
          <div className="flex gap-2">
            <dt>{item.live ? 'Live since' : 'Appears'}</dt>
            <dd className="text-fg-muted">{formatTimestamp(item.publishAt)}</dd>
          </div>
        )}
        {item.expiresAt === null ? (
          <div className="flex gap-2">
            <dt>Comes down</dt>
            <dd className="text-fg-muted">Only when somebody takes it down</dd>
          </div>
        ) : (
          <div className="flex gap-2">
            <dt>Comes down</dt>
            <dd className="text-fg-muted">{formatTimestamp(item.expiresAt)}</dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt>Written by</dt>
          <dd className="truncate text-fg-muted">{author ?? item.authorId}</dd>
        </div>
      </dl>

      <form action={submit} className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <input type="hidden" name="id" value={item.id} />

        {item.live ? (
          <button
            type="submit"
            name="action"
            value="unpublish"
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-line-strong hover:text-fg disabled:pointer-events-none disabled:opacity-40"
          >
            <Undo2 className="size-3.5" />
            Take down
          </button>
        ) : (
          <button
            type="submit"
            name="action"
            value="publish"
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-up/40 bg-up/10 px-3 py-1.5 text-xs font-medium text-up transition-colors hover:border-up/70 hover:bg-up/18 disabled:pointer-events-none disabled:opacity-40"
          >
            <Send className="size-3.5" />
            Publish now
          </button>
        )}

        <button
          type="submit"
          name="action"
          value="archive"
          disabled={pending}
          title="Off the board, kept on the record"
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-medium text-fg-subtle transition-colors hover:border-line-strong hover:text-fg-muted disabled:pointer-events-none disabled:opacity-40"
        >
          <Archive className="size-3.5" />
          Archive
        </button>

        {message === null ? null : (
          <span className={cn('text-xs', state.status === 'error' ? 'text-down' : 'text-up')}>
            {message}
          </span>
        )}
      </form>
    </Panel>
  );
}
