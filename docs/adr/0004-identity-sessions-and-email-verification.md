# ADR-0004: Server-side sessions and mailed verification tokens

- **Status:** Accepted
- **Date:** 2026-09-09

## Context

The approved design shipped five authentication screens — sign-up, sign-in,
two-factor, identity verification, forgot-password — and none of them did
anything. Each form's submit handler called `router.push(...)`. There was no user
store, no password hashing, no session, and nothing that could send an email.

An identity module already existed on the `main` branch with a sound domain
model, scrypt hashing and AEAD-sealed sessions, but it had never been wired to a
mail transport: `email_verified_at` was a column that nothing ever wrote, and
`User.verifyEmail()` was a method with no caller.

## Decisions

### 1. Sessions are server-side rows, not self-contained tokens

A JWT cannot be revoked before it expires. For a product that moves money that is
disqualifying: "log out all devices" after a stolen laptop has to take effect
immediately, not in seven days. The cookie carries an opaque AES-256-GCM sealed
session id; the server holds the authority.

The sealing is authenticated encryption rather than a signature so that tampering
fails closed — a modified cookie cannot decode to a different session id — and so
that the id is not published in the cookie at all.

### 2. Verification tokens are stored as digests, and are scoped to a purpose

The row holds a SHA-256 of the token, never the token. A database leak therefore
yields nothing an attacker can put in a URL.

**SHA-256, not scrypt.** Passwords need a slow KDF because they are low-entropy
and human-chosen, so a stolen hash can be attacked by guessing. A token here is
32 bytes from the platform CSPRNG; there is no guessing attack to slow down, and
running scrypt would add ~100ms to every click of a link — including every
prefetch by a mail scanner — for nothing.

Each token carries the purpose it was issued for, and redemption checks it. Without
that, an email-confirmation token — long-lived, low-value, widely scanned — could
be replayed against the password-reset endpoint, which hands over the account.

### 3. Confirming an address does not sign anyone in

The token proves only that someone received mail at that address. Verification
links get prefetched by scanners, forwarded, and left in inboxes; issuing a session
on redemption would turn every one of those into a login. The page confirms the
address and sends the user to sign in normally.

### 4. Registration issues a session; it does not require confirmation first

Being made to check your mail before you can look around is a real drop-off cost
for no security gain — the account has nothing in it yet. What the unconfirmed
state does is show a banner, and gate anything that depends on being able to reach
the person. `CurrentUserDto.emailVerified` carries it.

### 5. A password reset revokes every session

This is the decision that is easiest to omit and matters most. A reset is the
remedy for a compromised account; if the attacker's session survives it, the reset
has achieved nothing except locking the real owner into sharing their account.

The reset also confirms the address, because clicking the link proved receipt.
Asking for a separate confirmation afterwards would be theatre.

### 6. Failure modes are chosen to avoid oracles

- Sign-in returns one undifferentiated `InvalidCredentials` for "no such account"
  and "wrong password", and performs a decoy hash when no user matched so the
  response time does not reveal which it was.
- `requestPasswordReset` reports success for every address, registered or not.
- "Token not found", "already used" and "wrong purpose" collapse into one error.
  Expiry is separated, because unlike the others it has an actionable remedy.

### 7. SMTP in development and production, not a provider SDK

Mailpit speaks plain SMTP, which is what a real provider speaks. One adapter
serves both, so the code path exercised on a laptop is the one that runs in
production and "it worked locally" means something. Only host, port and
credentials differ.

With no `SMTP_HOST` configured the sender logs the message instead, so a fresh
clone completes a signup and prints the link rather than failing at the last step.

## Consequences

- Three new tables, all module-local and prefixed `id_`: `id_users`,
  `id_sessions`, `id_verification_tokens`.
- Every auth mutation is a Server Action that re-derives its own authority. A
  page-level check does not protect an action, which anyone who can read the
  page's JavaScript can invoke directly.
- The session cookie is `httpOnly`, `sameSite=lax`, and `secure` outside
  development.
- 15 new tests cover token scoping, single use, expiry, session revocation on
  reset, and the absence of an enumeration oracle — all against in-memory
  adapters, with no database and no SMTP.

## Known gaps

- **No rate limiting.** `IdentityErrors.rateLimited` exists and nothing produces
  it. Sign-in has per-account lockout after five failures, which bounds guessing
  against one account, but there is no per-IP limit on sign-in, registration or
  reset requests. That needs a shared counter store — the `redisdata` volume in
  `docker-compose.yml` is reserved for it.
- **Two-factor and identity verification are still UI only.** The `/two-factor`
  and `/verify-identity` screens navigate without checking anything. Real TOTP
  belongs in this module; KYC belongs in a separate compliance context.
- **Passkeys and social sign-in are design-only.** The buttons are present because
  the approved design has them; they are not wired to WebAuthn or any provider.
