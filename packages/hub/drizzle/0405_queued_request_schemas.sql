-- A queued delegate's kept call (`queued_work_items.request`, hub
-- stored-types.ts `QueuedRequest`) and a queued attempt's kept ask
-- (`queued_task_starts.asked`, `AttemptAsk`) are read through their schemas
-- from here on, where every read took any JSON (`z.unknown()`) and its
-- reader cast it. Each carries what the start is: its brief, its budget,
-- the types it may start, its outputs, its owned globs.
--
-- A kept value reads as its writers built it (work-items.ts `delegate`
-- through db/project-work.ts `queueWorkItem`, its owned globs to their
-- rows and its task and ids to their columns; dispatch.ts `queuedForOwns`
-- from an `AttemptAsk`): a JSON object whose every key its type declares,
-- its text fields text, its flags true or false, its lists of names lists
-- of text, `inputs` a list, `harness` and `lands` one of their values, a
-- budget an object of `usd`, `turns` and `minutes` numbers, and `prompt`,
-- `title` (and a call's `parentInstanceId`) there. Every row that reads
-- stays as it is.
--
-- A kept value that is there and does not read whole (not JSON, not an
-- object, a field of another kind, a required one missing, or a key its
-- type does not declare, which the read would drop without a word: a
-- budget's `dollars` read as no limit) is never read as what it asked. It
-- is kept as it was stored, in `request_unread` with `request` null, or in
-- `asked_unread` with `asked` null, and the start is held: it never starts,
-- and no row is deleted. A held delegate's parent is told why and may
-- withdraw it (work-items.ts `startQueued`); a held attempt is named with
-- why in its project's dispatch view until a later start or move of its
-- task replaces it (dispatch.ts `drainQueued`). The step before this
-- migration (db/migrate.ts `queued-unread`) logs each such row by its id
-- and reason. Every JSON function sits inside a CASE that proved its
-- argument JSON of the right type.
--
-- `request` loses NOT NULL, so the table is rebuilt; its check keeps
-- exactly one of `request` and `request_unread` set.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_queued_work_items` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_instance_id` text NOT NULL,
	`request` text,
	`request_unread` text,
	`project_id` text,
	`task_id` text,
	`queued_instance_id` text NOT NULL,
	`title` text NOT NULL,
	`queued_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "queued_work_items_request_once" CHECK(("request" IS NULL) <> ("request_unread" IS NULL))
);
--> statement-breakpoint
INSERT INTO `__new_queued_work_items`("id", "parent_instance_id", "request", "request_unread", "project_id", "task_id", "queued_instance_id", "title", "queued_at") SELECT "id", "parent_instance_id", CASE WHEN "reads" THEN "request" END, CASE WHEN "reads" THEN NULL ELSE CAST("request" AS TEXT) END, "project_id", "task_id", "queued_instance_id", "title", "queued_at" FROM (SELECT *, CASE WHEN json_valid(`request`) THEN CASE WHEN json_type(`request`) = 'object' THEN coalesce(NOT EXISTS (SELECT 1 FROM json_each(`request`) e WHERE e.key NOT IN ('account', 'budget', 'clean', 'cwd', 'fork', 'from', 'group', 'harness', 'host', 'inputs', 'lands', 'machineId', 'mayStart', 'model', 'outputs', 'parentInstanceId', 'prompt', 'skills', 'title', 'type', 'workspace')) AND (CASE WHEN json_type(`request`, '$.account') IS NULL THEN 1 ELSE json_type(`request`, '$.account') = 'text' END) AND (CASE WHEN json_type(`request`, '$.budget') IS NULL THEN 1 WHEN json_type(`request`, '$.budget') = 'object' THEN NOT EXISTS (SELECT 1 FROM json_each(`request`, '$.budget') e WHERE e.key NOT IN ('usd', 'turns', 'minutes') OR e.type NOT IN ('integer', 'real')) ELSE 0 END) AND (CASE WHEN json_type(`request`, '$.clean') IS NULL THEN 1 ELSE json_type(`request`, '$.clean') IN ('true', 'false') END) AND (CASE WHEN json_type(`request`, '$.cwd') IS NULL THEN 1 ELSE json_type(`request`, '$.cwd') = 'text' END) AND (CASE WHEN json_type(`request`, '$.fork') IS NULL THEN 1 ELSE json_type(`request`, '$.fork') IN ('true', 'false') END) AND (CASE WHEN json_type(`request`, '$.from') IS NULL THEN 1 ELSE json_type(`request`, '$.from') = 'text' END) AND (CASE WHEN json_type(`request`, '$.group') IS NULL THEN 1 ELSE json_type(`request`, '$.group') = 'text' END) AND (CASE WHEN json_type(`request`, '$.harness') IS NULL THEN 1 WHEN json_type(`request`, '$.harness') = 'text' THEN json_extract(`request`, '$.harness') IN ('claude', 'opencode', 'pi') ELSE 0 END) AND (CASE WHEN json_type(`request`, '$.host') IS NULL THEN 1 ELSE json_type(`request`, '$.host') IN ('true', 'false') END) AND (CASE WHEN json_type(`request`, '$.inputs') IS NULL THEN 1 ELSE json_type(`request`, '$.inputs') = 'array' END) AND (CASE WHEN json_type(`request`, '$.lands') IS NULL THEN 1 WHEN json_type(`request`, '$.lands') = 'text' THEN json_extract(`request`, '$.lands') IN ('main', 'branch', 'pr', 'none') ELSE 0 END) AND (CASE WHEN json_type(`request`, '$.machineId') IS NULL THEN 1 ELSE json_type(`request`, '$.machineId') = 'text' END) AND (CASE WHEN json_type(`request`, '$.mayStart') IS NULL THEN 1 WHEN json_type(`request`, '$.mayStart') = 'array' THEN NOT EXISTS (SELECT 1 FROM json_each(`request`, '$.mayStart') e WHERE e.type <> 'text') ELSE 0 END) AND (CASE WHEN json_type(`request`, '$.model') IS NULL THEN 1 ELSE json_type(`request`, '$.model') = 'text' END) AND (CASE WHEN json_type(`request`, '$.outputs') IS NULL THEN 1 WHEN json_type(`request`, '$.outputs') = 'array' THEN NOT EXISTS (SELECT 1 FROM json_each(`request`, '$.outputs') e WHERE e.type <> 'text') ELSE 0 END) AND (CASE WHEN json_type(`request`, '$.parentInstanceId') IS NULL THEN 0 ELSE json_type(`request`, '$.parentInstanceId') = 'text' END) AND (CASE WHEN json_type(`request`, '$.prompt') IS NULL THEN 0 ELSE json_type(`request`, '$.prompt') = 'text' END) AND (CASE WHEN json_type(`request`, '$.skills') IS NULL THEN 1 WHEN json_type(`request`, '$.skills') = 'array' THEN NOT EXISTS (SELECT 1 FROM json_each(`request`, '$.skills') e WHERE e.type <> 'text') ELSE 0 END) AND (CASE WHEN json_type(`request`, '$.title') IS NULL THEN 0 ELSE json_type(`request`, '$.title') = 'text' END) AND (CASE WHEN json_type(`request`, '$.type') IS NULL THEN 1 ELSE json_type(`request`, '$.type') = 'text' END) AND (CASE WHEN json_type(`request`, '$.workspace') IS NULL THEN 1 ELSE json_type(`request`, '$.workspace') = 'text' END), 0) ELSE 0 END ELSE 0 END AS "reads" FROM `queued_work_items`);--> statement-breakpoint
DROP TABLE `queued_work_items`;--> statement-breakpoint
ALTER TABLE `__new_queued_work_items` RENAME TO `queued_work_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `queued_task_starts` ADD `asked_unread` text;--> statement-breakpoint
UPDATE `queued_task_starts` SET `asked_unread` = CAST(`asked` AS TEXT), `asked` = NULL WHERE `asked` IS NOT NULL AND NOT (CASE WHEN json_valid(`asked`) THEN CASE WHEN json_type(`asked`) = 'object' THEN coalesce(NOT EXISTS (SELECT 1 FROM json_each(`asked`) e WHERE e.key NOT IN ('account', 'budget', 'fork', 'from', 'group', 'harness', 'inputs', 'lands', 'mayStart', 'model', 'outputs', 'owns', 'prompt', 'skills', 'title', 'type')) AND (CASE WHEN json_type(`asked`, '$.account') IS NULL THEN 1 ELSE json_type(`asked`, '$.account') = 'text' END) AND (CASE WHEN json_type(`asked`, '$.budget') IS NULL THEN 1 WHEN json_type(`asked`, '$.budget') = 'object' THEN NOT EXISTS (SELECT 1 FROM json_each(`asked`, '$.budget') e WHERE e.key NOT IN ('usd', 'turns', 'minutes') OR e.type NOT IN ('integer', 'real')) ELSE 0 END) AND (CASE WHEN json_type(`asked`, '$.fork') IS NULL THEN 1 ELSE json_type(`asked`, '$.fork') IN ('true', 'false') END) AND (CASE WHEN json_type(`asked`, '$.from') IS NULL THEN 1 ELSE json_type(`asked`, '$.from') = 'text' END) AND (CASE WHEN json_type(`asked`, '$.group') IS NULL THEN 1 ELSE json_type(`asked`, '$.group') = 'text' END) AND (CASE WHEN json_type(`asked`, '$.harness') IS NULL THEN 1 WHEN json_type(`asked`, '$.harness') = 'text' THEN json_extract(`asked`, '$.harness') IN ('claude', 'opencode', 'pi') ELSE 0 END) AND (CASE WHEN json_type(`asked`, '$.inputs') IS NULL THEN 1 ELSE json_type(`asked`, '$.inputs') = 'array' END) AND (CASE WHEN json_type(`asked`, '$.lands') IS NULL THEN 1 WHEN json_type(`asked`, '$.lands') = 'text' THEN json_extract(`asked`, '$.lands') IN ('main', 'branch', 'pr', 'none') ELSE 0 END) AND (CASE WHEN json_type(`asked`, '$.mayStart') IS NULL THEN 1 WHEN json_type(`asked`, '$.mayStart') = 'array' THEN NOT EXISTS (SELECT 1 FROM json_each(`asked`, '$.mayStart') e WHERE e.type <> 'text') ELSE 0 END) AND (CASE WHEN json_type(`asked`, '$.model') IS NULL THEN 1 ELSE json_type(`asked`, '$.model') = 'text' END) AND (CASE WHEN json_type(`asked`, '$.outputs') IS NULL THEN 1 WHEN json_type(`asked`, '$.outputs') = 'array' THEN NOT EXISTS (SELECT 1 FROM json_each(`asked`, '$.outputs') e WHERE e.type <> 'text') ELSE 0 END) AND (CASE WHEN json_type(`asked`, '$.owns') IS NULL THEN 1 WHEN json_type(`asked`, '$.owns') = 'array' THEN NOT EXISTS (SELECT 1 FROM json_each(`asked`, '$.owns') e WHERE e.type <> 'text') ELSE 0 END) AND (CASE WHEN json_type(`asked`, '$.prompt') IS NULL THEN 0 ELSE json_type(`asked`, '$.prompt') = 'text' END) AND (CASE WHEN json_type(`asked`, '$.skills') IS NULL THEN 1 WHEN json_type(`asked`, '$.skills') = 'array' THEN NOT EXISTS (SELECT 1 FROM json_each(`asked`, '$.skills') e WHERE e.type <> 'text') ELSE 0 END) AND (CASE WHEN json_type(`asked`, '$.title') IS NULL THEN 0 ELSE json_type(`asked`, '$.title') = 'text' END) AND (CASE WHEN json_type(`asked`, '$.type') IS NULL THEN 1 ELSE json_type(`asked`, '$.type') = 'text' END), 0) ELSE 0 END ELSE 0 END);