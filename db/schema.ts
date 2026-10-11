import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';
export const attendance = sqliteTable('attendance', {
  userId: text('user_id').notNull(),
  day: text('day').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => [primaryKey({columns:[t.userId,t.day]})]);

export const praiseStamps = sqliteTable('praise_stamps', {
  id: text('id').primaryKey(),
  board: text('board').notNull().default('first'),
  content: text('content').notNull().default(''),
  userId: text('user_id').notNull(),
  day: text('day').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => [index('praise_stamps_user_created_idx').on(t.userId, t.createdAt), index('praise_stamps_board_created_idx').on(t.board, t.createdAt)]);

export const stampArchive = sqliteTable('stamp_archive', {
  id: text('id').primaryKey(),
  board: text('board').notNull(),
  day: text('day').notNull(),
  createdAt: text('created_at').notNull(),
  content: text('content').notNull(),
  deletedAt: text('deleted_at'),
  revision: text('revision').notNull(),
  notionPageId: text('notion_page_id'),
  backedUpRevision: text('backed_up_revision'),
  backedUpAt: text('backed_up_at'),
}, t => [index('stamp_archive_board_idx').on(t.board, t.day)]);

// Tickets are available only through owner tools or the authenticated backup runner.
export const backupJobs = sqliteTable('backup_jobs', {
  id: text('id').primaryKey(),
  revision: text('revision').notNull(),
  ticket: text('ticket').notNull(),
  queuedAt: text('queued_at').notNull(),
  leaseToken: text('lease_token'),
  leaseUntil: text('lease_until'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
});

export const backupRunnerStatus = sqliteTable('backup_runner_status', {
  id: integer('id').primaryKey(),
  lastRunAt: text('last_run_at').notNull(),
  completed: integer('completed').notNull(),
  failed: integer('failed').notNull(),
});
