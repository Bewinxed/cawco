CREATE TABLE `tree_stops` (
	`instance_id` text PRIMARY KEY NOT NULL,
	`root_id` text NOT NULL,
	`parent_id` text,
	`by` text NOT NULL,
	`asked_at` integer NOT NULL,
	`ended_at` integer
);
--> statement-breakpoint
CREATE INDEX `tree_stops_root` ON `tree_stops` (`root_id`);--> statement-breakpoint
CREATE INDEX `tree_stops_parent` ON `tree_stops` (`parent_id`);--> statement-breakpoint
ALTER TABLE `work_items` ADD `stopping_at` integer;--> statement-breakpoint
ALTER TABLE `work_items` ADD `background` integer DEFAULT false NOT NULL;