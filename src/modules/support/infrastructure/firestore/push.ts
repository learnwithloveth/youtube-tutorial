import 'server-only';

import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { Messaging } from 'firebase-admin/messaging';

import { logger } from '@/platform/observability/logger';
import type { UserId } from '@/shared/kernel/ids';

import type { DeviceRegistration, PushSender } from '../../application/ports';

import { COLLECTIONS } from './app';

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
 * stops meaning anything.
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
    private readonly appUrl: string,
  ) {}

  async register(device: DeviceRegistration): Promise<void> {
    await this.devices()
      .doc(device.token)
      .set({
        userId: device.userId,
        role: device.role,
        registeredAt: Timestamp.now(),
      } satisfies DeviceDocument);
  }

  async forget(token: string): Promise<void> {
    await this.devices().doc(token).delete();
  }

  async notify(input: {
    audience: 'operators' | { userId: UserId };
    title: string;
    body: string;
    conversationId: string;
  }): Promise<number> {
    // Best-effort by contract. The message this announces is already written, so
    // nothing here is allowed to surface as a failure to send it.
    try {
      const tokens = await this.tokensFor(input.audience);
      if (tokens.length === 0) return 0;

      const link =
        input.audience === 'operators'
          ? `${this.appUrl}/admin/support?conversation=${input.conversationId}`
          : `${this.appUrl}/app`;

      let delivered = 0;
      const dead: string[] = [];

      for (let start = 0; start < tokens.length; start += BATCH_LIMIT) {
        const batch = tokens.slice(start, start + BATCH_LIMIT);
        const response = await this.messaging.sendEachForMulticast({
          tokens: batch,
          // `data` only, no `notification` block: with a notification payload the
          // browser renders its own alert *and* the service worker fires, which is
          // how one message becomes two on the screen. The worker owns the display.
          data: {
            title: input.title,
            body: input.body,
            link,
            conversationId: input.conversationId,
          },
          webpush: { fcmOptions: { link } },
        });

        delivered += response.successCount;
        response.responses.forEach((result, index) => {
          if (result.success) return;
          const code = result.error?.code ?? '';
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/invalid-argument'
          ) {
            const token = batch[index];
            if (token !== undefined) dead.push(token);
          }
        });
      }

      if (dead.length > 0) {
        await Promise.allSettled(dead.map((token) => this.forget(token)));
      }

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
