import 'server-only';

import { logger } from '@/platform/observability/logger';

import { VerificationToken } from '../../domain/verification-token';
import type { User } from '../../domain/user';
import type { IdentityDependencies } from '../ports';
import { renderPasswordResetEmail, renderVerificationEmail } from '../emails';

/**
 * Issues a fresh token and mails the link.
 *
 * Shared by registration, "resend the link", and the password-reset request, so the
 * three cannot drift apart on the parts that matter: superseding outstanding
 * tokens, storing only a digest, and never logging the token itself.
 *
 * ── Failure is swallowed, on purpose ────────────────────────────────────────────
 * A mail transport that is down must not roll back a created account or reveal
 * itself to an unauthenticated caller. Both callers are user-triggered, and both
 * have an obvious remedy — ask again — so the failure is logged for us and
 * invisible to them.
 */

async function issueToken(
  deps: IdentityDependencies,
  user: User,
  purpose: 'email-verification' | 'password-reset',
  now: Date,
): Promise<string> {
  // Requesting a new link invalidates the previous one. Without this, every link
  // ever mailed stays live until it expires, and the attack surface becomes the
  // user's whole inbox history rather than one message.
  await deps.tokens.consumeOutstanding(user.id, purpose, now);

  const { token, tokenHash } = deps.tokenHasher.generate();

  await deps.tokens.save(
    VerificationToken.issue({
      id: deps.tokens.nextId(),
      userId: user.id,
      purpose,
      tokenHash,
      now,
    }),
  );

  return token;
}

export async function sendVerificationEmail(
  deps: IdentityDependencies,
  user: User,
  now: Date,
): Promise<void> {
  try {
    const token = await issueToken(deps, user, 'email-verification', now);
    await deps.email.send(
      renderVerificationEmail({ to: user.email, url: deps.urls.verifyEmail(token) }),
    );
    logger.info({
      event: 'verification_email_sent',
      module: 'identity',
      // Masked: a raw address in a log is personal data under a retention policy
      // written for diagnostics, not for PII.
      recipient: user.email.masked(),
    });
  } catch (error) {
    logger.error(
      { event: 'verification_email_failed', module: 'identity', recipient: user.email.masked() },
      error,
    );
  }
}

export async function sendPasswordResetEmail(
  deps: IdentityDependencies,
  user: User,
  now: Date,
): Promise<void> {
  try {
    const token = await issueToken(deps, user, 'password-reset', now);
    await deps.email.send(
      renderPasswordResetEmail({ to: user.email, url: deps.urls.resetPassword(token) }),
    );
    logger.info({
      event: 'password_reset_email_sent',
      module: 'identity',
      recipient: user.email.masked(),
    });
  } catch (error) {
    logger.error(
      { event: 'password_reset_email_failed', module: 'identity', recipient: user.email.masked() },
      error,
    );
  }
}
