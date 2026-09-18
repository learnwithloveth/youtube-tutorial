import type { UserId } from '@/shared/kernel/ids';

/**
 * How an account holder appears.
 *
 * ── Separate from `User`, which is the credential ──────────────────────────────
 * `User` holds the email, the password hash, the lockout counter and the role —
 * everything an authentication decision needs, and nothing else. A display name is
 * not part of that decision, changes far more often, and is read on every page
 * render by code that has no business near a password hash.
 *
 * ── Every field is optional here, whatever the form asks for ──────────────────
 * Sign-up now asks for a first and last name, and that is a decision the *form*
 * makes: it can refuse to submit without them. This context still stores them as
 * optional, because accounts arrive by other doors — signing in with Google, which
 * carries no name we have asked for — and because every account registered before
 * the field existed has none. Code that renders a name therefore falls back, and
 * `displayNameFor` is the one place that decides how.
 *
 * ── What this deliberately does not carry ──────────────────────────────────────
 * A base currency and a time zone were on the settings form. Neither is here,
 * because neither would do anything: there are no FX rates in this application, so
 * a currency preference would change a label and not a number, and every timestamp
 * is rendered in UTC on purpose — see `_console/data/format`. A setting that
 * changes nothing is worse than an absent one, because somebody will rely on it.
 */

export const MAX_DISPLAY_NAME = 80;

/**
 * The longest a first or last name may be.
 *
 * Shorter than a display name, which can be anything somebody wants to be called.
 * These two are what a person is called: long enough for the longest names people
 * actually have, and short enough that a pasted paragraph is refused rather than
 * stored and truncated in every table it appears in.
 */
export const MAX_PERSON_NAME = 60;

/**
 * Lowercase, 3–24, letters digits and underscore.
 *
 * Narrow on purpose. A handle appears in URLs and beside other people's, so it has
 * to survive being typed from memory, compared by eye, and pasted into a search
 * box. Allowing mixed case invites two accounts that differ only in capitals;
 * allowing punctuation invites homoglyph lookalikes.
 */
export const HANDLE_PATTERN = /^[a-z0-9_]{3,24}$/;

/**
 * A number in E.164: `+`, country code, national number, 15 digits at the most.
 *
 * Only the international form is accepted, because a bare `079 123 4567` cannot be
 * dialled or checked without knowing which country it belongs to — and the one
 * thing this context must not do is *assume* which. The sign-up form fills the
 * dialling code in from where the request came from, so the common path is already
 * international by the time somebody types a digit.
 */
export const PHONE_PATTERN = /^\+[1-9]\d{6,14}$/;

/** Space, brackets, dashes and dots are how people write numbers, not part of one. */
export function normalisePhone(raw: string): string {
  return raw.replace(/[\s()\-.]/g, '');
}

export interface ProfileSnapshot {
  readonly userId: UserId;
  /**
   * The account holder's name, as they gave it at sign-up.
   *
   * Kept in two fields rather than one, because the two are addressed differently:
   * a greeting uses the first alone, and a name on a document is both in order.
   * Splitting one stored string back into them is guesswork the moment anybody has
   * two given names or a compound surname.
   */
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly displayName: string | null;
  /** Stored without the leading `@`, which is punctuation the UI adds. */
  readonly handle: string | null;
  /**
   * Where the account holder says they live. ISO-3166-1 alpha-2, upper case.
   *
   * What they *told us*, which is not the same claim as the country a request
   * appeared to come from. The sign-up form offers the second as a default for the
   * first, and the value stored here is whatever was submitted.
   */
  readonly country: string | null;
  /** E.164, or null. */
  readonly phone: string | null;
  readonly updatedAt: Date;
  readonly version: number;
}

export type ProfileProblem =
  | 'name-too-long'
  | 'display-name-too-long'
  | 'handle-invalid'
  | 'country-invalid'
  | 'phone-invalid';

export class Profile {
  private constructor(private snap: ProfileSnapshot) {}

  /** An account with nothing filled in. Never stored until something is set. */
  static empty(userId: UserId, at: Date): Profile {
    return new Profile({
      userId,
      firstName: null,
      lastName: null,
      displayName: null,
      handle: null,
      country: null,
      phone: null,
      updatedAt: at,
      version: 0,
    });
  }

  static rehydrate(snapshot: ProfileSnapshot): Profile {
    return new Profile(snapshot);
  }

  get userId(): UserId {
    return this.snap.userId;
  }
  get firstName(): string | null {
    return this.snap.firstName;
  }
  get lastName(): string | null {
    return this.snap.lastName;
  }
  get displayName(): string | null {
    return this.snap.displayName;
  }
  get handle(): string | null {
    return this.snap.handle;
  }
  get country(): string | null {
    return this.snap.country;
  }
  get phone(): string | null {
    return this.snap.phone;
  }
  get version(): number {
    return this.snap.version;
  }

  /**
   * Applies a change, or says why it cannot.
   *
   * Returns the problems rather than throwing: every one of these is something the
   * person typing can fix, which is the definition of an expected failure in this
   * codebase.
   *
   * An empty string clears the field. That is a deliberate distinction from
   * `undefined`, which means "leave it alone" — a form that submits only the fields
   * it rendered must not wipe the ones it did not.
   */
  update(
    changes: {
      firstName?: string | undefined;
      lastName?: string | undefined;
      displayName?: string | undefined;
      handle?: string | undefined;
      country?: string | undefined;
      phone?: string | undefined;
    },
    at: Date,
  ): ProfileProblem[] {
    const problems: ProfileProblem[] = [];
    let next = this.snap;

    // Both halves of a name, by the same rule and with the same message: what a
    // person typing can do about either is identical.
    for (const part of ['firstName', 'lastName'] as const) {
      const given = changes[part];
      if (given === undefined) continue;

      const name = given.replace(/\s+/g, ' ').trim();
      if (name.length > MAX_PERSON_NAME) problems.push('name-too-long');
      else next = { ...next, [part]: name.length === 0 ? null : name };
    }

    if (changes.displayName !== undefined) {
      // Collapsed, not just trimmed: a name pasted out of a document arrives with
      // newlines and runs of spaces, and it is rendered inline everywhere.
      const name = changes.displayName.replace(/\s+/g, ' ').trim();
      if (name.length > MAX_DISPLAY_NAME) {
        problems.push('display-name-too-long');
      } else {
        next = { ...next, displayName: name.length === 0 ? null : name };
      }
    }

    if (changes.handle !== undefined) {
      // The `@` is punctuation the interface draws, so it is accepted and stripped
      // rather than refused — nobody should have to learn that it is not part of
      // the value.
      const handle = changes.handle.trim().replace(/^@/, '').toLowerCase();
      if (handle.length === 0) {
        next = { ...next, handle: null };
      } else if (!HANDLE_PATTERN.test(handle)) {
        problems.push('handle-invalid');
      } else {
        next = { ...next, handle };
      }
    }

    if (changes.country !== undefined) {
      const country = changes.country.trim().toUpperCase();
      if (country.length === 0) {
        next = { ...next, country: null };
      } else if (!/^[A-Z]{2}$/.test(country)) {
        // Shape only, as `IdentityVerification` does: whether a code is one of the
        // 249 in the list is reference data, and it is checked at the edge where
        // that list already lives.
        problems.push('country-invalid');
      } else {
        next = { ...next, country };
      }
    }

    if (changes.phone !== undefined) {
      const phone = normalisePhone(changes.phone);
      if (phone.length === 0) {
        next = { ...next, phone: null };
      } else if (!PHONE_PATTERN.test(phone)) {
        problems.push('phone-invalid');
      } else {
        next = { ...next, phone };
      }
    }

    if (problems.length === 0) this.snap = { ...next, updatedAt: at };
    return problems;
  }

  snapshot(): ProfileSnapshot {
    return this.snap;
  }
}

/**
 * What to call this account, given whatever is known about it.
 *
 * ── The email local part, never "Unknown" ──────────────────────────────────────
 * Every account has an email; most will never set a name. Falling back to the part
 * before the `@` gives a real, recognisable label with nothing to fill in, and it
 * is what the person would have typed anyway.
 *
 * Exported because four surfaces need the same answer — the top bar, the sidebar,
 * the support console and the operator's account page — and a display name that
 * differed between them would read as a bug.
 */
export function displayNameFor(input: {
  displayName?: string | null | undefined;
  firstName?: string | null | undefined;
  lastName?: string | null | undefined;
  handle?: string | null | undefined;
  email: string;
}): string {
  // A chosen display name first: somebody who set one has said what they want to
  // be called, and it outranks the name they registered under.
  if (input.displayName) return input.displayName;

  const name = [input.firstName, input.lastName].filter(Boolean).join(' ');
  if (name.length > 0) return name;

  if (input.handle) return `@${input.handle}`;

  const local = input.email.split('@')[0] ?? input.email;
  return local.length > 0 ? local : input.email;
}

/**
 * Two letters for an avatar.
 *
 * Initials of a two-word name, otherwise the first two characters of whatever
 * `displayNameFor` produced. Upper-cased because they are set at a size where
 * lowercase letters read as a typo.
 */
export function initialsFor(name: string): string {
  const words = name.replace(/^@/, '').split(/[\s._-]+/).filter(Boolean);

  if (words.length >= 2) {
    return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase();
  }
  return (words[0] ?? name).slice(0, 2).toUpperCase();
}
