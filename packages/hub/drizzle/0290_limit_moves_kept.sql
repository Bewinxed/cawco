CREATE TABLE `move_endings` (
	`instance_id` text PRIMARY KEY NOT NULL,
	`ended` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `limit_compactions` ADD `carry_uuid` text;--> statement-breakpoint
ALTER TABLE `limit_holds` DROP COLUMN `carry`;