import 'server-only';

import { err, ok, type Result } from '@/shared/kernel/result';

import { PROVIDER_LABELS, type AuthProvider } from '../../domain/connected-account';
import { EmailAddress } from '../../domain/email-address';
import { User } from '../../domain/user';
import { IdentityErrors, type IdentityError } from '../errors';
import type { IdentityDependencies, ProviderProfile } from '../ports';
import type { SessionDto } from '../dto';
import { issueSession } from './issue-session';

const PROVIDER: AuthProvider = 'google';
const LABEL = PROVIDER_LABELS[PROVIDER];

export interface SignInWithGoogleCommand {
  /** Already obtained from Google by the adapter. This layer never talks to them. */
  profile: ProviderProfile;
  userAgent?: string | null;
  ipAddress?: string | null;
}

/**
 * Sign-in through Google.
 *
 * Three cases, and the middle one is where accounts get stolen:
 *
 * 1. **The Google account is already linked.** Sign that user in. Nothing about the
 *    address matters here — the link is keyed on Google's `sub`, so a person who
 *    changed the mail on their Google account still lands on their own account.
 *
 * 2. **No link, but the address matches an existing account.** Link them, which
 *    hands whoever controls that Google account everything the local account can
 *    reach. That is the deal "sign in with Google" makes, and it is only safe while
 *    Google says the address is *verified*: an unverified address on a Google
 *    account is a string its owner typed, so honouring one would let anybody claim
 *    any account by signing up to Google with its address. Hence the refusal below,
 *    before either linking or creating.
 *
 * 3. **Neither.** Create an account with no password, already confirmed, because
 *    Google just confirmed it.
 *
 * ── A locked account may still sign in this way ───────────────────────────────
 * `locked` is what five failed *password* attempts produce, and its purpose is to
 * stop guessing. Somebody arriving with a Google assertion is not guessing, so the
 * lock does not apply to them, and signing in clears it — otherwise anybody could
 * lock a stranger out of their own Google sign-in by getting their password wrong
 * five times. `disabled` is different and is refused: that is a decision somebody
 * made about this account, not a counter.
 */
export function createSignInWithGoogle(deps: IdentityDependencies) {
  return async function signInWithGoogle(
    command: SignInWithGoogleCommand,
  ): Promise<Result<SessionDto, IdentityError>> {
    const now = deps.clock.now();
    const { profile } = command;

    const existingLink = await deps.connectedAccounts.find(PROVIDER, profile.providerAccountId);
    if (existingLink !== null) {
      const linked = await deps.users.findById(existingLink.userId);
      // The row cascades with its user, so this is unreachable short of a foreign
      // key being dropped. It fails closed rather than falling through to the
      // create path, which would register a second account for the same person.
      if (linked === null) return err(IdentityErrors.invalidCredentials());

      return signIn(linked);
    }

    // Everything past here either links or creates, and both rest on the address.
    if (!profile.emailVerified) {
      return err(IdentityErrors.providerEmailUnverified(LABEL));
    }

    const email = EmailAddress.parse(profile.email);
    if (!email.ok) return err(IdentityErrors.emailMalformed());

    const existing = await deps.users.findByEmail(email.value);
    if (existing !== null) return linkAndSignIn(existing);

    const created = User.registerWithProvider({
      id: deps.users.nextId(),
      email: email.value,
      now,
    });

    // The unique index arbitrates, not application code: a signup racing this one
    // for the same address would otherwise produce two accounts.
    const inserted = await deps.users.insertIfEmailFree(created);
    if (!inserted) {
      const won = await deps.users.findByEmail(email.value);
      if (won === null) return err(IdentityErrors.emailAlreadyRegistered());
      return linkAndSignIn(won);
    }

    const linked = await deps.connectedAccounts.link({
      provider: PROVIDER,
      providerAccountId: profile.providerAccountId,
      userId: created.id,
      email: profile.email,
      linkedAt: now,
    });
    if (!linked) return err(IdentityErrors.providerAccountLinkedElsewhere(LABEL));

    return signIn(created);

    async function linkAndSignIn(user: User): Promise<Result<SessionDto, IdentityError>> {
      const linkedNow = await deps.connectedAccounts.link({
        provider: PROVIDER,
        providerAccountId: profile.providerAccountId,
        userId: user.id,
        email: profile.email,
        linkedAt: now,
      });
      // Lost to another sign-in linking the same Google account: it belongs to
      // somebody, and this request cannot tell whose it is.
      if (!linkedNow) return err(IdentityErrors.providerAccountLinkedElsewhere(LABEL));

      return signIn(user);
    }

    async function signIn(user: User): Promise<Result<SessionDto, IdentityError>> {
      if (user.status === 'disabled') return err(IdentityErrors.accountDisabled());

      // Clears any lockout, and confirms the address if it was not already —
      // Google vouching for it is the same proof our own mailed link asks for.
      user.recordSuccessfulAuthentication();
      user.verifyEmail(now);
      await deps.users.save(user);

      return ok(await issueSession(deps, user, command, now));
    }
  };
}

export type SignInWithGoogle = ReturnType<typeof createSignInWithGoogle>;
