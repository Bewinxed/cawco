-- A filing at the context threshold keeps what the session's records held as
-- it started (core `FiledRecords`), so its line can say what it wrote once
-- its turn ends; and every filing line names its session's harness (core
-- `ContextLine`), as a compaction line already did.
ALTER TABLE `limit_compactions` ADD `records` text;--> statement-breakpoint
UPDATE `session_lines` SET `content` = json_set(`content`, '$.harness', (SELECT `harness` FROM `instances` WHERE `instances`.`id` = `session_lines`.`instance_id`)) WHERE `kind` = 'context' AND json_extract(`content`, '$.kind') = 'filing' AND json_type(`content`, '$.harness') IS NULL;
