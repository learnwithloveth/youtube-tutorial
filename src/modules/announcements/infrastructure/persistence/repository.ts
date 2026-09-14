import 'server-only';

import { and, desc, eq, gt, inArray, isNull, lte, or } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import type { Database } from '@/platform/db/client';
import type { UserId } from '@/shared/kernel/ids';

import { Announcement, type AnnouncementSurface } from '../../domain/announcement';
import type { AnnouncementRepository } from '../../application/ports';
import { announcements, type AnnouncementRow } from './schema';

export class DrizzleAnnouncementRepository implements AnnouncementRepository {
  constructor(private readonly db: Database) {}

  nextId(): string {
    return randomUUID();
  }

  async save(announcement: Announcement): Promise<void> {
    const snapshot = announcement.snapshot();

    const row = {
      id: snapshot.id,
      title: snapshot.title,
      body: snapshot.body,
      surface: snapshot.surface,
      tone: snapshot.tone,
      status: snapshot.status,
      publishAt: snapshot.publishAt,
      expiresAt: snapshot.expiresAt,
      authorId: snapshot.authorId,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
    };

    await this.db
      .insert(announcements)
      .values(row)
      .onConflictDoUpdate({
        target: announcements.id,
        set: {
          title: row.title,
          body: row.body,
          surface: row.surface,
          tone: row.tone,
          status: row.status,
          publishAt: row.publishAt,
          expiresAt: row.expiresAt,
          updatedAt: row.updatedAt,
        },
      });
  }

  async find(id: string): Promise<Announcement | null> {
    const [row] = await this.db
      .select()
      .from(announcements)
      .where(eq(announcements.id, id))
      .limit(1);
    return row === undefined ? null : toDomain(row);
  }

  async listForConsole(limit: number): Promise<Announcement[]> {
    const rows = await this.db
      .select()
      .from(announcements)
      // Archived notices are kept on the record but are not work: an operator
      // opening this screen is looking at what is live or about to be.
      .where(inArray(announcements.status, ['draft', 'scheduled', 'published']))
      .orderBy(desc(announcements.updatedAt))
      .limit(limit);
    return rows.map(toDomain);
  }

  async listLive(
    surface: AnnouncementSurface,
    now: Date,
    limit: number,
  ): Promise<Announcement[]> {
    const rows = await this.db
      .select()
      .from(announcements)
      .where(
        and(
          eq(announcements.surface, surface),
          // `scheduled` is included on purpose. Its moment arriving is what makes
          // it visible, and the comparison below is the only thing that decides.
          inArray(announcements.status, ['published', 'scheduled']),
          lte(announcements.publishAt, now),
          or(isNull(announcements.expiresAt), gt(announcements.expiresAt, now)),
        ),
      )
      // Newest first: when two notices are up, the recent one is the one somebody
      // has not read yet.
      .orderBy(desc(announcements.publishAt))
      .limit(limit);
    return rows.map(toDomain);
  }
}

function toDomain(row: AnnouncementRow): Announcement {
  return Announcement.rehydrate({
    id: row.id,
    title: row.title,
    body: row.body,
    surface: row.surface,
    tone: row.tone,
    status: row.status,
    publishAt: row.publishAt,
    expiresAt: row.expiresAt,
    authorId: row.authorId as UserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
