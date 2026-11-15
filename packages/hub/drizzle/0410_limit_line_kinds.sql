-- A limit line's kind (core `AccountMove` `kind`: what the hub did at a
-- session's account's limit) is a column, found by in SQL: `limit_events.kind`
-- (indexed with its session) and `limit_compactions.move_kind`. The rest of
-- the line stays JSON, without its kind: `limit_events.body` in place of
-- `limit_events.move` (NOT NULL, which an unread line cannot be), and
-- `limit_compactions.move` rewritten in place. The row mapper puts the
-- kind back (db/at-limit.ts).
--
-- A line whose kind reads (a JSON object whose `kind` is one of a line's)
-- is placed as it is: its kind in its column, the rest of it as stored
-- but for that key. A compaction plan with no move (a filing at the
-- threshold) was never set and stays null.
--
-- A line that is there and whose kind does not read (not JSON, not an
-- object, no kind, or a kind that is not one of a line's) is kept as stored
-- in `move_unread`, nothing of it placed. Such a line is in no transcript;
-- a read of a session's newest line that meets it reads a line it cannot
-- say, which no announced move is carried out from, no move kept the
-- session where it is by, and no line repeats; a compaction plan whose move
-- does not read is no plan: it drives no move and holds nothing back. A
-- line said again under its id, and a plan put again, clear it. The step
-- before this migration (db/migrate.ts `limit-lines-unread`) logs each.
--
-- Every JSON function here sits inside a CASE that proved `move` JSON and
-- an object: SQLite may run either side of an AND first.
DROP INDEX `limit_events_instance_idx`;--> statement-breakpoint
ALTER TABLE `limit_events` ADD `kind` text;--> statement-breakpoint
ALTER TABLE `limit_events` ADD `body` text;--> statement-breakpoint
ALTER TABLE `limit_events` ADD `move_unread` text;--> statement-breakpoint
CREATE INDEX `limit_events_instance_kind` ON `limit_events` (`instance_id`,`kind`);--> statement-breakpoint
ALTER TABLE `limit_compactions` ADD `move_kind` text;--> statement-breakpoint
ALTER TABLE `limit_compactions` ADD `move_unread` text;--> statement-breakpoint
UPDATE `limit_events` SET `kind` = CASE WHEN CASE WHEN json_valid(move) THEN CASE WHEN json_type(move) = 'object' THEN CASE WHEN json_type(move, '$.kind') = 'text' THEN json_extract(move, '$.kind') IN ('moved', 'moving', 'waiting', 'continued', 'stopped', 'signed-out', 'ended', 'unmoved') ELSE 0 END ELSE 0 END ELSE 0 END THEN json_extract(move, '$.kind') END, `body` = CASE WHEN CASE WHEN json_valid(move) THEN CASE WHEN json_type(move) = 'object' THEN CASE WHEN json_type(move, '$.kind') = 'text' THEN json_extract(move, '$.kind') IN ('moved', 'moving', 'waiting', 'continued', 'stopped', 'signed-out', 'ended', 'unmoved') ELSE 0 END ELSE 0 END ELSE 0 END THEN json_remove(move, '$.kind') END, `move_unread` = CASE WHEN CASE WHEN json_valid(move) THEN CASE WHEN json_type(move) = 'object' THEN CASE WHEN json_type(move, '$.kind') = 'text' THEN json_extract(move, '$.kind') IN ('moved', 'moving', 'waiting', 'continued', 'stopped', 'signed-out', 'ended', 'unmoved') ELSE 0 END ELSE 0 END ELSE 0 END THEN NULL ELSE CAST(`move` AS TEXT) END;--> statement-breakpoint
UPDATE `limit_compactions` SET `move_kind` = CASE WHEN CASE WHEN json_valid(move) THEN CASE WHEN json_type(move) = 'object' THEN CASE WHEN json_type(move, '$.kind') = 'text' THEN json_extract(move, '$.kind') IN ('moved', 'moving', 'waiting', 'continued', 'stopped', 'signed-out', 'ended', 'unmoved') ELSE 0 END ELSE 0 END ELSE 0 END THEN json_extract(move, '$.kind') END, `move_unread` = CASE WHEN `move` IS NULL THEN NULL WHEN CASE WHEN json_valid(move) THEN CASE WHEN json_type(move) = 'object' THEN CASE WHEN json_type(move, '$.kind') = 'text' THEN json_extract(move, '$.kind') IN ('moved', 'moving', 'waiting', 'continued', 'stopped', 'signed-out', 'ended', 'unmoved') ELSE 0 END ELSE 0 END ELSE 0 END THEN NULL ELSE CAST(`move` AS TEXT) END, `move` = CASE WHEN CASE WHEN json_valid(move) THEN CASE WHEN json_type(move) = 'object' THEN CASE WHEN json_type(move, '$.kind') = 'text' THEN json_extract(move, '$.kind') IN ('moved', 'moving', 'waiting', 'continued', 'stopped', 'signed-out', 'ended', 'unmoved') ELSE 0 END ELSE 0 END ELSE 0 END THEN json_remove(move, '$.kind') END;--> statement-breakpoint
ALTER TABLE `limit_events` DROP COLUMN `move`;