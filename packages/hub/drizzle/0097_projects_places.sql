ALTER TABLE `project_places` ADD `is_primary` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `project_places` SET `is_primary` = 1 WHERE `kind` = 'checkout' AND EXISTS (SELECT 1 FROM `projects` WHERE `projects`.`id` = `project_places`.`project_id` AND `projects`.`machine_id` = `project_places`.`machine_id` AND `projects`.`cwd` = `project_places`.`path`);--> statement-breakpoint
UPDATE `project_places` SET `is_primary` = 1 WHERE `id` IN (SELECT (SELECT `pp`.`id` FROM `project_places` `pp` WHERE `pp`.`project_id` = `p`.`id` AND `pp`.`kind` = 'checkout' ORDER BY `pp`.`created_at`, `pp`.`id` LIMIT 1) FROM `projects` `p` WHERE NOT EXISTS (SELECT 1 FROM `project_places` `x` WHERE `x`.`project_id` = `p`.`id` AND `x`.`is_primary` = 1));--> statement-breakpoint
INSERT INTO `project_places` (`id`, `project_id`, `machine_id`, `path`, `kind`, `is_primary`, `created_at`) SELECT lower(hex(randomblob(16))), `p`.`id`, 'hub', 'projects/' || `p`.`id`, 'hub', 0, `p`.`created_at` FROM `projects` `p` WHERE NOT EXISTS (SELECT 1 FROM `project_places` `x` WHERE `x`.`project_id` = `p`.`id` AND `x`.`kind` = 'hub');--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`remote` text,
	`tracker` text DEFAULT 'cawco' NOT NULL,
	`lead_instance_id` text,
	`caw` integer DEFAULT false NOT NULL,
	`caw_harness` text DEFAULT 'claude' NOT NULL,
	`caw_model` text,
	`lead_cost_seen` real DEFAULT 0 NOT NULL,
	`dispatch` integer DEFAULT false NOT NULL,
	`max_attempts` integer DEFAULT 2 NOT NULL,
	`review_limit` integer DEFAULT 5 NOT NULL,
	`lands` text DEFAULT 'main' NOT NULL,
	`budget` text,
	`cap_usd` real,
	`cap_period` text,
	`on_cap` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_projects`("id", "name", "remote", "tracker", "lead_instance_id", "caw", "caw_harness", "caw_model", "lead_cost_seen", "dispatch", "max_attempts", "review_limit", "lands", "budget", "cap_usd", "cap_period", "on_cap", "created_at") SELECT "id", "name", "remote", "tracker", "lead_instance_id", "caw", "caw_harness", "caw_model", "lead_cost_seen", "dispatch", "max_attempts", "review_limit", "lands", "budget", "cap_usd", "cap_period", "on_cap", "created_at" FROM `projects`;--> statement-breakpoint
DROP TABLE `projects`;--> statement-breakpoint
ALTER TABLE `__new_projects` RENAME TO `projects`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
