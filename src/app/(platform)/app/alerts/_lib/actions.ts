'use server';

import { revalidatePath } from 'next/cache';

import { presentAlertError } from '@/modules/alerts';
import { logger } from '@/platform/observability/logger';
import { alerts, getAlertableSymbols } from '@/server/alerts';
import { requireUser } from '@/server/auth';
import { markNotificationsRead } from '@/server/notifications';

import type { AlertFormState, AlertMoveState } from './form-state';

/**
 * The alerts page's write boundary.
 *
 * ── Every action re-derives its own authority ─────────────────────────────────
 * A Server Action is a public endpoint, and the layout that rendered this form
 * protects nothing. The alert is filed against the session's own account, never
 * against an id from the form — a hidden owner field would make setting alerts on
 * somebody else's account a matter of editing the DOM.
 */

export async function createAlertAction(
  _previous: AlertFormState,
  formData: FormData,
): Promise<AlertFormState> {
  const user = await requireUser('/app/alerts');

  const context = alerts();
  if (context === null) {
    return { status: 'error', message: 'Alerts are unavailable.' };
  }

  const result = await context.createAlert({
    userId: user.id,
    symbol: String(formData.get('symbol') ?? ''),
    direction: formData.get('direction') === 'below' ? 'below' : 'above',
    target: String(formData.get('target') ?? ''),
    // The live instrument list, so an alert can never be set on a symbol nobody
    // quotes — one of those would sit armed forever and read as a broken feature.
    knownSymbols: await getAlertableSymbols(),
  });

  if (!result.ok) {
    return { status: 'error', message: presentAlertError(result.error) };
  }

  logger.info({ event: 'price_alert_created', module: 'alerts', id: result.value.id });
  revalidatePath('/app/alerts');

  return { status: 'created', message: 'Watching. It fires once, then waits to be re-armed.' };
}

export async function moveAlertAction(
  _previous: AlertMoveState,
  formData: FormData,
): Promise<AlertMoveState> {
  const user = await requireUser('/app/alerts');

  const context = alerts();
  if (context === null) {
    return { status: 'error', message: 'Alerts are unavailable.', id: null };
  }

  const id = String(formData.get('id') ?? '');
  const raw = String(formData.get('action') ?? '');
  if (raw !== 'mute' && raw !== 'rearm' && raw !== 'delete') {
    return { status: 'error', message: 'That request was not understood.', id };
  }

  const result = await context.moveAlert({ id, userId: user.id, action: raw });
  if (!result.ok) {
    return { status: 'error', message: presentAlertError(result.error), id };
  }

  revalidatePath('/app/alerts');
  return { status: 'moved', message: MOVED[raw], id };
}

const MOVED = {
  mute: 'Muted.',
  rearm: 'Watching again.',
  delete: 'Deleted.',
} as const;

/**
 * Marks the notification feed read.
 *
 * Called when the bell is opened. Returns nothing: the badge is server-rendered
 * on the next navigation, and blocking the popover's paint on a write is a
 * spinner where a number used to be.
 */
export async function markNotificationsReadAction(): Promise<void> {
  const user = await requireUser('/app');
  await markNotificationsRead(user.id);
  revalidatePath('/app', 'layout');
}
