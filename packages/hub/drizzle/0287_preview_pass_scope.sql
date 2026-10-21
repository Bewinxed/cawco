ALTER TABLE `preview_passes` ADD `instance_id` text REFERENCES instances(id) ON UPDATE no action ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `preview_passes` ADD `scope` text;--> statement-breakpoint
CREATE INDEX `preview_passes_instance_id_idx` ON `preview_passes` (`instance_id`);
