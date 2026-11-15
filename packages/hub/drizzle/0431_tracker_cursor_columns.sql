-- Where a tracker binding's poll stands (`tracker_bindings.cursor`, JSON)
-- is `issues_since`, `issues_etag`, `comments_since` and `comments_etag`
-- (db/trackers.ts).
--
-- The cursor was NOT NULL. A list (issues, or their comments) whose
-- `since` (a number) and ETag (text or null) read is placed as it is,
-- whether or not the other list reads.
--
-- A cursor that is there and does not read whole is kept as stored in
-- `cursor_unread`. A list of it that does not read starts again from when
-- the project was bound (`bound_at`, the cursor every binding starts at)
-- with no ETag: its next poll reads again what it may already have read
-- and skips nothing. The next poll that goes through writes the cursor and
-- clears it. Today's reader threw on it. The step before this migration
-- (db/migrate.ts `tracker-cursors-unread`) logs each by its row and why.
--
-- `issues_since` and `comments_since` are NOT NULL, so the table is
-- rebuilt; the values are read in the INSERT. Every JSON function sits
-- inside a CASE that proved `cursor` JSON: SQLite may run either side of an
-- AND first.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tracker_bindings` (
	`project_id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`connection` text NOT NULL,
	`target` text NOT NULL,
	`target_name` text NOT NULL,
	`target_url` text NOT NULL,
	`bound_at` integer NOT NULL,
	`issues_since` integer NOT NULL,
	`issues_etag` text,
	`comments_since` integer NOT NULL,
	`comments_etag` text,
	`cursor_unread` text,
	`state` text NOT NULL,
	`reason` text,
	`polled_at` integer,
	`resume_at` integer,
	`github_project` text,
	`github_project_reason` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_tracker_bindings`("project_id", "provider", "connection", "target", "target_name", "target_url", "bound_at", "issues_since", "issues_etag", "comments_since", "comments_etag", "cursor_unread", "state", "reason", "polled_at", "resume_at", "github_project", "github_project_reason") SELECT "project_id", "provider", "connection", "target", "target_name", "target_url", "bound_at", CASE WHEN "issues_read" THEN CASE WHEN json_valid(`cursor`) THEN json_extract(`cursor`, '$.since') END ELSE "bound_at" END, CASE WHEN "issues_read" THEN CASE WHEN json_valid(`cursor`) THEN json_extract(`cursor`, '$.etag') END END, CASE WHEN "comments_read" THEN CASE WHEN json_valid(`cursor`) THEN json_extract(`cursor`, '$.commentsSince') END ELSE "bound_at" END, CASE WHEN "comments_read" THEN CASE WHEN json_valid(`cursor`) THEN json_extract(`cursor`, '$.commentsEtag') END END, CASE WHEN CASE WHEN json_valid(cursor) THEN coalesce((json_type(cursor, '$') IN ('object') AND (json_type(cursor, '$.since') IN ('integer', 'real')) AND (json_type(cursor, '$.etag') IN ('text', 'null')) AND (json_type(cursor, '$.commentsSince') IN ('integer', 'real')) AND (json_type(cursor, '$.commentsEtag') IN ('text', 'null'))), 0) ELSE 0 END THEN NULL ELSE CAST(`cursor` AS TEXT) END, "state", "reason", "polled_at", "resume_at", "github_project", "github_project_reason" FROM (SELECT *, CASE WHEN json_valid(cursor) THEN coalesce((json_type(cursor, '$') IN ('object') AND (json_type(cursor, '$.since') IN ('integer', 'real')) AND (json_type(cursor, '$.etag') IN ('text', 'null'))), 0) ELSE 0 END AS "issues_read", CASE WHEN json_valid(cursor) THEN coalesce((json_type(cursor, '$') IN ('object') AND (json_type(cursor, '$.commentsSince') IN ('integer', 'real')) AND (json_type(cursor, '$.commentsEtag') IN ('text', 'null'))), 0) ELSE 0 END AS "comments_read" FROM `tracker_bindings`);--> statement-breakpoint
DROP TABLE `tracker_bindings`;--> statement-breakpoint
ALTER TABLE `__new_tracker_bindings` RENAME TO `tracker_bindings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;