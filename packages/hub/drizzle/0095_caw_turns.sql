CREATE TABLE `caw_turns` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`thread_id` text,
	`usd` real NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thread_id`) REFERENCES `project_threads`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `caw_turns_project_at` ON `caw_turns` (`project_id`,`at`);--> statement-breakpoint
INSERT INTO `caw_turns` (`id`, `project_id`, `thread_id`, `usd`, `at`) SELECT lower(hex(randomblob(16))), `project_id`, `id`, `spend_usd`, `updated_at` FROM `project_threads` WHERE `spend_usd` > 0;--> statement-breakpoint
ALTER TABLE `project_threads` DROP COLUMN `spend_usd`;