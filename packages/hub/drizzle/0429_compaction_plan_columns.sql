-- A compaction plan's kind (`kind`: a move's, `move`, or a filing's at
-- the threshold, `fill`) is a column, in place of which of `move` and
-- `fill` was set, and 0410's `move_kind` goes: a plan's move is always a
-- `moved` line (limit-decision.ts `compactedLine`), so the plan's kind says
-- the line's. What the hub decides a move by are columns:
-- `move_to_account_id` (the line's `to`'s id), `move_compact_first`,
-- `move_asked` and `move_refused` (its `because` is `refused`); `move`
-- keeps the rest of the line, which each stage restates, and the row
-- mapper puts them back (db/at-limit.ts). A filing's reading is
-- `fill_compacts_at` and `fill_tokens`.
--
-- A move that reads whole as a `moved` line (its kind `moved`, the rest of
-- it as core `AccountMove` says) is placed as it is: those four in their
-- columns, the rest in `move` but for them. A filing's reading that reads
-- whole (core `ContextFill`) is placed as it is. A plan's move or reading
-- never set stays null.
--
-- A move that is there and does not read whole (a line of another kind,
-- one missing a field or with a field of another type) is kept in
-- `move_unread`, its kind put back, nothing of it placed; one 0410 kept
-- there stays. A filing's reading that is there and does not read whole,
-- or sits beside a move, is kept as stored in `fill_unread`, nothing of it
-- placed. Either plan reads as none, as 0410's did: it drives no move and
-- holds nothing back. Today's reader threw on both. A put of the session's
-- plan clears both. The step before this migration (db/migrate.ts
-- `compaction-plans-unread`) logs each by its row and why.
--
-- `kind` is NOT NULL with a check, so the table is rebuilt; the values are
-- read in the INSERT. Every JSON function sits inside a CASE that proved
-- its column JSON: SQLite may run either side of an AND first.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_limit_compactions` (
	`instance_id` text PRIMARY KEY NOT NULL,
	`stage` text NOT NULL,
	`line_id` text NOT NULL,
	`kind` text NOT NULL,
	`move` text,
	`move_to_account_id` text,
	`move_compact_first` integer,
	`move_asked` integer,
	`move_refused` integer,
	`move_unread` text,
	`fill_compacts_at` integer,
	`fill_tokens` integer,
	`fill_unread` text,
	`records` text,
	`carry_uuid` text,
	`filing_uuid` text NOT NULL,
	`compact_uuid` text,
	`compacted` integer DEFAULT false NOT NULL,
	`ended_step` text,
	`created_at` integer NOT NULL,
	CONSTRAINT "limit_compactions_kind" CHECK("kind" in ('move', 'fill'))
);
--> statement-breakpoint
INSERT INTO `__new_limit_compactions`("instance_id", "stage", "line_id", "kind", "move", "move_to_account_id", "move_compact_first", "move_asked", "move_refused", "move_unread", "fill_compacts_at", "fill_tokens", "fill_unread", "records", "carry_uuid", "filing_uuid", "compact_uuid", "compacted", "ended_step", "created_at") SELECT "instance_id", "stage", "line_id", CASE WHEN move IS NOT NULL OR move_unread IS NOT NULL THEN 'move' WHEN fill IS NOT NULL THEN 'fill' WHEN compact_uuid IS NOT NULL THEN 'move' ELSE 'fill' END, CASE WHEN json_valid(move) THEN CASE WHEN move_reads THEN CASE WHEN json_extract(move, '$.because.kind') = 'refused' THEN json_remove(move, '$.to.id', '$.compactFirst', '$.asked', '$.because') ELSE json_remove(move, '$.to.id', '$.compactFirst', '$.asked') END END END, CASE WHEN json_valid(move) THEN CASE WHEN move_reads THEN json_extract(move, '$.to.id') END END, CASE WHEN json_valid(move) THEN CASE WHEN move_reads THEN coalesce(json_type(move, '$.compactFirst') = 'true', 0) END END, CASE WHEN json_valid(move) THEN CASE WHEN move_reads THEN coalesce(json_type(move, '$.asked') = 'true', 0) END END, CASE WHEN json_valid(move) THEN CASE WHEN move_reads THEN coalesce(json_extract(move, '$.because.kind') = 'refused', 0) END END, CASE WHEN move_unread IS NOT NULL THEN move_unread WHEN move IS NULL OR move_reads THEN NULL WHEN json_valid(move) THEN CASE WHEN json_type(move) = 'object' THEN json_set(move, '$.kind', move_kind) ELSE CAST(move AS TEXT) END ELSE CAST(move AS TEXT) END, CASE WHEN json_valid(fill) THEN CASE WHEN fill_reads THEN json_extract(fill, '$.compactsAt') END END, CASE WHEN json_valid(fill) THEN CASE WHEN fill_reads THEN json_extract(fill, '$.tokens') END END, CASE WHEN fill IS NULL OR fill_reads THEN NULL ELSE CAST(fill AS TEXT) END, "records", "carry_uuid", "filing_uuid", "compact_uuid", "compacted", "ended_step", "created_at" FROM (SELECT *, CASE WHEN move_unread IS NULL THEN CASE WHEN move_kind = 'moved' THEN CASE WHEN json_valid(move) THEN coalesce((json_type(move, '$') IN ('object') AND (json_type(move, '$.from') IN ('object') AND (json_type(move, '$.from.hue') IN ('text') AND (json_type(move, '$.from.hue') = 'text' AND json_extract(move, '$.from.hue') IN ('amber', 'blue', 'cyan', 'green', 'orange', 'rose', 'violet'))) AND (json_type(move, '$.from.id') IN ('text')) AND (json_type(move, '$.from.name') IN ('text'))) AND (json_type(move, '$.to') IN ('object') AND (json_type(move, '$.to.hue') IN ('text') AND (json_type(move, '$.to.hue') = 'text' AND json_extract(move, '$.to.hue') IN ('amber', 'blue', 'cyan', 'green', 'orange', 'rose', 'violet'))) AND (json_type(move, '$.to.id') IN ('text')) AND (json_type(move, '$.to.name') IN ('text'))) AND (json_type(move, '$.sameOrganization') IN ('true', 'false')) AND (json_type(move, '$.tokens') IN ('integer', 'real', 'null')) AND (json_type(move, '$.window') IN ('text', 'null')) AND (json_type(move, '$.resetsAt') IN ('integer', 'real', 'null')) AND (json_type(move, '$.asked') IS NULL OR (json_type(move, '$.asked') IN ('true', 'false') AND json_type(move, '$.asked') = 'true')) AND (json_type(move, '$.removed') IS NULL OR (json_type(move, '$.removed') IN ('true', 'false') AND json_type(move, '$.removed') = 'true')) AND (json_type(move, '$.signedOut') IS NULL OR (json_type(move, '$.signedOut') IN ('true', 'false') AND json_type(move, '$.signedOut') = 'true')) AND (json_type(move, '$.signedOutOn') IS NULL OR (json_type(move, '$.signedOutOn') IN ('text'))) AND (json_type(move, '$.compact') IS NULL OR (json_type(move, '$.compact') IN ('text') AND (json_type(move, '$.compact') = 'text' AND json_extract(move, '$.compact') IN ('filing', 'compacting', 'compacted', 'stopped')))) AND (json_type(move, '$.compactFirst') IS NULL OR (json_type(move, '$.compactFirst') IN ('true', 'false') AND json_type(move, '$.compactFirst') = 'true')) AND (json_type(move, '$.compactBy') IS NULL OR (json_type(move, '$.compactBy') IN ('text') AND (json_type(move, '$.compactBy') = 'text' AND json_extract(move, '$.compactBy') IN ('opencode', 'pi')))) AND (json_type(move, '$.summaryRefused') IS NULL OR (json_type(move, '$.summaryRefused') IN ('text'))) AND (json_type(move, '$.relaunched') IS NULL OR (json_type(move, '$.relaunched') IN ('true', 'false') AND json_type(move, '$.relaunched') = 'true')) AND (json_type(move, '$.because') IS NULL OR ((json_type(move, '$.because') IN ('object') AND (json_type(move, '$.because.kind') IN ('text') AND (json_type(move, '$.because.kind') = 'text' AND json_extract(move, '$.because.kind') = 'forecast')) AND (json_type(move, '$.because.runsOutAt') IN ('integer', 'real'))) OR (json_type(move, '$.because') IN ('object') AND (json_type(move, '$.because.kind') IN ('text') AND (json_type(move, '$.because.kind') = 'text' AND json_extract(move, '$.because.kind') = 'cold')) AND (json_type(move, '$.because.wake') IN ('true', 'false'))) OR (json_type(move, '$.because') IN ('object') AND (json_type(move, '$.because.kind') IN ('text') AND (json_type(move, '$.because.kind') = 'text' AND json_extract(move, '$.because.kind') = 'refused'))) OR (json_type(move, '$.because') IN ('object') AND (json_type(move, '$.because.kind') IN ('text') AND (json_type(move, '$.because.kind') = 'text' AND json_extract(move, '$.because.kind') = 'extra-usage'))))) AND (json_type(move, '$.cost') IS NULL OR (json_type(move, '$.cost') IN ('object') AND (json_type(move, '$.cost.pct') IN ('integer', 'real')) AND (json_type(move, '$.cost.window') IN ('text')))) AND (json_type(move, '$.ended') IS NULL OR (json_type(move, '$.ended') IN ('object') AND (json_type(move, '$.ended.tasks') IN ('integer', 'real')) AND (json_type(move, '$.ended.wakeups') IN ('integer', 'real'))))), 0) ELSE 0 END ELSE 0 END ELSE 0 END AS move_reads, CASE WHEN move IS NULL AND move_unread IS NULL THEN CASE WHEN json_valid(fill) THEN coalesce((json_type(fill, '$') IN ('object') AND (json_type(fill, '$.compactsAt') IN ('integer', 'real')) AND (json_type(fill, '$.tokens') IN ('integer', 'real'))), 0) ELSE 0 END ELSE 0 END AS fill_reads FROM `limit_compactions`);--> statement-breakpoint
DROP TABLE `limit_compactions`;--> statement-breakpoint
ALTER TABLE `__new_limit_compactions` RENAME TO `limit_compactions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;