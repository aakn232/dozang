ALTER TABLE `praise_stamps` ADD `board` text DEFAULT 'first' NOT NULL;--> statement-breakpoint
CREATE INDEX `praise_stamps_board_created_idx` ON `praise_stamps` (`board`,`created_at`);