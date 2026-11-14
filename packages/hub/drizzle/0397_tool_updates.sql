CREATE TABLE `tool_update_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`updates` text DEFAULT 'update' NOT NULL
);
--> statement-breakpoint
ALTER TABLE `agent_tools` ADD `copy` text;--> statement-breakpoint
ALTER TABLE `agent_tools` ADD `wants` text;--> statement-breakpoint
ALTER TABLE `agent_tools` ADD `tried_at` integer;--> statement-breakpoint
ALTER TABLE `agent_tools` ADD `going_to` text;