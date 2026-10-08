CREATE TABLE `fleet_skill_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`skill_source` text NOT NULL,
	`hash` text NOT NULL,
	`bytes` integer NOT NULL,
	`files` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL
);
