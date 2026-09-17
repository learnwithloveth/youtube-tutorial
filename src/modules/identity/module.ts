import 'server-only';

import type { Database } from '@/platform/db/client';
import { systemClock, type Clock } from '@/shared/kernel/clock';

import type {
  AppUrls,
  EmailSender,
  IdentityDependencies,
  OAuthClient,
} from './application/ports';
import {
  createChangePassword,
  type ChangePassword,
} from './application/use-cases/change-password';
import {
  createConnectGoogle,
  createDisconnectGoogle,
  type ConnectGoogle,
  type DisconnectGoogle,
} from './application/use-cases/google-connection';
import {
  createSignInWithGoogle,
  type SignInWithGoogle,
} from './application/use-cases/sign-in-with-google';
import {
  GoogleOAuthClient,
  type GoogleOAuthConfig,
} from './infrastructure/oauth/google-client';
import {
  createDescribeUsers,
  type DescribeUsers,
} from './application/queries/describe-users';
import {
  createListAdministrators,
  type ListAdministrators,
} from './application/queries/list-administrators';
import { createListUsers, type ListUsers } from './application/queries/list-users';
import {
  createSetAdminStatus,
  type SetAdminStatus,
} from './application/use-cases/set-admin-status';
import {
  createUpdateProfile,
  type UpdateProfile,
} from './application/use-cases/update-profile';
import {
  createListSessions,
  type ListSessions,
} from './application/queries/list-sessions';
import {
  createSubmitVerification,
  type SubmitVerification,
} from './application/use-cases/submit-verification';
import {
  createDecideVerification,
  type DecideVerification,
} from './application/use-cases/decide-verification';
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
  DrizzleConnectedAccountRepository,
  DrizzleSessionRepository,
  DrizzleProfileRepository,
  DrizzleUserRepository,
  DrizzleVerificationTokenRepository,
} from './infrastructure/persistence/repositories';
import {
  DrizzleVerificationRepository,
  PostgresDocumentStorage,
} from './infrastructure/persistence/verification-repository';

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
   * never read `identity.users`; this is how they turn one back into an email without
   * that rule being broken.
   */
  readonly describeUsers: DescribeUsers;
  /** The account holder changes their display name or handle. */
  readonly updateProfile: UpdateProfile;
  /** Withdraws or restores an operator's console access. Never promotes. */
  readonly setAdminStatus: SetAdminStatus;
  /** The console's account list: filtered, paged, with per-status tallies. */
  readonly listUsers: ListUsers;
  /** Who can act in the console, with when each was last seen. */
  readonly listAdministrators: ListAdministrators;
  /** A user's live sessions, for the security page. */
  readonly listSessions: ListSessions;
  /** The account holder replaces their password, or sets a first one. */
  readonly changePassword: ChangePassword;
  /**
   * Sign-in through Google, from a profile the adapter has already obtained.
   *
   * Creates the account, or links to one with the same confirmed address, or signs
   * in the account already linked — see the use case for why the middle one is the
   * dangerous case.
   */
  readonly signInWithGoogle: SignInWithGoogle;
  /** Connects Google to the signed-in account. */
  readonly connectGoogle: ConnectGoogle;
  /** Removes the link, unless it is the only way in. */
  readonly disconnectGoogle: DisconnectGoogle;
  /**
   * The Google client, or null when no credentials are configured.
   *
   * Null is what the interface reads to decide whether the button exists at all: a
   * "Continue with Google" that cannot complete is worse than none.
   */
  readonly google: OAuthClient | null;
  /** A customer submits an identity document for review. */
  readonly submitVerification: SubmitVerification;
  /** An operator approves or rejects one submission. Decided once. */
  readonly decideVerification: DecideVerification;
  /** Name of the session cookie. Owned here so the delivery layer cannot drift. */
  readonly cookieName: string;
  /**
   * The wiring, for queries that take the bag rather than being closed over it.
   *
   * Same arrangement the ledger uses: a read has no command and no invariant to
   * protect, so it is a function of the ports rather than a method on the module.
   */
  readonly dependencies: IdentityDependencies;
}

export interface RegisterIdentityOptions {
  db: Database;
  /** At least 32 characters; both the seal key and the digest key derive from it. */
  sessionSecret: string;
  /** Origin used to build the links in outbound mail. */
  appUrl: string;
  /** The site's name, as outbound mail signs itself. */
  siteName: string;
  /** Omit to fall back to logging messages instead of sending them. */
  smtp?: SmtpConfig | undefined;
  /** Omit to run without Google sign-in, which is a supported configuration. */
  google?: GoogleOAuthConfig | undefined;
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
    profiles: new DrizzleProfileRepository(options.db),
    sessions: new DrizzleSessionRepository(options.db),
    connectedAccounts: new DrizzleConnectedAccountRepository(options.db),
    tokens: new DrizzleVerificationTokenRepository(options.db),
    verifications: new DrizzleVerificationRepository(options.db),
    documents: new PostgresDocumentStorage(options.db),
    hasher: new ScryptPasswordHasher(),
    tokenHasher: new Sha256TokenHasher(),
    sealer: new AeadSessionSealer(options.sessionSecret),
    digest: new HmacDigest(options.sessionSecret),
    email,
    urls,
    siteName: options.siteName,
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
    updateProfile: createUpdateProfile(dependencies),
    setAdminStatus: createSetAdminStatus(dependencies),
    listUsers: createListUsers(dependencies),
    listAdministrators: createListAdministrators(dependencies),
    listSessions: createListSessions(dependencies),
    changePassword: createChangePassword(dependencies),
    signInWithGoogle: createSignInWithGoogle(dependencies),
    connectGoogle: createConnectGoogle(dependencies),
    disconnectGoogle: createDisconnectGoogle(dependencies),
    google: options.google ? new GoogleOAuthClient(options.google) : null,
    submitVerification: createSubmitVerification(dependencies),
    decideVerification: createDecideVerification(dependencies),
    cookieName: SESSION_COOKIE_NAME,
    dependencies,
  };
}
