ALTER TABLE `rules` ADD `unjudged_turns` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `rules` ADD `last_unjudged_why` text;