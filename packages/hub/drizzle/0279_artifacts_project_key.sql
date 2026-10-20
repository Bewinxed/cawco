PRAGMA foreign_keys=OFF;--> statement-breakpoint
-- A project's pages go with it (db/index.ts deleteProject); before that rule a
-- deleted project's pages stayed, naming a project no longer there, and a hub
-- that served one on its project's origin kept a port for no project and died
-- at start (nightly 4627, 2026-10-20). They go now, with their logs, keys,
-- panels and held next versions; anything else naming a missing project
-- stays with no project. Then the key holds it.
CREATE TEMP TABLE `gone_pages` AS SELECT `id` FROM `artifacts` WHERE `kind` = 'page' AND `project_id` IS NOT NULL AND `project_id` NOT IN (SELECT `id` FROM `projects`);--> statement-breakpoint
INSERT INTO `gone_pages` SELECT `id` FROM `artifacts` WHERE `held_for` IN (SELECT `id` FROM `gone_pages`) AND `id` NOT IN (SELECT `id` FROM `gone_pages`);--> statement-breakpoint
DELETE FROM `artifact_updates` WHERE `artifact_id` IN (SELECT `id` FROM `gone_pages`);--> statement-breakpoint
DELETE FROM `artifact_changes` WHERE `artifact_id` IN (SELECT `id` FROM `gone_pages`);--> statement-breakpoint
DELETE FROM `shown_previews` WHERE `artifact_id` IN (SELECT `id` FROM `gone_pages`);--> statement-breakpoint
DELETE FROM `artifacts` WHERE `id` IN (SELECT `id` FROM `gone_pages`);--> statement-breakpoint
DROP TABLE `gone_pages`;--> statement-breakpoint
UPDATE `artifacts` SET `project_id` = NULL WHERE `project_id` IS NOT NULL AND `project_id` NOT IN (SELECT `id` FROM `projects`);--> statement-breakpoint
CREATE TABLE `__new_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text,
	`made_by` text,
	`held_for` text,
	`project_id` text,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`does` text DEFAULT 'judge' NOT NULL,
	`ask` text DEFAULT '' NOT NULL,
	`machine_id` text,
	`source_page` text,
	`source_dir` text,
	`source_port` integer,
	`source_path` text,
	`source_workspace` text,
	`source_place` text,
	`source_stage_dir` text,
	`source_stage_file` text,
	`source_serve_command` text,
	`source_serve_cwd` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`seq` integer DEFAULT 0 NOT NULL,
	`delivered_seq` integer DEFAULT 0 NOT NULL,
	`read_seq` integer DEFAULT 0 NOT NULL,
	`opened_revision` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`shown_at` integer,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`made_by`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`held_for`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_workspace`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_artifacts`("id", "instance_id", "made_by", "held_for", "project_id", "kind", "name", "does", "ask", "machine_id", "source_page", "source_dir", "source_port", "source_path", "source_workspace", "source_place", "source_stage_dir", "source_stage_file", "source_serve_command", "source_serve_cwd", "revision", "seq", "delivered_seq", "read_seq", "opened_revision", "created_at", "updated_at", "shown_at") SELECT "id", "instance_id", "made_by", "held_for", "project_id", "kind", "name", "does", "ask", "machine_id", "source_page", "source_dir", "source_port", "source_path", "source_workspace", "source_place", "source_stage_dir", "source_stage_file", "source_serve_command", "source_serve_cwd", "revision", "seq", "delivered_seq", "read_seq", "opened_revision", "created_at", "updated_at", "shown_at" FROM `artifacts`;--> statement-breakpoint
DROP TABLE `artifacts`;--> statement-breakpoint
ALTER TABLE `__new_artifacts` RENAME TO `artifacts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `artifacts_instance` ON `artifacts` (`instance_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `artifacts_instance_name` ON `artifacts` (`instance_id`,`kind`,`name`) WHERE "artifacts"."held_for" is null and ("artifacts"."project_id" is null or "artifacts"."kind" <> 'page');--> statement-breakpoint
CREATE UNIQUE INDEX `artifacts_project_page` ON `artifacts` (`project_id`,`name`) WHERE "artifacts"."held_for" is null and "artifacts"."project_id" is not null and "artifacts"."kind" = 'page';--> statement-breakpoint
CREATE UNIQUE INDEX `artifacts_held_for` ON `artifacts` (`held_for`);