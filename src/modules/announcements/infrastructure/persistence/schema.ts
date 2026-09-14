import { index, integer, pgSchema, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Tables owned by the announcements module.
 *
 * Its own Postgres schema, like every other context here. Nothing outside this
 * module reads inside it — the customer surfaces and the console both go through
 * the module's public API, and there is no foreign key to `identity.users` for
 * the author, for the same reason `ledger` has none: a module's tables are its own.
 */
export const announcementsSchema = pgSchema('announcements');

export const announcements = announcementsSchema.table(
  'announcements',
  {
    id: text('id').primaryKey(),

    title: text('title').notNull(),
    body: text('body').notNull(),

    surface: text('surface', { enum: ['banner', 'in-app', 'status'] }).notNull(),
    tone: text('tone', { enum: ['info', 'warning', 'critical'] })
      .notNull()
      .default('info'),

    /** The operator's intent. Visibility is derived — see `Announcement.isLiveAt`. */
    status: text('status', { enum: ['draft', 'scheduled', 'published', 'archived'] })
      .notNull()
      .default('draft'),

    /**
     * When it becomes visible. Null while it is a draft.
     *
     * This is the field that makes scheduling work without a scheduler: a read
     * compares it to the clock, so nothing has to fire at a particular moment.
     */
    publishAt: timestamp('publish_at', { withTimezone: true }),
    /** When it stops. Null means indefinitely. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),

    authorId: text('author_id').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),

    /** Optimistic-concurrency token, matching every other table in this project. */
    version: integer('version').notNull().default(0),
  },
  (table) => [
    /*
     * The surface read, which runs in a layout on every page of the site.
     *
     * Ordered to match the query: narrow to one surface, then to the statuses that
     * can be visible, then walk `publish_at` backwards for the newest few. Without
     * it, every page render sequentially scans every notice ever written.
     */
    index('announcements_surface_idx').on(table.surface, table.status, table.publishAt),
    /* The console's list: newest activity first, across every status. */
    index('announcements_updated_idx').on(table.updatedAt),
  ],
);

export type AnnouncementRow = typeof announcements.$inferSelect;
