CREATE TABLE `attendance` (
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `day`)
);
