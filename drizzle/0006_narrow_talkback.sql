CREATE TABLE `push_deliveries` (
	`stamp_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`next_attempt_at` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`lease_until` text,
	`sent_at` text,
	`last_error` text,
	PRIMARY KEY(`stamp_id`, `subscription_id`)
);
--> statement-breakpoint
CREATE INDEX `push_deliveries_due_idx` ON `push_deliveries` (`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `push_events` (
	`stamp_id` text PRIMARY KEY NOT NULL,
	`board` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`first_enabled` integer DEFAULT 0 NOT NULL,
	`second_enabled` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_test_at` text
);
