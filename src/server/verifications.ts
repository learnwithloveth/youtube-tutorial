import 'server-only';

import { getVerificationQueue, type IdentityModule } from '@/modules/identity/server';
import type { VerificationQueueDto } from '@/modules/identity';
import { logger } from '@/platform/observability/logger';

import { toUserId, type UserId } from '@/shared/kernel/ids';

import { identity } from './auth';

/**
 * The console's read side for identity verification.
 *
 * ── Why the join happens here ─────────────────────────────────────────────────
 * A verification row holds a `userId` and nothing else about the account. The
 * console needs an email beside each case, and identity is the only module allowed
 * to read `identity.users` — which it already is here, so this is a call into the
 * same module rather than a cross-context reach. The arrangement matches the
 * transactions feed: the query returns ids, the composition root turns them into
 * something a person recognises.
 *
 * ── A failed lookup is not a failed page ──────────────────────────────────────
 * An id that cannot be resolved renders as the id. An operator can act on an id;
 * they cannot act on an error boundary, and a queue that refuses to load because
 * one display name was missing is worse than one that shows a uuid.
 */

export interface VerificationConsoleDto extends VerificationQueueDto {
  /** Email per `userId`, for whichever ids resolved. */
  readonly accounts: Readonly<Record<string, string>>;
}

export async function getVerificationConsole(): Promise<VerificationConsoleDto> {
  const identityModule: IdentityModule = identity();
  const queue = await getVerificationQueue(identityModule.dependencies);

  const ids = [...new Set([...queue.pending, ...queue.decided].map((entry) => entry.userId))];
  return { ...queue, accounts: await describeAccounts(ids) };
}

async function describeAccounts(ids: readonly string[]): Promise<Record<string, string>> {
  const parsed = ids.flatMap((id) => {
    try {
      return [toUserId(id)];
    } catch {
      // A stored id that is not a well-formed `UserId` is a data fault, not a
      // reason to fail the read. It is logged where it is written, not here.
      return [];
    }
  }) as UserId[];

  if (parsed.length === 0) return {};

  try {
    const found = await identity().describeUsers(parsed);
    return Object.fromEntries([...found.values()].map((user) => [user.id, user.email]));
  } catch (error) {
    logger.warn({ event: 'verification_accounts_read_failed', module: 'identity' }, error);
    return {};
  }
}

/**
 * The document behind one submission, with the account that owns it.
 *
 * ── Why the owner comes back with the bytes ───────────────────────────────────
 * The route handler has to answer "may this session see this file" before it
 * answers "what is in it", and the only way to know whose file it is, is to read
 * the row. Returning both from one call means there is no path where the bytes are
 * fetched and the check is forgotten — the same shape `getDepositProof` uses, for
 * the same reason.
 *
 * The storage key never leaves this file. It is an internal handle, and putting it
 * on the console DTO would make it a URL somebody eventually builds by hand.
 */
export async function getVerificationDocument(
  verificationId: string,
): Promise<{ bytes: Uint8Array; contentType: string; ownerId: string } | null> {
  try {
    const deps = identity().dependencies;

    const verification = await deps.verifications.find(verificationId);
    if (verification === null) return null;

    const document = await deps.documents.get(verification.documentId);
    if (document === null) return null;

    return {
      bytes: document.bytes,
      contentType: document.contentType,
      ownerId: verification.userId,
    };
  } catch (error) {
    logger.error(
      { event: 'verification_document_read_failed', module: 'identity', verificationId },
      error,
    );
    return null;
  }
}
