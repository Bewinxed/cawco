CREATE TABLE `project_places` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`machine_id` text NOT NULL,
	`path` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_places_where` ON `project_places` (`project_id`,`machine_id`,`path`);--> statement-breakpoint
CREATE INDEX `project_places_machine` ON `project_places` (`machine_id`,`path`);--> statement-breakpoint
ALTER TABLE `projects` ADD `remote` text;--> statement-breakpoint
-- Every project so far is one folder on one machine: that folder is its first
-- place, a checkout, and stays its primary (projects.machine_id / cwd).
INSERT INTO `project_places` (`id`, `project_id`, `machine_id`, `path`, `kind`, `created_at`)
SELECT
	lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
	`id`, `machine_id`, `cwd`, 'checkout', `created_at`
FROM `projects`;--> statement-breakpoint
-- A workspace still active, cut by a session of a project, is a place of that
-- project until it is archived.
INSERT OR IGNORE INTO `project_places` (`id`, `project_id`, `machine_id`, `path`, `kind`, `created_at`)
SELECT
	lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
	`instances`.`project_id`, `workspaces`.`machine_id`, `workspaces`.`path`, 'workspace', `workspaces`.`created_at`
FROM `workspaces`
JOIN `instances` ON `instances`.`id` = `workspaces`.`created_by_instance_id`
JOIN `projects` ON `projects`.`id` = `instances`.`project_id`
WHERE `workspaces`.`state` = 'active';
