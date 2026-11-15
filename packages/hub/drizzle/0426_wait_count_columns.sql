-- A work item's waits since the last message handed to its parent
-- (`work_items.wait_history`, JSON: how many, and the last one's end and
-- reason) are `wait_count`, `wait_last_until` and `wait_last_reason`: the
-- line its parent's next message carries (work-items.ts `waitSummary`) is
-- read off the columns.
--
-- Null is "no wait since the last delivered message": a count of 0, no last
-- wait. A history that reads whole (a count, an end and a reason, each the
-- type the hub wrote) has its count placed. Its last wait's end and reason
-- were copies of the live wait's `wait_until` and `wait_reason` while that
-- lasts; the live wait stays the one place they are, and the copy is not
-- placed. A history whose last wait is over (no live wait, or a live one
-- that differs) has its end and reason placed in `wait_last_until` and
-- `wait_last_reason`. Nothing is recomputed.
--
-- A history that is there and does not read whole (not JSON, JSON `null`,
-- not an object, a count or end that is no number, a reason that is no text)
-- is kept as stored in `wait_history_unread`, none of it placed: no count is
-- vouched for, and the parent's next message says its waits do not read
-- (core work.ts `waitsUnread`), until a message is delivered. Today's reader
-- threw on it. The step before this migration (db/migrate.ts
-- `wait-history-unread`) logs each by its item and why.
--
-- Every JSON function sits inside a CASE that proved `wait_history` JSON:
-- SQLite may run either side of an AND first.
ALTER TABLE `work_items` ADD `wait_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `work_items` ADD `wait_last_until` integer;--> statement-breakpoint
ALTER TABLE `work_items` ADD `wait_last_reason` text;--> statement-breakpoint
ALTER TABLE `work_items` ADD `wait_history_unread` text;--> statement-breakpoint
UPDATE `work_items` SET `wait_history_unread` = CASE WHEN CASE WHEN json_valid(wait_history) THEN coalesce((json_type(wait_history, '$') IN ('object') AND (json_type(wait_history, '$.count') IN ('integer', 'real')) AND (json_type(wait_history, '$.reason') IN ('text')) AND (json_type(wait_history, '$.until') IN ('integer', 'real'))), 0) ELSE 0 END THEN NULL ELSE CAST(`wait_history` AS TEXT) END WHERE `wait_history` IS NOT NULL;--> statement-breakpoint
UPDATE `work_items` SET `wait_count` = coalesce(CASE WHEN json_valid(wait_history) THEN CASE WHEN wait_history_unread IS NULL THEN json_extract(wait_history, '$.count') END END, 0), `wait_last_until` = CASE WHEN json_valid(wait_history) THEN CASE WHEN wait_history_unread IS NULL AND NOT coalesce(wait_until IS NOT NULL AND wait_until = json_extract(wait_history, '$.until') AND wait_reason IS NOT NULL AND wait_reason = json_extract(wait_history, '$.reason'), 0) THEN json_extract(wait_history, '$.until') END END, `wait_last_reason` = CASE WHEN json_valid(wait_history) THEN CASE WHEN wait_history_unread IS NULL AND NOT coalesce(wait_until IS NOT NULL AND wait_until = json_extract(wait_history, '$.until') AND wait_reason IS NOT NULL AND wait_reason = json_extract(wait_history, '$.reason'), 0) THEN json_extract(wait_history, '$.reason') END END WHERE `wait_history` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `work_items` DROP COLUMN `wait_history`;
