-- Which preview origins a pass opens (`preview_passes.scope`, a JSON list
-- of origin keys) is `opens_every` and rows of `preview_pass_origins`, not
-- JSON (preview-access.ts `passOf`, db/preview-passes.ts `live`).
--
-- Today's reader (preview-access.ts `opens`) read a null scope as "opens
-- every origin", on any row: the person's pass (no session) has none, and
-- a session's pass (`instance_id` set) has always been written with a list
-- (`mintSessionTicket`'s scope). Each row keeps the meaning it has today,
-- whoever's pass it is: a scope never set (null) is `opens_every`, so a
-- session's pass stored with none still opens every origin and the
-- person's pass does; a list that reads (JSON, a list, each entry text) is
-- placed as it is, `opens_every` false and one row per origin key, each
-- once, so a pass with no session stored with a list still opens that list
-- alone, and an empty list opens none.
--
-- A scope that is there and does not read whole (not JSON, not a list, or
-- an entry that is not text) opens no origin: `opens_every` false, no
-- rows, kept as stored in `scope_unread`. Today's reader threw on it, and
-- its browser enters again with a fresh ticket, as it does on a pass that
-- lapsed. The step before this migration (db/migrate.ts
-- `pass-scopes-unread`) logs each such pass by its id and why.
--
-- Every JSON function sits inside a CASE that proved `scope` JSON and a
-- list: SQLite may run either side of an AND first.
CREATE TABLE `preview_pass_origins` (
	`pass_id` text NOT NULL,
	`origin_key` text NOT NULL,
	PRIMARY KEY(`pass_id`, `origin_key`),
	FOREIGN KEY (`pass_id`) REFERENCES `preview_passes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `preview_passes` ADD `opens_every` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `preview_passes` ADD `scope_unread` text;--> statement-breakpoint
UPDATE `preview_passes` SET `opens_every` = CASE WHEN `scope` IS NULL THEN 1 ELSE 0 END, `scope_unread` = CASE WHEN `scope` IS NULL THEN NULL WHEN CASE WHEN json_valid(scope) THEN CASE WHEN json_type(scope) = 'array' THEN NOT EXISTS (SELECT 1 FROM json_each(scope) e WHERE e.type <> 'text') ELSE 0 END ELSE 0 END THEN NULL ELSE CAST(`scope` AS TEXT) END;--> statement-breakpoint
INSERT OR IGNORE INTO `preview_pass_origins` (`pass_id`, `origin_key`) SELECT `preview_passes`.`id`, e.`value` FROM `preview_passes`, json_each(CASE WHEN CASE WHEN json_valid(scope) THEN CASE WHEN json_type(scope) = 'array' THEN NOT EXISTS (SELECT 1 FROM json_each(scope) v WHERE v.type <> 'text') ELSE 0 END ELSE 0 END THEN `scope` ELSE '[]' END) e ORDER BY `preview_passes`.`rowid`, e.`id`;--> statement-breakpoint
ALTER TABLE `preview_passes` DROP COLUMN `scope`;