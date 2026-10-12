CREATE TABLE `notification_cleared` (
	`collapse_id` text PRIMARY KEY NOT NULL,
	`cleared_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notification_cleared_at` ON `notification_cleared` (`cleared_at`);--> statement-breakpoint
CREATE TABLE `notification_sent` (
	`collapse_id` text PRIMARY KEY NOT NULL,
	`sent_at` integer NOT NULL
);
