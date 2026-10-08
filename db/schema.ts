import { sqliteTable, text, primaryKey } from 'drizzle-orm/sqlite-core';
export const attendance = sqliteTable('attendance', {
  userId: text('user_id').notNull(),
  day: text('day').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => [primaryKey({columns:[t.userId,t.day]})]);
