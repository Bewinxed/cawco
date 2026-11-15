-- What a keep-alive ping that missed a session's cache read
-- (`instances.cache_cold`, JSON) is `cache_cold_at` and
-- `cache_cold_reason`: whether the session is measured cold (keep-alive.ts
-- `measuredCold`) is read off the columns.
--
-- Only a ping that read under 90% from its cache wrote a reading, and only a
-- real turn that wrote its cache cleared it (keep-alive.ts
-- `keepAliveResult`). Null is "not measured cold" and stays null in both
-- columns; a reading that reads whole (when, a number; what it read, text)
-- is placed as it is. Nothing is recomputed.
--
-- A reading that is there and does not read whole (not JSON, JSON `null`,
-- not an object, a time that is no number, words that are no text) is kept
-- as stored in `cache_cold_unread`, none of it placed. Its being there says
-- a ping missed the cache since the last real turn, so the session reads as
-- cold: no keep-alive ping goes, a handoff asks before handing it work, and
-- a move counts on no cache carrying, until a real turn warms it or a ping
-- measures it again. Today's reader threw on it. The step before this
-- migration (db/migrate.ts `cache-cold-unread`) logs each by its session and
-- why.
--
-- Every JSON function sits inside a CASE that proved `cache_cold` JSON:
-- SQLite may run either side of an AND first.
ALTER TABLE `instances` ADD `cache_cold_at` integer;--> statement-breakpoint
ALTER TABLE `instances` ADD `cache_cold_reason` text;--> statement-breakpoint
ALTER TABLE `instances` ADD `cache_cold_unread` text;--> statement-breakpoint
UPDATE `instances` SET `cache_cold_unread` = CASE WHEN CASE WHEN json_valid(cache_cold) THEN coalesce((json_type(cache_cold, '$') IN ('object') AND (json_type(cache_cold, '$.at') IN ('integer', 'real')) AND (json_type(cache_cold, '$.reason') IN ('text'))), 0) ELSE 0 END THEN NULL ELSE CAST(`cache_cold` AS TEXT) END WHERE `cache_cold` IS NOT NULL;--> statement-breakpoint
UPDATE `instances` SET `cache_cold_at` = CASE WHEN json_valid(cache_cold) THEN CASE WHEN cache_cold_unread IS NULL THEN json_extract(cache_cold, '$.at') END END, `cache_cold_reason` = CASE WHEN json_valid(cache_cold) THEN CASE WHEN cache_cold_unread IS NULL THEN json_extract(cache_cold, '$.reason') END END WHERE `cache_cold` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `instances` DROP COLUMN `cache_cold`;
