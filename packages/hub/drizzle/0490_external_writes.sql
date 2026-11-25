-- The write ledger (provider spec §2.8, §4 "Writes"; hub writes.ts): what
-- CawCo wrote to an outside service, so the door knows its own when it
-- comes back.
--
-- Every comment the tracker sync carried out from a task (`external_comments`
-- rows with direction `out`) moves here, kind `comment`, with its task and
-- the entry it carried (`entry_at`), so the sync carries none twice and the
-- door never files one back. Its item is read off the comment's URL as the
-- mirror keys it: GitHub's `owner/repo` in lower case and the issue's
-- number (`https://github.com/<owner>/<repo>/issues/<n>#issuecomment-<id>`),
-- Linear's workspace in lower case and the issue's identifier
-- (`https://linear.app/<workspace>/issue/<TEAM-n>/<slug>#comment-<id>`).
-- `by` names the project's syncing watch (one per project), or none when
-- the project no longer syncs. Then `external_comments` holds only what
-- came in, and loses its `direction`.
--
-- Issues the sync filed before are not written here: each is linked to its
-- task already, which is all the ledger would say of it.
CREATE TABLE `external_writes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`provider` text NOT NULL,
	`host` text NOT NULL,
	`container` text NOT NULL,
	`kind` text NOT NULL,
	`key` text NOT NULL,
	`comment_id` text,
	`url` text NOT NULL,
	`by` text NOT NULL,
	`task_id` text,
	`entry_at` integer,
	`version` text,
	`at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `external_writes_item` ON `external_writes` (`provider`,`host`,`container`,`key`);--> statement-breakpoint
CREATE UNIQUE INDEX `external_writes_comment` ON `external_writes` (`provider`,`comment_id`) WHERE "external_writes"."comment_id" is not null;--> statement-breakpoint
CREATE INDEX `external_writes_task` ON `external_writes` (`project_id`,`task_id`);--> statement-breakpoint
WITH `out_rows` AS (
	SELECT c.*,
		CASE c.`source` WHEN 'github' THEN 'github.com' ELSE 'linear.app' END AS `host`,
		substr(c.`url`, instr(c.`url`, '://') + 3) AS `after_scheme`
	FROM `external_comments` c
	WHERE c.`direction` = 'out'
), `pathed` AS (
	SELECT o.*, substr(o.`after_scheme`, instr(o.`after_scheme`, '/') + 1) AS `path`
	FROM `out_rows` o
), `first` AS (
	SELECT p.*,
		substr(p.`path`, 1, instr(p.`path`, '/') - 1) AS `seg1`,
		substr(p.`path`, instr(p.`path`, '/') + 1) AS `rest1`
	FROM `pathed` p
), `second` AS (
	SELECT f.*,
		substr(f.`rest1`, 1, instr(f.`rest1`, '/') - 1) AS `seg2`,
		substr(f.`rest1`, instr(f.`rest1`, '/') + 1) AS `rest2`
	FROM `first` f
), `third` AS (
	SELECT s.*,
		CASE WHEN instr(s.`rest2`, '/') > 0
			THEN substr(s.`rest2`, instr(s.`rest2`, '/') + 1)
			ELSE '' END AS `rest3`
	FROM `second` s
), `keyed` AS (
	SELECT t.*,
		CASE WHEN t.`source` = 'github'
			THEN lower(t.`seg1` || '/' || t.`seg2`)
			ELSE lower(t.`seg1`) END AS `item_container`,
		CASE WHEN t.`source` = 'github'
			THEN CASE WHEN instr(t.`rest3`, '#') > 0 THEN substr(t.`rest3`, 1, instr(t.`rest3`, '#') - 1) ELSE t.`rest3` END
			ELSE upper(
				CASE WHEN instr(t.`rest2`, '/') > 0 THEN substr(t.`rest2`, 1, instr(t.`rest2`, '/') - 1)
				WHEN instr(t.`rest2`, '#') > 0 THEN substr(t.`rest2`, 1, instr(t.`rest2`, '#') - 1)
				ELSE t.`rest2` END
			) END AS `item_key`
	FROM `third` t
)
INSERT INTO `external_writes` (`id`, `project_id`, `provider`, `host`, `container`, `kind`, `key`, `comment_id`, `url`, `by`, `task_id`, `entry_at`, `version`, `at`)
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-a' || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
	k.`project_id`, k.`source`, k.`host`, k.`item_container`, 'comment', k.`item_key`, k.`external_id`, k.`url`,
	'sync:' || coalesce((
		SELECT w.`id` FROM `watches` w
		WHERE w.`project_id` = k.`project_id` AND w.`sync` != 'off'
	), ''),
	k.`task_id`, k.`entry_at`, NULL, k.`at`
FROM `keyed` k;--> statement-breakpoint
DELETE FROM `external_comments` WHERE `direction` = 'out';--> statement-breakpoint
ALTER TABLE `external_comments` DROP COLUMN `direction`;