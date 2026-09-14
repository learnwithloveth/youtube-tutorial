import type { UserId } from '@/shared/kernel/ids';

/**
 * Something the platform is telling its customers.
 *
 * ── Visibility is derived from the clock, not from a job ──────────────────────
 * There is no scheduler in this system, and a "scheduled" status that needs a cron
 * to promote it is a status that silently stays scheduled the first time the cron
 * does not run — on a maintenance notice, at the moment it mattered.
 *
 * So `publishAt` is the fact and the status is the operator's intent. Anything at
 * or past its `publishAt` is live, worked out on every read. Nothing has to fire at
 * a particular moment for a notice to appear; the moment simply arrives.
 *
 * ── Expiry is part of the same idea ───────────────────────────────────────────
 * A banner nobody remembers to take down is the classic failure of this feature —
 * "scheduled maintenance on 11 September" still across the top of the site in
 * November. `expiresAt` is optional, because an indefinite notice is legitimate,
 * but it is offered at the moment somebody writes one for a dated event.
 */

export type AnnouncementStatus = 'draft' | 'scheduled' | 'published' | 'archived';

/**
 * Where a notice appears.
 *
 * ── The surface *is* the audience ─────────────────────────────────────────────
 * The screen this replaced had a second "Audience" dropdown — Everyone, Verified
 * accounts, Prime tier, EEA customers — beside this one. Two fields that can
 * contradict each other (a site banner addressed to EEA customers, on pages served
 * to anonymous visitors whose residency is unknown) are two sources of truth for
 * one question, and the code would have had to pick a winner. There is one field.
 *
 * `email` is deliberately absent — see `SURFACES` below.
 */
export type AnnouncementSurface = 'banner' | 'in-app' | 'status';

export const SURFACES: readonly {
  readonly id: AnnouncementSurface;
  readonly label: string;
  readonly reach: string;
}[] = [
  { id: 'banner', label: 'Site banner', reach: 'Every visitor, signed in or not' },
  { id: 'in-app', label: 'In-app', reach: 'Signed-in customers only' },
  { id: 'status', label: 'Status page', reach: 'Anyone reading /status' },
];

/*
 * There is no `email` surface, and adding one is not a line in this array.
 *
 * Mailing every customer needs three things this platform does not have: an
 * unsubscribe mechanism (mandatory under CAN-SPAM and the GDPR for anything not
 * strictly transactional), a send queue, and a throttle. Without them, "Publish"
 * on an email announcement is an unbounded synchronous blast from a Server Action
 * that will time out partway through with no record of who was already reached —
 * and no way for anyone to opt out of the next one. The button existed on the old
 * screen and did nothing, which was the only safe thing about it.
 */

/** How loudly it reads. Drives the colour on the customer surface, nothing else. */
export type AnnouncementTone = 'info' | 'warning' | 'critical';

export const MAX_TITLE = 120;
export const MAX_BODY = 1_000;

export interface AnnouncementSnapshot {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly surface: AnnouncementSurface;
  readonly tone: AnnouncementTone;
  readonly status: AnnouncementStatus;
  /** When it becomes visible. Null while it is a draft. */
  readonly publishAt: Date | null;
  /** When it stops being visible. Null means indefinitely. */
  readonly expiresAt: Date | null;
  /** The operator who wrote it — an id, resolved to a person by the console. */
  readonly authorId: UserId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Announcement {
  readonly id: string;
  readonly authorId: UserId;
  readonly createdAt: Date;
  private _title: string;
  private _body: string;
  private _surface: AnnouncementSurface;
  private _tone: AnnouncementTone;
  private _status: AnnouncementStatus;
  private _publishAt: Date | null;
  private _expiresAt: Date | null;
  private _updatedAt: Date;

  private constructor(snapshot: AnnouncementSnapshot) {
    this.id = snapshot.id;
    this.authorId = snapshot.authorId;
    this.createdAt = snapshot.createdAt;
    this._title = snapshot.title;
    this._body = snapshot.body;
    this._surface = snapshot.surface;
    this._tone = snapshot.tone;
    this._status = snapshot.status;
    this._publishAt = snapshot.publishAt;
    this._expiresAt = snapshot.expiresAt;
    this._updatedAt = snapshot.updatedAt;
  }

  static draft(input: {
    id: string;
    title: string;
    body: string;
    surface: AnnouncementSurface;
    tone: AnnouncementTone;
    authorId: UserId;
    expiresAt?: Date | null;
    now: Date;
  }): Announcement {
    const title = input.title.trim();
    const body = input.body.trim();

    if (title.length === 0 || title.length > MAX_TITLE) {
      throw new RangeError('An announcement needs a title.');
    }
    if (body.length === 0 || body.length > MAX_BODY) {
      throw new RangeError('An announcement needs a body.');
    }
    if (input.expiresAt != null && input.expiresAt.getTime() <= input.now.getTime()) {
      throw new RangeError('An announcement cannot expire in the past.');
    }

    return new Announcement({
      id: input.id,
      title,
      body,
      surface: input.surface,
      tone: input.tone,
      status: 'draft',
      publishAt: null,
      expiresAt: input.expiresAt ?? null,
      authorId: input.authorId,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  static rehydrate(snapshot: AnnouncementSnapshot): Announcement {
    return new Announcement(snapshot);
  }

  get status(): AnnouncementStatus {
    return this._status;
  }

  get surface(): AnnouncementSurface {
    return this._surface;
  }

  /** Live now, by the clock. The whole scheduling mechanism is this method. */
  isLiveAt(now: Date): boolean {
    if (this._status !== 'published' && this._status !== 'scheduled') return false;
    if (this._publishAt === null || this._publishAt.getTime() > now.getTime()) return false;
    return this._expiresAt === null || this._expiresAt.getTime() > now.getTime();
  }

  /** Visible immediately. */
  publish(now: Date): void {
    this.assertNotArchived();
    this._status = 'published';
    this._publishAt = now;
    this._touch(now);
  }

  /**
   * Visible from a future moment.
   *
   * A time in the past is refused rather than quietly treated as "now": somebody
   * who mistypes a date should not discover it by finding the notice already on the
   * site. Publishing immediately is a different button, one click away.
   */
  schedule(at: Date, now: Date): void {
    this.assertNotArchived();
    if (at.getTime() <= now.getTime()) {
      throw new RangeError('A scheduled time must be in the future.');
    }
    if (this._expiresAt !== null && this._expiresAt.getTime() <= at.getTime()) {
      throw new RangeError('An announcement cannot expire before it appears.');
    }
    this._status = 'scheduled';
    this._publishAt = at;
    this._touch(now);
  }

  /**
   * Off the customer surface, back to a draft.
   *
   * `publishAt` is cleared with it. Leaving it set would make an unpublished notice
   * indistinguishable from a scheduled one on the next read, and `isLiveAt` would
   * put it straight back up.
   */
  unpublish(now: Date): void {
    this.assertNotArchived();
    this._status = 'draft';
    this._publishAt = null;
    this._touch(now);
  }

  /** Out of the working list, kept on the record. Announcements are never deleted. */
  archive(now: Date): void {
    this._status = 'archived';
    this._touch(now);
  }

  edit(input: {
    title?: string;
    body?: string;
    surface?: AnnouncementSurface;
    tone?: AnnouncementTone;
    expiresAt?: Date | null;
    now: Date;
  }): void {
    this.assertNotArchived();

    if (input.title !== undefined) {
      const title = input.title.trim();
      if (title.length === 0 || title.length > MAX_TITLE) {
        throw new RangeError('An announcement needs a title.');
      }
      this._title = title;
    }

    if (input.body !== undefined) {
      const body = input.body.trim();
      if (body.length === 0 || body.length > MAX_BODY) {
        throw new RangeError('An announcement needs a body.');
      }
      this._body = body;
    }

    if (input.surface !== undefined) this._surface = input.surface;
    if (input.tone !== undefined) this._tone = input.tone;
    if (input.expiresAt !== undefined) {
      if (input.expiresAt !== null && input.expiresAt.getTime() <= input.now.getTime()) {
        throw new RangeError('An announcement cannot expire in the past.');
      }
      this._expiresAt = input.expiresAt;
    }

    this._touch(input.now);
  }

  private assertNotArchived(): void {
    if (this._status === 'archived') {
      throw new Error('This announcement is archived.');
    }
  }

  private _touch(now: Date): void {
    this._updatedAt = now;
  }

  snapshot(): AnnouncementSnapshot {
    return {
      id: this.id,
      title: this._title,
      body: this._body,
      surface: this._surface,
      tone: this._tone,
      status: this._status,
      publishAt: this._publishAt,
      expiresAt: this._expiresAt,
      authorId: this.authorId,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    };
  }
}
