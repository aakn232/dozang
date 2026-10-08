CREATE TABLE `praise_stamps` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `praise_stamps_user_created_idx` ON `praise_stamps` (`user_id`,`created_at`);