-- The mirror (provider spec §2.3, §4 "The mirror"): one `external_items`
-- row per project and outside item, which every `task_links` row naming it
-- points at through `item_id`. `task_links` loses its mirror columns.
--
-- The step before this migration (db/migrate.ts `link-items`) read the item
-- each link's URL names with the hub's own parser into `__link_items`, and
-- added a `related` link for each Actions run a task or plan step waits on
-- (a wait on a run is a link from now on).
--
-- An item's id here is its natural key as a JSON array, so the same rows
-- make the same ids (the hub makes a random UUID for one it adds).
--
-- Links are grouped by project and item; each group's mirror row is taken
-- from the link read most recently (`synced_at`, then the newest the source
-- said it changed, then the first linked), and every link of the group
-- gets its `item_id`. An item two tasks held as their record under URLs
-- written differently stays one task's record (the task the tracker sync
-- links, else the first linked); the others link it as `related`.
-- `tracker_links` is unchanged.
--
-- Each `connector_poll_items` row becomes a record (`kind` record, provider
-- `connection`) under its poll's watch, whose id is its container: its id
-- is the record's key and ref, its version carried, read when its poll last
-- looked. Then the table goes.
CREATE TABLE `external_items` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`provider` text NOT NULL,
	`host` text NOT NULL,
	`container` text NOT NULL,
	`kind` text NOT NULL,
	`key` text NOT NULL,
	`ref` text NOT NULL,
	`url` text,
	`external_id` text DEFAULT '' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`state` text,
	`state_name` text DEFAULT '' NOT NULL,
	`author` text,
	`labels` text DEFAULT '[]' NOT NULL,
	`version` text,
	`etag` text,
	`read_at` integer,
	`problem` text,
	`synced_version` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `external_items_item` ON `external_items` (`project_id`,`provider`,`host`,`container`,`kind`,`key`);--> statement-breakpoint
CREATE INDEX `external_items_external` ON `external_items` (`project_id`,`provider`,`external_id`);--> statement-breakpoint
CREATE INDEX `external_items_container` ON `external_items` (`provider`,`host`,`container`);--> statement-breakpoint
INSERT INTO `external_items` (`id`, `project_id`, `provider`, `host`, `container`, `kind`, `key`, `ref`, `url`, `external_id`, `title`, `state`, `state_name`, `author`, `labels`, `version`, `etag`, `read_at`, `problem`)
SELECT json_array(`project_id`, `provider`, `host`, `container`, `kind`, `key`), `project_id`, `provider`, `host`, `container`, `kind`, `key`, `ref`, `item_url`,
	coalesce(`external_id`, ''), coalesce(`title`, ''), `state`, coalesce(`state_name`, ''), `author`, coalesce(`labels`, '[]'),
	CAST(`remote_updated_at` AS TEXT), `etag`, `synced_at`, `problem`
FROM (
	SELECT li.`project_id`, li.`provider`, li.`host`, li.`container`, li.`kind`, li.`key`, li.`ref`, li.`item_url`,
		t.`external_id`, t.`title`, t.`state`, t.`state_name`, t.`author`, t.`labels`,
		t.`remote_updated_at`, t.`etag`, t.`synced_at`, t.`problem`,
		row_number() OVER (
			PARTITION BY li.`project_id`, li.`provider`, li.`host`, li.`container`, li.`kind`, li.`key`
			ORDER BY t.`synced_at` IS NULL, t.`synced_at` DESC, t.`remote_updated_at` IS NULL, t.`remote_updated_at` DESC, t.`rowid` IS NULL, t.`rowid`, li.`rowid`
		) AS `n`
	FROM `__link_items` li
	LEFT JOIN `task_links` t ON t.`rowid` = li.`src_rowid`
)
WHERE `n` = 1;
--> statement-breakpoint
INSERT INTO `external_items` (`id`, `project_id`, `provider`, `host`, `container`, `kind`, `key`, `ref`, `url`, `version`, `read_at`)
SELECT json_array(w.`project_id`, 'connection', '', c.`poll_id`, 'record', c.`item_id`), w.`project_id`, 'connection', '', c.`poll_id`, 'record', c.`item_id`, c.`item_id`, NULL, c.`version`, wc.`updated_at`
FROM `connector_poll_items` c
JOIN `watches` w ON w.`id` = c.`poll_id`
LEFT JOIN `watch_cursors` wc ON wc.`watch_id` = c.`poll_id` AND wc.`stream` = 'items';
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_task_links` (
	`project_id` text NOT NULL,
	`task_id` text NOT NULL,
	`url` text NOT NULL,
	`mode` text NOT NULL,
	`item_id` text NOT NULL,
	PRIMARY KEY(`project_id`, `task_id`, `url`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `external_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_task_links` (`project_id`, `task_id`, `url`, `mode`, `item_id`)
SELECT `project_id`, `task_id`, `url`,
	CASE WHEN `mode` = 'record' AND `nth_record` > 1 THEN 'related' ELSE `mode` END,
	`item_id`
FROM (
	SELECT li.`project_id`, li.`task_id`, li.`url`, li.`mode`, e.`id` AS `item_id`,
		row_number() OVER (
			PARTITION BY e.`id`, li.`mode` = 'record'
			ORDER BY EXISTS (
				SELECT 1 FROM `tracker_links` tl WHERE tl.`project_id` = li.`project_id` AND tl.`task_id` = li.`task_id`
			) DESC, li.`rowid`
		) AS `nth_record`
	FROM `__link_items` li
	JOIN `external_items` e ON e.`project_id` = li.`project_id` AND e.`provider` = li.`provider` AND e.`host` = li.`host`
		AND e.`container` = li.`container` AND e.`kind` = li.`kind` AND e.`key` = li.`key`
);
--> statement-breakpoint
DROP TABLE `task_links`;--> statement-breakpoint
ALTER TABLE `__new_task_links` RENAME TO `task_links`;--> statement-breakpoint
CREATE INDEX `task_links_item` ON `task_links` (`item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `task_links_record` ON `task_links` (`item_id`) WHERE "task_links"."mode" = 'record';--> statement-breakpoint
DROP TABLE `connector_poll_items`;--> statement-breakpoint
DROP TABLE `__link_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
