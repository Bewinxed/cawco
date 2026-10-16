CREATE TABLE `design_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text NOT NULL,
	`item_id` text NOT NULL,
	`tree_sha` text NOT NULL,
	`head_sha` text NOT NULL,
	`verifier_item_id` text,
	`state` text NOT NULL,
	`submission` text,
	`findings` text,
	`pick` text,
	`created_at` integer NOT NULL,
	`ended_at` integer
);
--> statement-breakpoint
CREATE INDEX `design_checks_item` ON `design_checks` (`item_id`);--> statement-breakpoint
CREATE TABLE `design_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`instance_id` text NOT NULL,
	`machine_id` text,
	`root` text,
	`why` text NOT NULL,
	`files` text NOT NULL,
	`preview` text NOT NULL,
	`tool_use_id` text,
	`created_at` integer NOT NULL
);
