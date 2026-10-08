import { sqliteTable, text, primaryKey, index } from 'drizzle-orm/sqlite-core';
export const attendance = sqliteTable('attendance', {
  userId: text('user_id').notNull(),
  day: text('day').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => [primaryKey({columns:[t.userId,t.day]})]);

export const praiseStamps = sqliteTable('praise_stamps', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  day: text('day').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => [index('praise_stamps_user_created_idx').on(t.userId, t.createdAt)]);
