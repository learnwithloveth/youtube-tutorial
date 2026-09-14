'use server';

import { revalidatePath } from 'next/cache';

import { presentAnnouncementError } from '@/modules/announcements';
import { logger } from '@/platform/observability/logger';
import { announcements } from '@/server/announcements';
import { requireAdmin } from '@/server/auth';
import type { UserId } from '@/shared/kernel/ids';

import type { ComposerFormState, MoveFormState } from './form-state';

/**
 * Writing and moving announcements.
 *
 * ── The check is repeated here ────────────────────────────────────────────────
 * A Server Action is a public endpoint and the console layout protects only the
 * page. This one writes to something every visitor to the site can read, so the
 * check is repeated — and the author recorded is the operator this check returns,
 * never a value from the form.
 *
 * ── Publishing invalidates the surfaces, not just this page ───────────────────
 * The banner renders inside `(marketing)` and `(platform)` layouts, so a publish
 * that only revalidated `/admin/announcements` would leave the notice invisible
 * until something else happened to invalidate those. `revalidatePath` with the
 * `layout` type is what reaches them.
 */

/** Both marketing and app shells render the banner, plus the status page. */
function revalidateSurfaces(): void {
  revalidatePath('/admin/announcements');
  revalidatePath('/', 'layout');
  revalidatePath('/status');
}

export async function composeAnnouncementAction(
  _previous: ComposerFormState,
  formData: FormData,
): Promise<ComposerFormState> {
  const operator = await requireAdmin('/admin/announcements');

  const module = announcements();
  if (module === null) {
    return { status: 'error', message: 'Announcements are unavailable.' };
  }

  const intent = String(formData.get('intent') ?? 'draft');
  const publishAt = parseInstant(formData.get('publishAt'));
  const expiresAt = parseInstant(formData.get('expiresAt'));

  const result = await module.compose({
    title: String(formData.get('title') ?? ''),
    body: String(formData.get('body') ?? ''),
    surface: String(formData.get('surface') ?? ''),
    tone: toneFrom(formData.get('tone')),
    authorId: operator.id as UserId,
    expiresAt,
    publishNow: intent === 'publish',
    publishAt: intent === 'schedule' ? publishAt : null,
  });

  if (!result.ok) {
    return { status: 'error', message: presentAnnouncementError(result.error) };
  }

  logger.info({
    event: 'announcement_composed',
    module: 'announcements',
    id: result.value.id,
    intent,
    operatorId: operator.id,
  });

  revalidateSurfaces();

  return {
    status: 'saved',
    message:
      intent === 'publish'
        ? 'Published. It is on the customer surface now.'
        : intent === 'schedule'
          ? 'Scheduled. It appears on its own at that time.'
          : 'Saved as a draft. Nobody can see it yet.',
  };
}

export async function moveAnnouncementAction(
  _previous: MoveFormState,
  formData: FormData,
): Promise<MoveFormState> {
  const operator = await requireAdmin('/admin/announcements');

  const module = announcements();
  if (module === null) {
    return { status: 'error', message: 'Announcements are unavailable.', id: null };
  }

  const id = String(formData.get('id') ?? '');
  const action = String(formData.get('action') ?? '');

  if (
    action !== 'publish' &&
    action !== 'unpublish' &&
    action !== 'archive' &&
    action !== 'schedule'
  ) {
    return { status: 'error', message: 'That request was not understood.', id };
  }

  const result = await module.move({
    id,
    action,
    publishAt: parseInstant(formData.get('publishAt')),
  });

  if (!result.ok) {
    return { status: 'error', message: presentAnnouncementError(result.error), id };
  }

  logger.info({
    event: 'announcement_moved',
    module: 'announcements',
    id,
    action,
    operatorId: operator.id,
  });

  revalidateSurfaces();

  return { status: 'moved', message: MOVED[action], id };
}

const MOVED: Record<'publish' | 'unpublish' | 'archive' | 'schedule', string> = {
  publish: 'Published.',
  unpublish: 'Taken down. It is a draft again.',
  archive: 'Archived.',
  schedule: 'Scheduled.',
};

/**
 * Reads a `datetime-local` value as an instant.
 *
 * ── The zone is the browser's, and that is the right answer here ──────────────
 * Every *display* in this console is pinned to UTC, because two operators
 * comparing an incident over a call must read one clock. An **input** is the
 * opposite case: somebody typing "14:00" means two o'clock where they are sitting,
 * and `new Date('2026-09-20T14:00')` — no trailing `Z` — is exactly that. Adding
 * one would silently move every scheduled notice by the operator's offset.
 */
function parseInstant(value: FormDataEntryValue | null): Date | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toneFrom(value: FormDataEntryValue | null): 'info' | 'warning' | 'critical' {
  return value === 'warning' || value === 'critical' ? value : 'info';
}
