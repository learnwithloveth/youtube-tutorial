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
 * ── Both fields are optional, and the app works without either ─────────────────
 * Registration asks for an email and a password. Demanding a name at the door is
 * a field between somebody and the thing they came for, and the email already
 * identifies them — so the whole product renders from the email until the account
 * holder decides otherwise.
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
 * Lowercase, 3–24, letters digits and underscore.
 *
 * Narrow on purpose. A handle appears in URLs and beside other people's, so it has
 * to survive being typed from memory, compared by eye, and pasted into a search
 * box. Allowing mixed case invites two accounts that differ only in capitals;
 * allowing punctuation invites homoglyph lookalikes.
 */
export const HANDLE_PATTERN = /^[a-z0-9_]{3,24}$/;

export interface ProfileSnapshot {
  readonly userId: UserId;
  readonly displayName: string | null;
  /** Stored without the leading `@`, which is punctuation the UI adds. */
  readonly handle: string | null;
  readonly updatedAt: Date;
  readonly version: number;
}

export type ProfileProblem = 'display-name-too-long' | 'handle-invalid';

export class Profile {
  private constructor(private snap: ProfileSnapshot) {}

  /** An account with nothing filled in. Never stored until something is set. */
  static empty(userId: UserId, at: Date): Profile {
    return new Profile({
      userId,
      displayName: null,
      handle: null,
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
  get displayName(): string | null {
    return this.snap.displayName;
  }
  get handle(): string | null {
    return this.snap.handle;
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
    changes: { displayName?: string | undefined; handle?: string | undefined },
    at: Date,
  ): ProfileProblem[] {
    const problems: ProfileProblem[] = [];
    let next = this.snap;

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
  handle?: string | null | undefined;
  email: string;
}): string {
  if (input.displayName) return input.displayName;
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
