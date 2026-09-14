'use server';

import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';

import { presentIdentityError } from '@/modules/identity';
import { logger } from '@/platform/observability/logger';
import { recordActivity } from '@/server/activity';
import { getCurrentUser, identity } from '@/server/auth';
import { describeRequest } from '@/server/request-context';
import { toUserId } from '@/shared/kernel/ids';

import type { TeamFormState } from './form-state';

/**
 * Suspends or reinstates another administrator.
 *
 * ── The action re-derives its own authority ────────────────────────────────────
 * A Server Action is a public endpoint. The console's layout protects the page and
 * nothing else, so the session is read again here and the actor comes from it —
 * never from the form. A signed-in customer gets 404 rather than 403, for the
 * reason the rest of the console does.
 *
 * Every other rule — operators only, never yourself, never the last one standing —
 * lives in the use case, because they are properties of the operation rather than
 * of this delivery mechanism, and a second caller must not be able to skip them.
 *
 * ── It is written to the activity trail ────────────────────────────────────────
 * Withdrawing somebody's console access is exactly the kind of act that has to be
 * reconstructable afterwards, and the trail is where this application keeps that.
 */
export async function setAdminStatusAction(
  _state: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const actor = await getCurrentUser();
  if (actor === null || actor.role !== 'admin') notFound();

  const targetId = formData.get('targetId');
  const action = formData.get('action');

  if (typeof targetId !== 'string' || (action !== 'suspend' && action !== 'reinstate')) {
    return { status: 'error', message: 'That request was not understood.' };
  }

  let target;
  try {
    target = toUserId(targetId);
  } catch {
    return { status: 'error', message: 'That administrator no longer exists.' };
  }

  const result = await identity().setAdminStatus({
    actorId: actor.id,
    targetId: target,
    action,
  });

  if (!result.ok) {
    return { status: 'error', message: presentIdentityError(result.error) };
  }

  const request = await describeRequest();
  await recordActivity({
    // Against the account it happened to, not the operator who did it. Somebody
    // investigating an account asks "what happened to this", and an entry filed
    // under the actor would not be on the screen where that question gets asked.
    userId: result.value.id,
    kind: action === 'suspend' ? 'admin-suspended' : 'admin-reinstated',
    detail: `by ${actor.email}`,
    // The actor's request, deliberately: this records where the *decision* came
    // from, which is the thing a review of a suspension needs.
    location: request.location,
    agent: request.agent,
    ipDigest: request.ipDigest,
  });

  logger.info({
    event: 'admin_status_changed',
    module: 'identity',
    action,
    actorId: actor.id,
    targetId: result.value.id,
  });

  revalidatePath('/admin/team');

  return {
    status: 'saved',
    message:
      action === 'suspend'
        ? `${result.value.email} is suspended and their sessions are revoked.`
        : `${result.value.email} can sign in again.`,
  };
}
