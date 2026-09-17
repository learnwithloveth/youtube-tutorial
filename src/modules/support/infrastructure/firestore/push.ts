import 'server-only';

import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { Messaging } from 'firebase-admin/messaging';

import { logger } from '@/platform/observability/logger';
import type { UserId } from '@/shared/kernel/ids';

import type {
  DeviceRegistration,
  PushMessage,
  PushSender,
  RegistrationOutcome,
} from '../../application/ports';

import { COLLECTIONS } from './app';
import { isDeadTokenError } from './dead-token';

/**
 * Web push, through Firebase Cloud Messaging.
 *
 * ── Registrations are keyed by the token ───────────────────────────────────────
 * FCM issues one token per browser per site, and it is already unique — so it is
 * the document id. Keying by user instead would mean one row per person and a
 * second device silently replacing the first, which is how an operator who also
 * has the console open on a laptop stops getting alerts on their phone.
 *
 * ── Dead tokens are deleted, not retried ───────────────────────────────────────
 * A token dies when the browser is uninstalled, the site data is cleared, or the
 * permission is revoked. FCM reports that per-recipient in a batch send, and the
 * only correct response is to forget it: keeping it means paying for a failing
 * send on every message forever, and the count of "devices notified" quietly
 * stops meaning anything. What counts as dead is narrower than it looks — see
 * `isDeadTokenError`.
 */

interface DeviceDocument {
  userId: string;
  role: 'customer' | 'operator';
  registeredAt: Timestamp;
}

/** FCM's batch endpoint caps a single call. Split beyond it. */
const BATCH_LIMIT = 500;

export class FirebasePushSender implements PushSender {
  constructor(
    private readonly db: Firestore,
    private readonly messaging: Messaging,
  ) {}

  /**
   * Checks the token with FCM before saving it.
   *
   * ── Why a token a browser has just handed over can already be dead ─────────
   * The Firebase browser SDK caches a token for seven days and returns it without
   * asking FCM whether it is still registered. A token FCM has since dropped — a
   * push subscription the browser revoked, a registration FCM expired — is handed
   * back as if nothing had happened. Saved blindly, it made the switch read "on",
   * and the first push to it failed and deleted it: a device that silently never
   * receives anything, and re-registers the same dead token on every page load.
   * That is exactly what a development log showed for a browser registered two
   * days earlier.
   *
   * A dry run validates the token and delivers nothing. A dead one is reported as
   * `stale-token` and never stored, so the browser can replace it.
   *
   * Any other failure of the check — FCM briefly unreachable — saves the device
   * anyway. The check exists to catch a dead token, not to make registration
   * depend on a second service being up.
   */
  async register(device: DeviceRegistration): Promise<RegistrationOutcome> {
    try {
      await this.messaging.send({ token: device.token, data: { check: 'registration' } }, true);
    } catch (error) {
      if (isDeadTokenError(error as { code?: string; message?: string })) {
        await this.forget(device.token).catch(() => undefined);
        logger.info({ event: 'push_device_token_stale', module: 'support' });
        return 'stale-token';
      }
      logger.warn({ event: 'push_device_check_failed', module: 'support' }, error);
    }

    await this.devices()
      .doc(device.token)
      .set({
        userId: device.userId,
        role: device.role,
        registeredAt: Timestamp.now(),
      } satisfies DeviceDocument);
    return 'registered';
  }

  async forget(token: string): Promise<void> {
    await this.devices().doc(token).delete();
  }

  async forgetAllFor(userId: UserId): Promise<number> {
    // One batch: nobody has five hundred browsers, and a Firestore batch holds that
    // many deletes.
    const found = await this.devices().where('userId', '==', userId).limit(BATCH_LIMIT).get();
    if (found.empty) return 0;

    const batch = this.db.batch();
    for (const document of found.docs) batch.delete(document.ref);
    await batch.commit();
    return found.size;
  }

  async notify(input: PushMessage): Promise<number> {
    // Best-effort by contract. The message this announces is already written, so
    // nothing here is allowed to surface as a failure to send it.
    try {
      const tokens = await this.tokensFor(input.audience);
      if (tokens.length === 0) {
        // Logged, because it is the commonest reason a notification "does not
        // work": nobody it was addressed to has turned notifications on anywhere.
        logger.debug({ event: 'push_sent', module: 'support', devices: 0, delivered: 0 });
        return 0;
      }

      let delivered = 0;
      const dead: string[] = [];
      const refused = new Map<string, number>();

      for (let start = 0; start < tokens.length; start += BATCH_LIMIT) {
        const batch = tokens.slice(start, start + BATCH_LIMIT);
        const response = await this.messaging.sendEachForMulticast({
          tokens: batch,
          // `data` only, no `notification` block: with a notification payload the
          // browser renders its own alert *and* the service worker fires, which is
          // how one message becomes two on the screen. The worker owns the display.
          // Every value is a string because FCM refuses anything else in `data`.
          data: {
            title: input.title,
            body: input.body,
            link: input.link,
            ...(input.tag !== undefined ? { tag: input.tag } : {}),
            ...(input.surface !== undefined ? { surface: input.surface } : {}),
          },
          // Web Push's own urgency header. Left at its default, a phone saving
          // battery may hold the message until it next wakes — and a price alert or
          // a reply that arrives an hour late has already failed at its one job.
          webpush: { headers: { Urgency: 'high' } },
        });

        delivered += response.successCount;
        response.responses.forEach((result, index) => {
          if (result.success) return;
          const token = batch[index];
          if (token !== undefined && isDeadTokenError(result.error)) {
            dead.push(token);
            return;
          }
          const code = result.error?.code ?? 'unknown';
          refused.set(code, (refused.get(code) ?? 0) + 1);
        });
      }

      if (dead.length > 0) {
        await Promise.allSettled(dead.map((token) => this.forget(token)));
      }

      // Counts only — never a token, never the text. A push that reached nobody
      // leaves nothing behind on any screen, so this line is the only evidence
      // there is of whether it went anywhere.
      logger.info({
        event: 'push_sent',
        module: 'support',
        devices: tokens.length,
        delivered,
        forgotten: dead.length,
        ...(refused.size > 0 ? { refused: Object.fromEntries(refused) } : {}),
      });

      return delivered;
    } catch (error) {
      logger.warn({ event: 'support_push_failed', module: 'support' }, error);
      return 0;
    }
  }

  private async tokensFor(audience: 'operators' | { userId: UserId }): Promise<string[]> {
    const query =
      audience === 'operators'
        ? this.devices().where('role', '==', 'operator')
        : this.devices().where('userId', '==', audience.userId);

    const results = await query.limit(BATCH_LIMIT * 4).get();
    return results.docs.map((document) => document.id);
  }

  private devices() {
    return this.db.collection(COLLECTIONS.devices);
  }
}
