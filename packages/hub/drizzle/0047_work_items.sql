CREATE TABLE `work_items` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`parent_instance_id` text NOT NULL,
	`instance_id` text NOT NULL,
	`brief` text NOT NULL,
	`title` text NOT NULL,
	`type` text,
	`harness` text NOT NULL,
	`model` text,
	`effort` text,
	`state` text DEFAULT 'starting' NOT NULL,
	`result` text,
	`error` text,
	`created_at` integer NOT NULL,
	`ended_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `work_items_workspace` ON `work_items` (`workspace_id`,`state`);--> statement-breakpoint
CREATE INDEX `work_items_parent` ON `work_items` (`parent_instance_id`,`state`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`machine_id` text NOT NULL,
	`repo_root` text NOT NULL,
	`path` text NOT NULL,
	`branch` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`ports` text DEFAULT '[]' NOT NULL,
	`scratch_paths` text DEFAULT '[]' NOT NULL,
	`created_by_instance_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `instances` ADD `work_item_id` text;