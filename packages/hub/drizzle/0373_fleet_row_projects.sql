-- A fleet skill, MCP server, hook or harness config row bound to a project
-- names it by a foreign key (ON DELETE cascade), as its area binding does:
-- the row goes with its project (kept in a forget's record, back with its
-- restore), and a trashed one whose project went is refused its Undo
-- (db/trash.ts `unbound`) instead of coming back bound to nothing.
--
-- A row already naming a project the hub no longer has reached no machine
-- (no machine holds a project that is gone) and could not stand under the
-- key: it is deleted here, never made every machine's. The live hub had
-- none on 2026-11-05 (27 skills, 3 MCP servers, 4 hooks bound, each to a
-- live project).
--
-- A trash entry (`config_trash`) no longer belongs to a project: one whose
-- project or area went while it waited is refused its Undo by the key on
-- its own row, rather than taken with the project's forget.
DELETE FROM `skills` WHERE `project_id` IS NOT NULL AND `project_id` NOT IN (SELECT `id` FROM `projects`);--> statement-breakpoint
DELETE FROM `mcp_servers` WHERE `project_id` IS NOT NULL AND `project_id` NOT IN (SELECT `id` FROM `projects`);--> statement-breakpoint
DELETE FROM `fleet_hooks` WHERE `project_id` IS NOT NULL AND `project_id` NOT IN (SELECT `id` FROM `projects`);--> statement-breakpoint
DELETE FROM `fleet_harness_config` WHERE `project_id` IS NOT NULL AND `project_id` NOT IN (SELECT `id` FROM `projects`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_config_trash` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`key` text NOT NULL,
	`rows` text NOT NULL,
	`deleted_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_config_trash`("id", "kind", "key", "rows", "deleted_at") SELECT "id", "kind", "key", "rows", "deleted_at" FROM `config_trash`;--> statement-breakpoint
DROP TABLE `config_trash`;--> statement-breakpoint
ALTER TABLE `__new_config_trash` RENAME TO `config_trash`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_skills` (
	`name` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`hash` text,
	`bytes` integer,
	`error` text,
	`files` text,
	`version` text,
	`last_refresh` text,
	`latest_hash` text,
	`latest_version` text,
	`checked_at` integer,
	`check_error` text,
	`scope` text,
	`project_id` text,
	`area_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_skills`("name", "source", "enabled", "hash", "bytes", "error", "files", "version", "last_refresh", "latest_hash", "latest_version", "checked_at", "check_error", "scope", "project_id", "area_id", "created_at") SELECT "name", "source", "enabled", "hash", "bytes", "error", "files", "version", "last_refresh", "latest_hash", "latest_version", "checked_at", "check_error", "scope", "project_id", "area_id", "created_at" FROM `skills`;--> statement-breakpoint
DROP TABLE `skills`;--> statement-breakpoint
ALTER TABLE `__new_skills` RENAME TO `skills`;--> statement-breakpoint
CREATE INDEX `skills_listing` ON `skills` (`name`,`source`,`enabled`,`hash`,`bytes`,`error`,`scope`,`project_id`,`area_id`,`version`,`last_refresh`,`latest_hash`,`latest_version`,`checked_at`,`check_error`);--> statement-breakpoint
CREATE TABLE `__new_fleet_harness_config` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`settings` text,
	`module` text,
	`package` text,
	`scope` text,
	`project_id` text,
	`area_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_fleet_harness_config`("id", "kind", "name", "enabled", "settings", "module", "package", "scope", "project_id", "area_id", "created_at", "updated_at") SELECT "id", "kind", "name", "enabled", "settings", "module", "package", "scope", "project_id", "area_id", "created_at", "updated_at" FROM `fleet_harness_config`;--> statement-breakpoint
DROP TABLE `fleet_harness_config`;--> statement-breakpoint
ALTER TABLE `__new_fleet_harness_config` RENAME TO `fleet_harness_config`;--> statement-breakpoint
CREATE TABLE `__new_fleet_hooks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`event` text NOT NULL,
	`matcher` text,
	`handler` text NOT NULL,
	`script` text,
	`hash` text NOT NULL,
	`scope` text,
	`project_id` text,
	`area_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_fleet_hooks`("id", "name", "enabled", "event", "matcher", "handler", "script", "hash", "scope", "project_id", "area_id", "created_at", "updated_at") SELECT "id", "name", "enabled", "event", "matcher", "handler", "script", "hash", "scope", "project_id", "area_id", "created_at", "updated_at" FROM `fleet_hooks`;--> statement-breakpoint
DROP TABLE `fleet_hooks`;--> statement-breakpoint
ALTER TABLE `__new_fleet_hooks` RENAME TO `fleet_hooks`;--> statement-breakpoint
CREATE TABLE `__new_mcp_servers` (
	`name` text PRIMARY KEY NOT NULL,
	`config` text NOT NULL,
	`auth_mode` text DEFAULT 'direct' NOT NULL,
	`auth_error` text,
	`enabled` integer DEFAULT true NOT NULL,
	`scope` text,
	`project_id` text,
	`area_id` text,
	`platforms` text,
	`shared` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_mcp_servers`("name", "config", "auth_mode", "auth_error", "enabled", "scope", "project_id", "area_id", "platforms", "shared", "created_at") SELECT "name", "config", "auth_mode", "auth_error", "enabled", "scope", "project_id", "area_id", "platforms", "shared", "created_at" FROM `mcp_servers`;--> statement-breakpoint
DROP TABLE `mcp_servers`;--> statement-breakpoint
ALTER TABLE `__new_mcp_servers` RENAME TO `mcp_servers`;