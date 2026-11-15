-- A skill's, a plugin's and a kept skill version's files (`files`, one
-- JSON list of each file's path, execute bit and bytes as base64) become
-- rows of `skill_files`, `plugin_files` and `skill_version_files`, each
-- file's bytes a BLOB exactly as the base64 says them and its place in the
-- list kept (`position`), and whether a skill or plugin holds files is
-- `files_held`. SQL cannot read base64 as bytes: the step before 0423
-- (db/migrate.ts `fleet-files`, db/fleet-files-unread.ts) places them, and
-- keeps a list that does not read in `files_unread`. With the files out of
-- the rows, the two listing indexes that kept a listing from reading past
-- them go.
--
-- What the last fetch of a skill or plugin came to (`last_refresh`, JSON)
-- is `refresh_at`, `refresh_outcome`, `refresh_error`, `refresh_from_hash`,
-- `refresh_from_version`, `refresh_to_hash` and `refresh_to_version`. One
-- never said (null) stays none; one that reads whole (core `FleetRefresh`)
-- is placed as it is. One that is there and does not read whole is kept as
-- stored in `refresh_unread`, none of it placed: no last fetch is said
-- until the next one. The hub only shows it. The step before this
-- migration (db/migrate.ts `fleet-refresh-unread`) logs each by its row and
-- why. 0423 drops `last_refresh` with `files`.
--
-- Every JSON function sits inside a CASE that proved `last_refresh` JSON:
-- SQLite may run either side of an AND first.
CREATE TABLE `plugin_files` (
	`plugin_id` text NOT NULL,
	`path` text NOT NULL,
	`position` integer NOT NULL,
	`executable` integer NOT NULL,
	`content` blob NOT NULL,
	PRIMARY KEY(`plugin_id`, `path`),
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `skill_files` (
	`skill_name` text NOT NULL,
	`path` text NOT NULL,
	`position` integer NOT NULL,
	`executable` integer NOT NULL,
	`content` blob NOT NULL,
	PRIMARY KEY(`skill_name`, `path`),
	FOREIGN KEY (`skill_name`) REFERENCES `skills`(`name`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `skill_version_files` (
	`version_id` integer NOT NULL,
	`path` text NOT NULL,
	`position` integer NOT NULL,
	`executable` integer NOT NULL,
	`content` blob NOT NULL,
	PRIMARY KEY(`version_id`, `path`),
	FOREIGN KEY (`version_id`) REFERENCES `fleet_skill_history`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
DROP INDEX `plugins_listing`;--> statement-breakpoint
ALTER TABLE `plugins` ADD `files_held` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `plugins` ADD `files_unread` text;--> statement-breakpoint
ALTER TABLE `plugins` ADD `refresh_at` integer;--> statement-breakpoint
ALTER TABLE `plugins` ADD `refresh_outcome` text;--> statement-breakpoint
ALTER TABLE `plugins` ADD `refresh_error` text;--> statement-breakpoint
ALTER TABLE `plugins` ADD `refresh_from_hash` text;--> statement-breakpoint
ALTER TABLE `plugins` ADD `refresh_from_version` text;--> statement-breakpoint
ALTER TABLE `plugins` ADD `refresh_to_hash` text;--> statement-breakpoint
ALTER TABLE `plugins` ADD `refresh_to_version` text;--> statement-breakpoint
ALTER TABLE `plugins` ADD `refresh_unread` text;--> statement-breakpoint
DROP INDEX `skills_listing`;--> statement-breakpoint
ALTER TABLE `skills` ADD `files_held` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `skills` ADD `files_unread` text;--> statement-breakpoint
ALTER TABLE `skills` ADD `refresh_at` integer;--> statement-breakpoint
ALTER TABLE `skills` ADD `refresh_outcome` text;--> statement-breakpoint
ALTER TABLE `skills` ADD `refresh_error` text;--> statement-breakpoint
ALTER TABLE `skills` ADD `refresh_from_hash` text;--> statement-breakpoint
ALTER TABLE `skills` ADD `refresh_from_version` text;--> statement-breakpoint
ALTER TABLE `skills` ADD `refresh_to_hash` text;--> statement-breakpoint
ALTER TABLE `skills` ADD `refresh_to_version` text;--> statement-breakpoint
ALTER TABLE `skills` ADD `refresh_unread` text;--> statement-breakpoint
UPDATE `skills` SET `refresh_unread` = CASE WHEN `last_refresh` IS NULL THEN NULL WHEN CASE WHEN json_valid(last_refresh) THEN coalesce((json_type(last_refresh, '$') IN ('object') AND (json_type(last_refresh, '$.at') IN ('integer', 'real')) AND (json_type(last_refresh, '$.outcome') IN ('text') AND (json_type(last_refresh, '$.outcome') = 'text' AND json_extract(last_refresh, '$.outcome') IN ('updated', 'unchanged', 'failed'))) AND (json_type(last_refresh, '$.error') IS NULL OR (json_type(last_refresh, '$.error') IN ('text'))) AND (json_type(last_refresh, '$.fromHash') IS NULL OR (json_type(last_refresh, '$.fromHash') IN ('text'))) AND (json_type(last_refresh, '$.fromVersion') IS NULL OR (json_type(last_refresh, '$.fromVersion') IN ('text'))) AND (json_type(last_refresh, '$.toHash') IS NULL OR (json_type(last_refresh, '$.toHash') IN ('text'))) AND (json_type(last_refresh, '$.toVersion') IS NULL OR (json_type(last_refresh, '$.toVersion') IN ('text')))), 0) ELSE 0 END THEN NULL ELSE CAST(`last_refresh` AS TEXT) END;--> statement-breakpoint
UPDATE `skills` SET `refresh_at` = CASE WHEN json_valid(last_refresh) THEN CASE WHEN refresh_unread IS NULL THEN json_extract(last_refresh, '$.at') END END, `refresh_outcome` = CASE WHEN json_valid(last_refresh) THEN CASE WHEN refresh_unread IS NULL THEN json_extract(last_refresh, '$.outcome') END END, `refresh_error` = CASE WHEN json_valid(last_refresh) THEN CASE WHEN refresh_unread IS NULL THEN json_extract(last_refresh, '$.error') END END, `refresh_from_hash` = CASE WHEN json_valid(last_refresh) THEN CASE WHEN refresh_unread IS NULL THEN json_extract(last_refresh, '$.fromHash') END END, `refresh_from_version` = CASE WHEN json_valid(last_refresh) THEN CASE WHEN refresh_unread IS NULL THEN json_extract(last_refresh, '$.fromVersion') END END, `refresh_to_hash` = CASE WHEN json_valid(last_refresh) THEN CASE WHEN refresh_unread IS NULL THEN json_extract(last_refresh, '$.toHash') END END, `refresh_to_version` = CASE WHEN json_valid(last_refresh) THEN CASE WHEN refresh_unread IS NULL THEN json_extract(last_refresh, '$.toVersion') END END;--> statement-breakpoint
UPDATE `plugins` SET `refresh_unread` = CASE WHEN `last_refresh` IS NULL THEN NULL WHEN CASE WHEN json_valid(last_refresh) THEN coalesce((json_type(last_refresh, '$') IN ('object') AND (json_type(last_refresh, '$.at') IN ('integer', 'real')) AND (json_type(last_refresh, '$.outcome') IN ('text') AND (json_type(last_refresh, '$.outcome') = 'text' AND json_extract(last_refresh, '$.outcome') IN ('updated', 'unchanged', 'failed'))) AND (json_type(last_refresh, '$.error') IS NULL OR (json_type(last_refresh, '$.error') IN ('text'))) AND (json_type(last_refresh, '$.fromHash') IS NULL OR (json_type(last_refresh, '$.fromHash') IN ('text'))) AND (json_type(last_refresh, '$.fromVersion') IS NULL OR (json_type(last_refresh, '$.fromVersion') IN ('text'))) AND (json_type(last_refresh, '$.toHash') IS NULL OR (json_type(last_refresh, '$.toHash') IN ('text'))) AND (json_type(last_refresh, '$.toVersion') IS NULL OR (json_type(last_refresh, '$.toVersion') IN ('text')))), 0) ELSE 0 END THEN NULL ELSE CAST(`last_refresh` AS TEXT) END;--> statement-breakpoint
UPDATE `plugins` SET `refresh_at` = CASE WHEN json_valid(last_refresh) THEN CASE WHEN refresh_unread IS NULL THEN json_extract(last_refresh, '$.at') END END, `refresh_outcome` = CASE WHEN json_valid(last_refresh) THEN CASE WHEN refresh_unread IS NULL THEN json_extract(last_refresh, '$.outcome') END END, `refresh_error` = CASE WHEN json_valid(last_refresh) THEN CASE WHEN refresh_unread IS NULL THEN json_extract(last_refresh, '$.error') END END, `refresh_from_hash` = CASE WHEN json_valid(last_refresh) THEN CASE WHEN refresh_unread IS NULL THEN json_extract(last_refresh, '$.fromHash') END END, `refresh_from_version` = CASE WHEN json_valid(last_refresh) THEN CASE WHEN refresh_unread IS NULL THEN json_extract(last_refresh, '$.fromVersion') END END, `refresh_to_hash` = CASE WHEN json_valid(last_refresh) THEN CASE WHEN refresh_unread IS NULL THEN json_extract(last_refresh, '$.toHash') END END, `refresh_to_version` = CASE WHEN json_valid(last_refresh) THEN CASE WHEN refresh_unread IS NULL THEN json_extract(last_refresh, '$.toVersion') END END;--> statement-breakpoint
ALTER TABLE `fleet_skill_history` ADD `files_unread` text;