# ADR-0005: Google sign-in, and passwords that can be changed

- **Status:** Accepted
- **Date:** 2026-09-16

## Context

The approved design shipped "Continue with Google" and "Continue with Apple" on
both authentication screens. Neither had a click handler: they were `<button>`
elements that did nothing, and [ADR-0004](0004-identity-sessions-and-email-verification.md)
recorded them as design-only.

The security page had the matching gap. It offered "Change password" as a link to
the emailed-reset flow — somebody who was signed in and knew their password had to
go and read their mail — and it stated "Sign-in is by password", which was true only
because no other method existed.

## Decisions

### 1. An account may have no password

`identity.users.password_hash` is nullable. An account created through Google has
no password until its owner sets one, and `User.hasPassword` is what the security
page reads.

The usual shortcut is to fill the column with a hash of something unguessable. That
was rejected: such an account reports itself as having a password it cannot use,
"forgot password" hands it one by mail, and this context loses the ability to tell
the two kinds of account apart — which is the exact question the security page asks.

### 2. The link is keyed on the provider's subject, never on the address

`identity.connected_accounts` has `(provider, provider_account_id)` as its primary
key. Google's `sub` is stable for the life of the account; the address on it is not.
Keying on the address would mean somebody who changes the mail on their Google
account silently gets a second Novex account, and a Workspace address re-issued to a
new employee hands them the previous holder's account.

A second unique index on `(user_id, provider)` keeps it one Google account per user,
so the security page never has to explain two.

### 3. Linking by address requires the provider to have verified it

Signing in with Google against an existing account links them and hands whoever
controls that Google account everything the local account can reach. That is the
deal "sign in with Google" makes, and it is only safe while Google says the address
is **verified**. An unverified address on a Google account is a string its owner
typed, so honouring one would let anybody claim any account by signing up to Google
with its address. `ProviderEmailUnverified` is refused before either linking or
creating, and the refusal is tested.

### 4. A locked account may still sign in with Google; a disabled one may not

`locked` is what five failed *password* attempts produce and exists to stop
guessing. Somebody arriving with a Google assertion is not guessing, and refusing
them would let anybody deny a stranger their own Google sign-in by getting their
password wrong five times. A successful Google sign-in therefore clears the lock.

`disabled` is a decision somebody made about the account rather than a counter, and
is refused on every path.

### 5. The id_token's signature is not verified, and the nonce is

The token is the body of a response to a request this server made to Google's token
endpoint, over TLS, authenticated with the client secret. OpenID Connect Core
§3.1.3.7 permits TLS server validation in place of signature verification for
exactly this case, which is why there is no JWKS fetch and no JWT library.

What is checked is what the token claims: `aud` is this client, `iss` is Google, it
has not expired, and `nonce` matches the one this browser's sign-in generated. The
nonce is what stops a token obtained elsewhere being replayed into someone's
session. `state` is compared before any exchange happens, which is what stops an
attacker feeding a victim's browser their own authorization code — login CSRF. PKCE
is used as well, though the client secret already covers a stolen code.

### 6. Changing a password keeps the caller's session and revokes the rest

The current password is required: holding a session is possession, and a borrowed
laptop or a stolen cookie must not be enough to take an account over. Every *other*
session is revoked, because the usual reason to change a password is the suspicion
that somebody else has it. The caller's own session survives — signing somebody out
of the device they are standing at achieves nothing.

A reset from a mailed link still revokes everything (ADR-0004 §5): there, the
session that might be the attacker's is the one you cannot identify.

For an account with no password there is nothing to ask for, so the substitute is
freshness — the session must have authenticated inside the step-up window that money
movement already uses. A stale session is told to sign in again, which for that
account means a fresh assertion from Google.

### 7. Disconnecting Google is refused when it is the only way in

Checked in the use case rather than the page, because it is a rule about the
account. A reset link would not rescue somebody who removed their only credential:
it sets a password on an account they can no longer reach to ask for one.

## Consequences

- One new table, `identity.connected_accounts`, and `password_hash` becomes
  nullable — migration `0016_bored_war_machine.sql`.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are optional. Without them the
  button is absent rather than dead, and the security page says Google is not
  configured on this deployment.
- The redirect URI is derived from `APP_URL`, so there is one place that states the
  origin. It must be registered on the Google client exactly, port included.
- Apple sign-in is removed from both screens. It had no handler, and a control that
  looks like it works and does not is worse than an absent one.
- Session issuance now has one definition, `issueSession`, shared by registration,
  password sign-in and Google.
