ALTER TABLE `project_threads` ADD `spend_usd` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `caw_model` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `lead_cost_seen` real DEFAULT 0 NOT NULL;