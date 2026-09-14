import 'server-only';

import type { Auth } from 'firebase-admin/auth';

import type { UserId } from '@/shared/kernel/ids';

import type { RealtimeAuth } from '../../application/ports';

/**
 * Custom tokens, so a browser can read its own data and nothing else.
 *
 * ── Nobody signs in to Firebase ────────────────────────────────────────────────
 * There is no Firebase password, no second account and no way to obtain one of
 * these except by already holding a valid session with this application. The route
 * that mints them proves who the caller is through `src/server/auth.ts` — the only
 * place allowed to read a session — and then says so in a claim.
 *
 * That keeps the authority in one place. Firestore's rules are not a second
 * authorisation system to be kept in sync with the first; they are a lock on one
 * specific door, and the key is cut by the first system.
 *
 * ── The claim is prefixed, and the uid is ours ─────────────────────────────────
 * `support_role` rather than `role`, because a token's claims share a namespace
 * with Firebase's own reserved fields and a collision is rejected at mint time
 * with a message that does not say which claim caused it.
 *
 * The uid is this application's `UserId`, which is what makes a rule comparing
 * `request.auth.uid` to a document's `userId` field mean anything at all.
 */
export class FirebaseRealtimeAuth implements RealtimeAuth {
  constructor(private readonly auth: Auth) {}

  async issueToken(userId: UserId, role: 'customer' | 'operator'): Promise<string> {
    return this.auth.createCustomToken(userId, { support_role: role });
  }
}
