CREATE TABLE `backup_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` text NOT NULL,
	`ticket` text NOT NULL,
	`queued_at` text NOT NULL,
	`lease_token` text,
	`lease_until` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `stamp_archive` (
	`id` text PRIMARY KEY NOT NULL,
	`board` text NOT NULL,
	`day` text NOT NULL,
	`created_at` text NOT NULL,
	`content` text NOT NULL,
	`deleted_at` text,
	`revision` text NOT NULL,
	`notion_page_id` text,
	`backed_up_revision` text,
	`backed_up_at` text
);
--> statement-breakpoint
CREATE INDEX `stamp_archive_board_idx` ON `stamp_archive` (`board`,`day`);