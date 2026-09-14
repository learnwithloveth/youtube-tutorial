import 'server-only';

import type { Database } from '@/platform/db/client';
import { systemClock, type Clock } from '@/shared/kernel/clock';

import type { AnnouncementDependencies } from './application/ports';
import {
  createComposeAnnouncement,
  createMoveAnnouncement,
  type ComposeAnnouncement,
  type MoveAnnouncement,
} from './application/use-cases/manage-announcement';
import { DrizzleAnnouncementRepository } from './infrastructure/persistence/repository';

/**
 * Announcements module registration.
 *
 * The one file that knows both the ports and the adapters. To run this elsewhere
 * you keep `domain/` and `application/`, call `registerAnnouncements` from that
 * service, and replace this app's copy with a client implementing the same public
 * API — nothing in `src/app/**` or any other module changes.
 */

export interface AnnouncementsModule {
  readonly compose: ComposeAnnouncement;
  readonly move: MoveAnnouncement;
  /**
   * The wiring, for reads that take the bag rather than being closed over it.
   * Same arrangement `ledger` and `identity` use: a query has no invariant to
   * protect, so it is a function of the ports rather than a method on the module.
   */
  readonly dependencies: AnnouncementDependencies;
}

export interface RegisterAnnouncementsOptions {
  db: Database;
  clock?: Clock;
}

export function registerAnnouncements(
  options: RegisterAnnouncementsOptions,
): AnnouncementsModule {
  const dependencies: AnnouncementDependencies = {
    announcements: new DrizzleAnnouncementRepository(options.db),
    clock: options.clock ?? systemClock,
  };

  return {
    compose: createComposeAnnouncement(dependencies),
    move: createMoveAnnouncement(dependencies),
    dependencies,
  };
}
