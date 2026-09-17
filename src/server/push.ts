import 'server-only';

import { after } from 'next/server';

import type { RecordActivityCommand } from '@/modules/activity/server';
import { logger } from '@/platform/observability/logger';
import type { UserId } from '@/shared/kernel/ids';

import { recordActivity } from './activity';
import { pushFor } from './notification-copy';
import { support } from './support';

/**
 * The application's facade over web push.
 *
 * The device registry and the sender live in the support module, which was the
 * first thing to push. What is here is everything that is not about support: which
 * account events reach a phone, and how a browser's registration ends when the
 * session behind it does.
 */

/**
 * Records an event on the account's trail *and* sends it to the account's devices.
 *
 * ── A separate call, not a flag on `recordActivity` ─────────────────────────────
 * A kind does not say who acted. `deposit-recorded` is written when an operator
 * credits a claim and when the customer files one; `sign-in` when somebody signs in
 * and when they disconnect Google from their own settings. Only the call site knows
 * whether an event happened *to* the person or was done *by* them a moment ago, and
 * only the first is worth their phone buzzing — so the call site chooses this
 * function, and every other write stays exactly as it was.
 *
 * ── After the response, where there is one ────────────────────────────────────
 * A sign-in should not hold its redirect for a Firestore query and an FCM round
 * trip, so the send runs in `after`. The alert evaluator runs from the refresh loop
 * instead, outside any request, where `after` throws — and where there is no
 * response to protect, so the send simply starts.
 *
 * The push goes out even if the trail write failed: the trail is best-effort, and
 * the withdrawal was still approved. Never throws.
 */
export async function recordAndPush(command: RecordActivityCommand): Promise<void> {
  await recordActivity(command);

  const message = pushFor({
    kind: command.kind,
    reference: command.reference ?? null,
    detail: command.detail ?? null,
    browser: command.agent?.browser ?? null,
    device: command.agent?.device ?? null,
    location: command.location ?? null,
  });
  if (message === null) return;

  const send = async (): Promise<void> => {
    try {
      const context = support();
      if (context === null) return;
      await context.dependencies.push.notify({ audience: { userId: command.userId }, ...message });
    } catch (error) {
      logger.warn({ event: 'activity_push_failed', module: 'support', kind: command.kind }, error);
    }
  };

  try {
    after(send);
  } catch {
    void send();
  }
}

/**
 * The push registration a browser made, remembered where the server can read it.
 *
 * ── Why the server needs to know which token is this browser's ────────────────
 * Signing out has to stop this browser receiving the account's notifications. On a
 * shared machine the next person would otherwise be shown the last one's alerts,
 * and an operator's registration carries previews of what customers write. Sign-out
 * is a form posted to a Server Action: it cannot ask the page for the token, and a
 * page already navigating away cannot be relied on to send it. So registering
 * leaves the token in this cookie, and signing out reads it back.
 *
 * Not a credential. A token lets this project's servers address this browser and
 * nothing more — `httpOnly` all the same, because no script on the page needs it.
 */
export const PUSH_DEVICE_COOKIE = 'novex_push_device';

export function pushDeviceCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // Refreshed by every registration, and an opted-in page registers on each load,
    // so this only lapses for a browser nobody has used in half a year.
    maxAge: 60 * 60 * 24 * 180,
  };
}

/** Forgets one browser. Never throws: it runs after a sign-out already happened. */
export async function forgetPushDevice(token: string): Promise<void> {
  const context = support();
  if (context === null) return;

  try {
    await context.dependencies.push.forget(token);
  } catch (error) {
    logger.warn({ event: 'push_device_forget_failed', module: 'support' }, error);
  }
}

/**
 * Forgets every browser registered to an account. Never throws.
 *
 * For "sign out everywhere", whose point is that nobody else keeps a foothold — and
 * a browser that still receives the account's alerts and support replies is one.
 * The owner loses nothing lasting: their own browsers register again on their next
 * visit, because the choice to receive notifications is remembered in the browser.
 */
export async function forgetPushDevicesFor(userId: UserId): Promise<void> {
  const context = support();
  if (context === null) return;

  try {
    const forgotten = await context.dependencies.push.forgetAllFor(userId);
    logger.info({ event: 'push_devices_forgotten', module: 'support', forgotten });
  } catch (error) {
    logger.warn({ event: 'push_device_forget_failed', module: 'support' }, error);
  }
}
