import { AccountNumber } from '../domain/account-number';
import type { UserRepository } from './ports';

/**
 * Picks an account number nobody is using.
 *
 * ── Look first, and let the index arbitrate ───────────────────────────────────
 * The same arrangement registration already uses for an email address: the use
 * case checks, and the unique index decides. Checking first is what makes the
 * ordinary path ordinary — a collision would otherwise surface as a driver error
 * on the insert, which is a 500 on a sign-up form for a condition that is not the
 * customer's fault and not a bug.
 *
 * Checking is not the guarantee, though, and it cannot be: two registrations can
 * draw the same number between the read and the write. That race is what the
 * unique index on `account_number` is for, and it stays as the backstop.
 *
 * ── Why a handful of attempts is enough ───────────────────────────────────────
 * A candidate is one draw from nine billion. With `n` accounts on the platform,
 * one attempt fails with probability `n / 9e9` — at ten thousand accounts, about
 * one in a million. {@link ATTEMPTS} of those failing in a row is not a scenario
 * worth planning around; it is a sign that the random source is broken or the
 * repository is lying, and the throw says so rather than looping forever.
 */

const ATTEMPTS = 5;

export async function allocateAccountNumber(users: UserRepository): Promise<AccountNumber> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const candidate = users.nextAccountNumber();
    const taken = await users.findByAccountNumber(candidate);
    if (taken === null) return candidate;
  }

  // Deliberately a throw, not a `Result`. There is nothing the caller — or the
  // person filling in the form — could do differently, which is this codebase's
  // line between a failure that is a value and one that is a bug.
  throw new Error(
    `Could not find a free account number in ${ATTEMPTS} attempts. The random source or the account-number index is not behaving.`,
  );
}
