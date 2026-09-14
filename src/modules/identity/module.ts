import 'server-only';

import type { Database } from '@/platform/db/client';
import { systemClock, type Clock } from '@/shared/kernel/clock';

import type { AppUrls, EmailSender, IdentityDependencies } from './application/ports';
import {
  createDescribeUsers,
  type DescribeUsers,
} from './application/queries/describe-users';
import { createAuthenticate, type Authenticate } from './application/use-cases/authenticate';
import { createRegisterUser, type RegisterUser } from './application/use-cases/register-user';
import {
  createResetPassword,
  type ResetPassword,
} from './application/use-cases/reset-password';
import {
  createResolveSession,
  createRevokeAllSessions,
  createSignOut,
  type ResolveSession,
  type RevokeAllSessions,
  type SignOut,
} from './application/use-cases/resolve-session';
import {
  createConfirmEmail,
  createRequestPasswordReset,
  createResendVerification,
  type ConfirmEmail,
  type RequestPasswordReset,
  type ResendVerification,
} from './application/use-cases/verify-email';
import { AeadSessionSealer, HmacDigest } from './infrastructure/crypto/aead-sealer';
import { ScryptPasswordHasher } from './infrastructure/crypto/scrypt-hasher';
import { Sha256TokenHasher } from './infrastructure/crypto/token-hasher';
import {
  ConsoleEmailSender,
  SmtpEmailSender,
  type SmtpConfig,
} from './infrastructure/email/smtp-sender';
import {
  DrizzleSessionRepository,
  DrizzleUserRepository,
  DrizzleVerificationTokenRepository,
} from './infrastructure/persistence/repositories';

/**
 * Identity module registration.
 *
 * ── The extraction seam ─────────────────────────────────────────────────────────
 * This is the only file that knows both the ports and the adapters. To run identity
 * as its own service you keep `domain/` and `application/` untouched, call
 * `registerIdentity` from that service's entry point, and replace this app's copy
 * with an HTTP client implementing the same public API. Nothing in `src/app/**` or
 * any other module changes, because none of them ever saw more than DTOs and
 * function signatures.
 */

export interface IdentityModule {
  readonly registerUser: RegisterUser;
  readonly authenticate: Authenticate;
  readonly resolveSession: ResolveSession;
  readonly signOut: SignOut;
  readonly revokeAllSessions: RevokeAllSessions;
  readonly confirmEmail: ConfirmEmail;
  readonly resendVerification: ResendVerification;
  readonly requestPasswordReset: RequestPasswordReset;
  readonly resetPassword: ResetPassword;
  /**
   * Resolves ids to summaries, for a caller that holds a `UserId` and needs a name.
   *
   * The identity half of a cross-context join. Other modules hold an opaque id and
   * never read `id_users`; this is how they turn one back into an email without
   * that rule being broken.
   */
  readonly describeUsers: DescribeUsers;
  /** Name of the session cookie. Owned here so the delivery layer cannot drift. */
  readonly cookieName: string;
}

export interface RegisterIdentityOptions {
  db: Database;
  /** At least 32 characters; both the seal key and the digest key derive from it. */
  sessionSecret: string;
  /** Origin used to build the links in outbound mail. */
  appUrl: string;
  /** Omit to fall back to logging messages instead of sending them. */
  smtp?: SmtpConfig | undefined;
  clock?: Clock;
}

export const SESSION_COOKIE_NAME = 'novex_session';

export function registerIdentity(options: RegisterIdentityOptions): IdentityModule {
  const email: EmailSender = options.smtp
    ? new SmtpEmailSender(options.smtp)
    : new ConsoleEmailSender();

  // Built here rather than read from the environment inside a use case: a use case
  // that reaches for process.env cannot be tested without setting global state.
  const origin = options.appUrl.replace(/\/+$/, '');
  const urls: AppUrls = {
    verifyEmail: (token) => `${origin}/verify-email?token=${encodeURIComponent(token)}`,
    resetPassword: (token) => `${origin}/reset-password?token=${encodeURIComponent(token)}`,
  };

  const dependencies: IdentityDependencies = {
    users: new DrizzleUserRepository(options.db),
    sessions: new DrizzleSessionRepository(options.db),
    tokens: new DrizzleVerificationTokenRepository(options.db),
    hasher: new ScryptPasswordHasher(),
    tokenHasher: new Sha256TokenHasher(),
    sealer: new AeadSessionSealer(options.sessionSecret),
    digest: new HmacDigest(options.sessionSecret),
    email,
    urls,
    clock: options.clock ?? systemClock,
  };

  return {
    registerUser: createRegisterUser(dependencies),
    authenticate: createAuthenticate(dependencies),
    resolveSession: createResolveSession(dependencies),
    signOut: createSignOut(dependencies),
    revokeAllSessions: createRevokeAllSessions(dependencies),
    confirmEmail: createConfirmEmail(dependencies),
    resendVerification: createResendVerification(dependencies),
    requestPasswordReset: createRequestPasswordReset(dependencies),
    resetPassword: createResetPassword(dependencies),
    describeUsers: createDescribeUsers(dependencies),
    cookieName: SESSION_COOKIE_NAME,
  };
}
