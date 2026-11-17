ALTER TABLE `instances` ADD `hub_model` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `owed_moves` ADD `carry_on` text;--> statement-breakpoint
ALTER TABLE `owed_moves` ADD `carry_line` text;