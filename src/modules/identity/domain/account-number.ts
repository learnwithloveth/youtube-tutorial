/**
 * AccountNumber — the ten digits an account holder can read out.
 *
 * Pure domain. No framework, no I/O.
 *
 * ── Why an account needs a second identifier at all ───────────────────────────
 * It already has one: `UserId`, a UUID. That is the right key for a database and
 * the wrong one for a person. Nobody reads a UUID down a phone line, types one
 * into a support chat, or matches one against a name on a list, and every surface
 * that asked somebody to do so got a transposed character back.
 *
 * So this is the identifier meant for humans: ten digits, stable for the life of
 * the account, shown on the dashboard and accepted anywhere an operator has to
 * find one account among many. It identifies; it does not authenticate. Knowing
 * somebody's account number lets you name their account and nothing else, exactly
 * as knowing a bank account number does.
 *
 * ── Why random, and not a counter ─────────────────────────────────────────────
 * A sequence would be unique for free and would also publish, on every dashboard,
 * how many accounts the platform has and in what order they signed up. It makes
 * neighbouring numbers guessable too, and a typo in the last digit of a
 * sequential number lands on a real account — which matters when the number is
 * what an operator types to decide who receives funds.
 *
 * Drawn from the whole ten-digit space instead, the odds that a mistyped digit
 * hits an existing account are the count of accounts over nine billion. The cost
 * is that uniqueness is no longer free: it is the unique index on the column, with
 * `allocateAccountNumber` checking first so the index is a backstop rather than
 * the usual path.
 */

import { err, ok, type Result } from '@/shared/kernel/result';

export type AccountNumberParseError =
  | { _tag: 'AccountNumberMalformed'; input: string }
  | { _tag: 'AccountNumberWrongLength'; length: number };

export const ACCOUNT_NUMBER_LENGTH = 10;

/**
 * The first digit is never zero.
 *
 * Not decoration: a number with a leading zero survives a round trip through a
 * spreadsheet, a CSV or anything else that decides a column of digits is numeric
 * as nine digits, and `0123456789` and `123456789` are then the same account
 * written two ways. Excluding the zero makes the stored form the only form.
 */
const PATTERN = /^[1-9][0-9]{9}$/;

export class AccountNumber {
  private constructor(readonly value: string) {
    Object.freeze(this);
  }

  /**
   * Accepts what a person would type.
   *
   * Spaces and dashes are stripped before checking, because the number is
   * *displayed* grouped — see {@link formatAccountNumber} — and somebody copying
   * it off their dashboard will paste the grouping along with it. Refusing that
   * would be refusing our own formatting back.
   */
  static parse(input: string): Result<AccountNumber, AccountNumberParseError> {
    const digits = input.replace(/[\s-]/g, '');

    if (digits.length !== ACCOUNT_NUMBER_LENGTH) {
      return err({ _tag: 'AccountNumberWrongLength', length: digits.length });
    }
    if (!PATTERN.test(digits)) {
      return err({ _tag: 'AccountNumberMalformed', input });
    }
    return ok(new AccountNumber(digits));
  }

  static parseOrThrow(input: string): AccountNumber {
    const result = AccountNumber.parse(input);
    if (!result.ok) throw new TypeError(`Invalid account number: "${input}"`);
    return result.value;
  }

  /**
   * One candidate, drawn from a caller-supplied source of randomness.
   *
   * The source is a parameter rather than a call to `crypto` so this file stays
   * pure and its tests stay deterministic — the same reason `Clock` is injected
   * rather than read from `Date.now`. `nextFraction` must behave like
   * `Math.random`: a number in `[0, 1)`.
   *
   * It is a *candidate*, not an allocation. Nothing here can know whether the
   * number is already taken; that is `allocateAccountNumber`'s job, and the unique
   * index's after it.
   */
  static candidate(nextFraction: () => number): AccountNumber {
    const span = 9 * 10 ** (ACCOUNT_NUMBER_LENGTH - 1);
    const lowest = 10 ** (ACCOUNT_NUMBER_LENGTH - 1);
    const drawn = Math.floor(nextFraction() * span);

    // Clamped rather than trusted: a source that returns exactly 1 — or anything
    // outside the contract — would otherwise produce an eleven-digit number that
    // `parse` refuses, turning a bad random source into a registration outage.
    //
    // The `Number.isFinite` guard is not belt and braces. `Math.max(NaN, 0)` is
    // NaN, not 0, so a clamp written the obvious way passes NaN straight through
    // and the account number becomes the string "NaN". That is exactly what this
    // file's test found.
    const bounded = Number.isFinite(drawn) ? Math.min(Math.max(drawn, 0), span - 1) : 0;

    return new AccountNumber(String(lowest + bounded));
  }

  equals(other: AccountNumber): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

/**
 * Grouped for reading, never for storing.
 *
 * Ten digits in a row is a string people lose their place in halfway through, and
 * this one is read aloud — in a workshop, to an operator, over a support chat. The
 * groups are display only: `AccountNumber.parse` strips them again, so a number
 * copied from the screen with its spaces still works wherever one is typed.
 */
export function formatAccountNumber(value: string): string {
  const digits = value.replace(/[\s-]/g, '');
  if (digits.length !== ACCOUNT_NUMBER_LENGTH) return value;

  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
}
