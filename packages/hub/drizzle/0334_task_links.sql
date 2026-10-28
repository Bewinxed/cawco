-- External items on tasks as data (core external-items.ts, tsk-128).
-- `task_links` holds one row per task and linked URL, the task file's
-- `issue:` as its `record` row; `external_comments` holds every comment
-- carried between a task and a source, either way, keyed by the source's
-- own id. `tracker_links` keeps only what the two-way sync alone needs (what
-- the two last agreed on, when they were linked, who opened the issue): its
-- issue's identity moves to the task's record row, and `tracker_comments`
-- to `external_comments`. A link whose issue was never made (`pending:`)
-- has no record to move: the next sync files its issue again, as it did.
-- A GitHub record row's node id and every row's state are read on the next
-- sync; a carried comment's author is filled in by the hub's file pass
-- (tasks.ts `migrateExternalItems`), which reads it off the entry's heading.
CREATE TABLE `external_comments` (
	`project_id` text NOT NULL,
	`source` text NOT NULL,
	`external_id` text NOT NULL,
	`task_id` text NOT NULL,
	`url` text NOT NULL,
	`direction` text NOT NULL,
	`author` text NOT NULL,
	`at` integer NOT NULL,
	`edited_at` integer,
	`entry_at` integer NOT NULL,
	PRIMARY KEY(`project_id`, `source`, `external_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `external_comments_task` ON `external_comments` (`project_id`,`task_id`);--> statement-breakpoint
CREATE TABLE `task_links` (
	`project_id` text NOT NULL,
	`task_id` text NOT NULL,
	`url` text NOT NULL,
	`source` text NOT NULL,
	`kind` text NOT NULL,
	`external_id` text DEFAULT '' NOT NULL,
	`number` integer,
	`ref` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`state` text,
	`state_name` text DEFAULT '' NOT NULL,
	`author` text,
	`labels` text DEFAULT '[]' NOT NULL,
	`mode` text NOT NULL,
	`remote_updated_at` integer,
	`synced_at` integer,
	`problem` text,
	PRIMARY KEY(`project_id`, `task_id`, `url`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_links_item` ON `task_links` (`project_id`,`source`,`kind`,`number`);--> statement-breakpoint
CREATE INDEX `task_links_external` ON `task_links` (`project_id`,`source`,`external_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `task_links_record` ON `task_links` (`project_id`,`url`) WHERE `mode` = 'record';--> statement-breakpoint
INSERT OR IGNORE INTO `task_links` (`project_id`, `task_id`, `url`, `source`, `kind`, `external_id`, `number`, `ref`, `title`, `state`, `state_name`, `author`, `labels`, `mode`, `remote_updated_at`, `synced_at`, `problem`) SELECT `project_id`, `task_id`, `url`, `provider`, 'issue', CASE WHEN `provider` = 'linear' THEN `issue_key` ELSE '' END, CASE WHEN `provider` = 'github' THEN CAST(`issue_key` AS integer) END, `ref`, COALESCE(json_extract(`synced`, '$.title'), ''), NULL, '', NULL, COALESCE(json_extract(`synced`, '$.labels'), '[]'), 'record', `remote_updated_at`, `synced_at`, `problem` FROM `tracker_links` WHERE `issue_key` NOT LIKE 'pending:%' AND `url` <> '';--> statement-breakpoint
INSERT OR IGNORE INTO `external_comments` (`project_id`, `source`, `external_id`, `task_id`, `url`, `direction`, `author`, `at`, `edited_at`, `entry_at`) SELECT `c`.`project_id`, `l`.`provider`, `c`.`remote_id`, `c`.`task_id`, `l`.`url` || CASE WHEN `l`.`provider` = 'github' THEN '#issuecomment-' ELSE '#comment-' END || `c`.`remote_id`, CASE WHEN `c`.`origin` = 'tracker' THEN 'in' ELSE 'out' END, json_object('source', `l`.`provider`, 'login', '', 'name', NULL, 'avatarUrl', NULL, 'url', NULL, 'kind', 'person', 'memberId', NULL), `c`.`at`, NULL, `c`.`at` FROM `tracker_comments` AS `c` JOIN `tracker_links` AS `l` ON `l`.`project_id` = `c`.`project_id` AND `l`.`task_id` = `c`.`task_id` WHERE `l`.`url` <> '';--> statement-breakpoint
DELETE FROM `tracker_links` WHERE `issue_key` LIKE 'pending:%';--> statement-breakpoint
DROP TABLE `tracker_comments`;--> statement-breakpoint
DROP INDEX `tracker_links_issue`;--> statement-breakpoint
ALTER TABLE `tracker_links` DROP COLUMN `provider`;--> statement-breakpoint
ALTER TABLE `tracker_links` DROP COLUMN `issue_key`;--> statement-breakpoint
ALTER TABLE `tracker_links` DROP COLUMN `ref`;--> statement-breakpoint
ALTER TABLE `tracker_links` DROP COLUMN `url`;--> statement-breakpoint
ALTER TABLE `tracker_links` DROP COLUMN `remote_updated_at`;--> statement-breakpoint
ALTER TABLE `tracker_links` DROP COLUMN `problem`;--> statement-breakpoint
ALTER TABLE `tracker_links` DROP COLUMN `synced_at`;