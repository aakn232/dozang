CREATE TABLE `backup_runner_status` (
	`id` integer PRIMARY KEY NOT NULL,
	`last_run_at` text NOT NULL,
	`completed` integer NOT NULL,
	`failed` integer NOT NULL
);
