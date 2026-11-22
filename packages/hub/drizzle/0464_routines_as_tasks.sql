-- Routines are tasks (Projects spec §5.5, D9, 2026-11-22): a routine is a
-- task with a trigger. Its definition moves into a task file, which the hub
-- writes as it next starts (routine-carry.ts); its hub state stays here, in
-- `task_triggers`, under the routine's own id, so its runs, event routes,
-- actions, work items' parents, workspaces and sessions' marks name it as
-- they did. Until its task is filed its definition waits in `carried`.
--
-- The built-in Fleet project (D31) holds work tied to no one project: the
-- fleet-wide unused-skills run and every routine that had no project. It is
-- set up on the code template, so no setup page is asked of it.
INSERT OR IGNORE INTO `projects` (`id`, `name`, `template`, `created_at`)
VALUES ('00000000-0000-4000-8000-00000000f1ee', 'Fleet', 'code', CAST(unixepoch('subsec') * 1000 AS INTEGER));
--> statement-breakpoint
CREATE TABLE `task_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`trigger_id` text NOT NULL,
	`slot` text NOT NULL,
	`attempt` integer DEFAULT 1 NOT NULL,
	`state` text NOT NULL,
	`work_item_id` text,
	`instance_id` text,
	`outcome` text,
	`output` text,
	`reason` text,
	`usd` real,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`verdict` text,
	FOREIGN KEY (`trigger_id`) REFERENCES `task_triggers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_runs_slot` ON `task_runs` (`trigger_id`,`slot`,`attempt`);--> statement-breakpoint
CREATE INDEX `task_runs_item` ON `task_runs` (`work_item_id`);--> statement-breakpoint
CREATE TABLE `task_triggers` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text,
	`cron` text,
	`time_zone` text,
	`target` text,
	`stop` text,
	`deadline` integer,
	`daily_cap_usd` real,
	`mode` text,
	`keep` integer DEFAULT false NOT NULL,
	`command` text,
	`approved_command` text,
	`problem` text,
	`enabled` integer DEFAULT true NOT NULL,
	`disabled_reason` text,
	`held` text,
	`asked` text,
	`created_by` text NOT NULL,
	`made_in_instance` text,
	`made_why` text,
	`made_by` text,
	`announced_at` integer,
	`expires_at` integer,
	`last_slot` integer,
	`next_slot` integer,
	`created_at` integer NOT NULL,
	`carried` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_triggers_task` ON `task_triggers` (`project_id`,`task_id`);--> statement-breakpoint
INSERT INTO `task_triggers` (`id`, `project_id`, `task_id`, `cron`, `time_zone`, `target`, `stop`, `deadline`, `daily_cap_usd`, `mode`, `keep`, `command`, `approved_command`, `problem`, `enabled`, `disabled_reason`, `held`, `asked`, `created_by`, `made_in_instance`, `made_why`, `made_by`, `announced_at`, `expires_at`, `last_slot`, `next_slot`, `created_at`, `carried`)
SELECT `id`, coalesce(`project_id`, '00000000-0000-4000-8000-00000000f1ee'), NULL, `cron`, `time_zone`, `target`, `condition`, `deadline`, `daily_cap_usd`, `mode`, `keep`,
	CASE WHEN `target` = 'command' THEN `prompt` END,
	CASE WHEN `target` = 'command' THEN `prompt` END,
	NULL,
	-- A routine met is its task done: its trigger is on again once the task leaves done.
	CASE WHEN `stopped` = 'met' THEN 1 ELSE `enabled` END,
	CASE WHEN `stopped` = 'met' THEN NULL ELSE `disabled_reason` END,
	CASE WHEN `stopped` IN ('deadline', 'failing') THEN `stopped` END,
	NULL, `created_by`, `made_in_instance`, `made_why`, `made_by`, `announced_at`, `expires_at`, `last_slot`, `next_slot`, `created_at`,
	json_object(
		'projectId', `project_id`, 'name', `name`, 'prompt', `prompt`, 'delegateType', `delegate_type`, 'lands', `lands`,
		'budgetUsd', `budget_usd`, 'budgetTurns', `budget_turns`, 'budgetMinutes', `budget_minutes`, 'budgetUnread', `budget_unread`,
		'metAt', `met_at`, 'metBy', `met_by`, 'metEvidence', `met_evidence`
	)
FROM `routines`;
--> statement-breakpoint
-- A run keeps its id; its answer is a routine's three: a met check stopped it, an unmet one kept it going, one that could not tell gave none.
INSERT INTO `task_runs` (`id`, `trigger_id`, `slot`, `attempt`, `state`, `work_item_id`, `instance_id`, `outcome`, `output`, `reason`, `usd`, `started_at`, `ended_at`, `verdict`)
SELECT `id`, `routine_id`, `slot`, `attempt`, `state`, `work_item_id`, `instance_id`, `outcome`, `output`, `reason`, `usd`, `started_at`, `ended_at`,
	CASE `verdict` WHEN 'met' THEN 'stop' WHEN 'unmet' THEN 'keep' END
FROM `routine_runs`;
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text,
	`connection` text NOT NULL,
	`service` text NOT NULL,
	`account` text NOT NULL,
	`tool` text NOT NULL,
	`args` text NOT NULL,
	`args_hash` text NOT NULL,
	`run_at` integer,
	`reason` text NOT NULL,
	`proposed_by` text NOT NULL,
	`routine_id` text,
	`run_id` text,
	`state` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`approved_by` text,
	`approved_at` integer,
	`started_at` integer,
	`ended_at` integer,
	`result` text,
	`error` text,
	`then_stage` text,
	`stage_result` text,
	`checked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`routine_id`) REFERENCES `task_triggers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`run_id`) REFERENCES `task_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_actions`("id", "project_id", "task_id", "connection", "service", "account", "tool", "args", "args_hash", "run_at", "reason", "proposed_by", "routine_id", "run_id", "state", "idempotency_key", "approved_by", "approved_at", "started_at", "ended_at", "result", "error", "then_stage", "stage_result", "checked_at", "created_at") SELECT "id", "project_id", "task_id", "connection", "service", "account", "tool", "args", "args_hash", "run_at", "reason", "proposed_by", "routine_id", "run_id", "state", "idempotency_key", "approved_by", "approved_at", "started_at", "ended_at", "result", "error", "then_stage", "stage_result", "checked_at", "created_at" FROM `actions`;--> statement-breakpoint
DROP TABLE `actions`;--> statement-breakpoint
ALTER TABLE `__new_actions` RENAME TO `actions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `actions_idempotency_key_unique` ON `actions` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `actions_project` ON `actions` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `actions_due` ON `actions` (`state`,`run_at`);--> statement-breakpoint
CREATE TABLE `__new_event_routes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`source` text NOT NULL,
	`author` text,
	`label` text,
	`branch` text,
	`regex` text,
	`routine_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`mode` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`routine_id`) REFERENCES `task_triggers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_event_routes`("id", "project_id", "source", "author", "label", "branch", "regex", "routine_id", "enabled", "mode", "created_by", "created_at") SELECT "id", "project_id", "source", "author", "label", "branch", "regex", "routine_id", "enabled", "mode", "created_by", "created_at" FROM `event_routes`;--> statement-breakpoint
DROP TABLE `event_routes`;--> statement-breakpoint
ALTER TABLE `__new_event_routes` RENAME TO `event_routes`;--> statement-breakpoint
CREATE INDEX `event_routes_project` ON `event_routes` (`project_id`);
--> statement-breakpoint
DROP TABLE `routine_runs`;--> statement-breakpoint
DROP TABLE `routines`;
