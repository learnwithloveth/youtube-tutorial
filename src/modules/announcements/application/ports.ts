import type { Clock } from '@/shared/kernel';

import type { Announcement, AnnouncementSurface } from '../domain/announcement';

/**
 * Ports for the announcements module.
 */

export interface AnnouncementRepository {
  nextId(): string;
  save(announcement: Announcement): Promise<void>;
  find(id: string): Promise<Announcement | null>;
  /** Everything an operator works with: drafts, scheduled and published. */
  listForConsole(limit: number): Promise<Announcement[]>;

  /**
   * Candidates for one customer surface.
   *
   * The date window is applied in SQL — the alternative is reading every notice
   * ever written on every page render — but the *decision* stays in
   * `Announcement.isLiveAt`, which the query re-applies. Two places agreeing is
   * the point: the index keeps the read cheap, and the aggregate remains the only
   * thing that says what "live" means.
   */
  listLive(surface: AnnouncementSurface, now: Date, limit: number): Promise<Announcement[]>;
}

export interface AnnouncementDependencies {
  announcements: AnnouncementRepository;
  clock: Clock;
}
