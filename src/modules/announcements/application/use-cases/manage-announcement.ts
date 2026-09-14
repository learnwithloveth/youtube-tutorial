import { err, ok, type Result } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import {
  Announcement,
  MAX_BODY,
  SURFACES,
  type AnnouncementSurface,
  type AnnouncementTone,
} from '../../domain/announcement';
import { AnnouncementErrors, type AnnouncementError } from '../errors';
import type { AnnouncementDependencies } from '../ports';

/**
 * Writing and moving an announcement.
 *
 * ── One use case, four verbs ──────────────────────────────────────────────────
 * Compose, publish, schedule, unpublish and archive are five ways of saying "this
 * notice has moved", and each is two lines around the same aggregate. Splitting
 * them into five files would put the *sequence* — draft, schedule, publish, retire
 * — in five places and make the one rule that spans them (an archived notice does
 * not move) five rules.
 *
 * ── The aggregate is the validator ────────────────────────────────────────────
 * Every check below is a `try`/`catch` around a domain method rather than a
 * re-implementation of its rules. The mapping from a thrown `RangeError` to a
 * `DomainError` happens once, here, so the aggregate stays the only place that
 * decides what a valid announcement is.
 */

export interface ComposeAnnouncementCommand {
  readonly title: string;
  readonly body: string;
  readonly surface: string;
  readonly tone: AnnouncementTone;
  readonly authorId: UserId;
  readonly expiresAt?: Date | null;
  /** Publish straight away instead of leaving it a draft. */
  readonly publishNow?: boolean;
  /** Schedule it for later instead of leaving it a draft. */
  readonly publishAt?: Date | null;
}

export type MoveAction = 'publish' | 'unpublish' | 'archive' | 'schedule';

export interface MoveAnnouncementCommand {
  readonly id: string;
  readonly action: MoveAction;
  /** Required for `schedule`. */
  readonly publishAt?: Date | null;
}

export type ComposeAnnouncement = (
  command: ComposeAnnouncementCommand,
) => Promise<Result<{ id: string }, AnnouncementError>>;

export type MoveAnnouncement = (
  command: MoveAnnouncementCommand,
) => Promise<Result<{ id: string; status: string }, AnnouncementError>>;

const SURFACE_IDS: readonly string[] = SURFACES.map((surface) => surface.id);

export function createComposeAnnouncement(
  deps: AnnouncementDependencies,
): ComposeAnnouncement {
  return async function composeAnnouncement(command) {
    const now = deps.clock.now();

    if (command.title.trim().length === 0) return err(AnnouncementErrors.titleRequired());
    if (command.body.trim().length === 0 || command.body.trim().length > MAX_BODY) {
      return err(AnnouncementErrors.bodyRequired(MAX_BODY));
    }
    if (!SURFACE_IDS.includes(command.surface)) return err(AnnouncementErrors.surfaceInvalid());

    let announcement: Announcement;
    try {
      announcement = Announcement.draft({
        id: deps.announcements.nextId(),
        title: command.title,
        body: command.body,
        surface: command.surface as AnnouncementSurface,
        tone: command.tone,
        authorId: command.authorId,
        expiresAt: command.expiresAt ?? null,
        now,
      });
    } catch {
      return err(AnnouncementErrors.expiryInPast());
    }

    if (command.publishNow === true) {
      announcement.publish(now);
    } else if (command.publishAt != null) {
      try {
        announcement.schedule(command.publishAt, now);
      } catch {
        return err(
          command.publishAt.getTime() <= now.getTime()
            ? AnnouncementErrors.scheduleInPast()
            : AnnouncementErrors.expiryBeforePublication(),
        );
      }
    }

    await deps.announcements.save(announcement);
    return ok({ id: announcement.id });
  };
}

export function createMoveAnnouncement(deps: AnnouncementDependencies): MoveAnnouncement {
  return async function moveAnnouncement(command) {
    const announcement = await deps.announcements.find(command.id);
    if (announcement === null) return err(AnnouncementErrors.notFound());
    if (announcement.status === 'archived') return err(AnnouncementErrors.archived());

    const now = deps.clock.now();

    switch (command.action) {
      case 'publish':
        announcement.publish(now);
        break;
      case 'unpublish':
        announcement.unpublish(now);
        break;
      case 'archive':
        announcement.archive(now);
        break;
      case 'schedule': {
        if (command.publishAt == null) return err(AnnouncementErrors.scheduleInPast());
        try {
          announcement.schedule(command.publishAt, now);
        } catch {
          return err(
            command.publishAt.getTime() <= now.getTime()
              ? AnnouncementErrors.scheduleInPast()
              : AnnouncementErrors.expiryBeforePublication(),
          );
        }
        break;
      }
    }

    await deps.announcements.save(announcement);
    return ok({ id: announcement.id, status: announcement.status });
  };
}
