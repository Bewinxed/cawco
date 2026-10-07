ALTER TABLE `project_threads` ADD `setup` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `supervisor_config` ADD `choices_set_at` integer;--> statement-breakpoint
ALTER TABLE `thread_messages` ADD `files` text;