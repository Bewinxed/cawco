-- A work item's block (`work_items.blocked`: what its session cannot be
-- started again without, work-items.ts `blockIfMissing`) is columns:
-- `blocked_kind` (its delegate type, its machine or its account),
-- `blocked_name` and `blocked_since`, null together while it is not
-- blocked, with `blocked_unread`; the sweep finds blocked items by a
-- partial index.
--
-- A block that reads whole (an object with `kind` one of `type`, `machine`
-- and `account`, `name` text and `since` a number; a key nothing read is
-- ignored, as the reader ignored it) is placed field by field, `since` as
-- the epoch ms it was. None (SQL null) was never set: not blocked.
--
-- A block that is there and does not read whole (not JSON, JSON null, not
-- an object, or a field missing or not its type) is kept as stored in
-- `blocked_unread`, and nothing of it is placed: the item is blocked all
-- the same, what it is sent waits at the hub and its session is not
-- started again, until the sweep finds nothing it needs missing
-- (work-items.ts `unblockReady`) or a start finds what is missing now and
-- blocks it on that. Today's reader threw on such a value. The step before
-- this migration (db/migrate.ts `item-blocks-unread`) logs each.
--
-- Every JSON function here sits inside a CASE that proved `blocked` JSON
-- and an object: SQLite may run either side of an AND first.
ALTER TABLE `work_items` ADD `blocked_kind` text;--> statement-breakpoint
ALTER TABLE `work_items` ADD `blocked_name` text;--> statement-breakpoint
ALTER TABLE `work_items` ADD `blocked_since` integer;--> statement-breakpoint
ALTER TABLE `work_items` ADD `blocked_unread` text;--> statement-breakpoint
CREATE INDEX `work_items_blocked` ON `work_items` (`state`) WHERE "work_items"."blocked_kind" IS NOT NULL OR "work_items"."blocked_unread" IS NOT NULL;--> statement-breakpoint
UPDATE `work_items` SET `blocked_kind` = CASE WHEN CASE WHEN json_valid(blocked) THEN CASE WHEN json_type(blocked) = 'object' THEN coalesce(json_type(blocked, '$.kind') = 'text' AND json_extract(blocked, '$.kind') IN ('type', 'machine', 'account') AND json_type(blocked, '$.name') = 'text' AND json_type(blocked, '$.since') IN ('integer', 'real'), 0) ELSE 0 END ELSE 0 END THEN json_extract(blocked, '$.kind') END, `blocked_name` = CASE WHEN CASE WHEN json_valid(blocked) THEN CASE WHEN json_type(blocked) = 'object' THEN coalesce(json_type(blocked, '$.kind') = 'text' AND json_extract(blocked, '$.kind') IN ('type', 'machine', 'account') AND json_type(blocked, '$.name') = 'text' AND json_type(blocked, '$.since') IN ('integer', 'real'), 0) ELSE 0 END ELSE 0 END THEN json_extract(blocked, '$.name') END, `blocked_since` = CASE WHEN CASE WHEN json_valid(blocked) THEN CASE WHEN json_type(blocked) = 'object' THEN coalesce(json_type(blocked, '$.kind') = 'text' AND json_extract(blocked, '$.kind') IN ('type', 'machine', 'account') AND json_type(blocked, '$.name') = 'text' AND json_type(blocked, '$.since') IN ('integer', 'real'), 0) ELSE 0 END ELSE 0 END THEN json_extract(blocked, '$.since') END, `blocked_unread` = CASE WHEN `blocked` IS NULL THEN NULL WHEN CASE WHEN json_valid(blocked) THEN CASE WHEN json_type(blocked) = 'object' THEN coalesce(json_type(blocked, '$.kind') = 'text' AND json_extract(blocked, '$.kind') IN ('type', 'machine', 'account') AND json_type(blocked, '$.name') = 'text' AND json_type(blocked, '$.since') IN ('integer', 'real'), 0) ELSE 0 END ELSE 0 END THEN NULL ELSE CAST(`blocked` AS TEXT) END;--> statement-breakpoint
ALTER TABLE `work_items` DROP COLUMN `blocked`;