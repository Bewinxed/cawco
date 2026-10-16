-- The machines a project move names are columns (audit S8): a machine's
-- register reads the moves that name it (a Cancel it missed, a step on it
-- or reading from it) instead of every move's state. The rest of the state
-- stays the job's own JSON, read and written whole.
-- Rebuilt by hand: drizzle-kit 0.31.11 added the NOT NULL machine columns
-- with no default, which a table with rows refuses.
CREATE TABLE `__new_moves` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`stage` text NOT NULL,
	`state` text NOT NULL,
	`source_machine_id` text NOT NULL,
	`target_machine_id` text NOT NULL,
	`stop_on` text,
	`request` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_moves` (`id`, `project_id`, `stage`, `state`, `source_machine_id`, `target_machine_id`, `stop_on`, `request`, `created_at`, `updated_at`)
SELECT `id`, `project_id`, `stage`,
  json_remove(`state`, '$.sourceMachineId', '$.targetMachineId', '$.stopOn'),
  json_extract(`state`, '$.sourceMachineId'), json_extract(`state`, '$.targetMachineId'),
  json_extract(`state`, '$.stopOn'), `request`, `created_at`, `updated_at`
FROM `moves`;
--> statement-breakpoint
DROP TABLE `moves`;--> statement-breakpoint
ALTER TABLE `__new_moves` RENAME TO `moves`;--> statement-breakpoint
CREATE INDEX `moves_machines` ON `moves` (`target_machine_id`,`source_machine_id`);--> statement-breakpoint
CREATE INDEX `moves_stop_on` ON `moves` (`stop_on`);
