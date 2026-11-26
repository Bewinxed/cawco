-- A project's memory is its rules file (memory.ts, the cut of 2026-11-26):
-- the nightly memory run, its curator role and the inbox's tools are gone.
-- Every memory curator routine goes with its runs, checks and event routes
-- (foreign keys are off while migrations run, so each is deleted here), and
-- so do the runs of the memory inbox and recovery slots, whose labels no
-- build reads. An approved action keeps its row, its routine and run
-- unnamed. The project folders' task files of those routines and memory/
-- are cut once as the hub starts (memory-cut.ts).
UPDATE `actions` SET `run_id` = NULL WHERE `run_id` IN (
	SELECT `id` FROM `task_runs`
	WHERE `trigger_id` IN (SELECT `id` FROM `task_triggers` WHERE `target` = 'curator')
		OR `slot` LIKE 'inbox:%' OR `slot` LIKE 'recovery:%'
);--> statement-breakpoint
UPDATE `actions` SET `routine_id` = NULL WHERE `routine_id` IN (
	SELECT `id` FROM `task_triggers` WHERE `target` = 'curator'
);--> statement-breakpoint
DELETE FROM `task_runs` WHERE `trigger_id` IN (
	SELECT `id` FROM `task_triggers` WHERE `target` = 'curator'
) OR `slot` LIKE 'inbox:%' OR `slot` LIKE 'recovery:%';--> statement-breakpoint
DELETE FROM `task_trigger_checks` WHERE `trigger_id` IN (
	SELECT `id` FROM `task_triggers` WHERE `target` = 'curator'
);--> statement-breakpoint
DELETE FROM `event_routes` WHERE `routine_id` IN (
	SELECT `id` FROM `task_triggers` WHERE `target` = 'curator'
);--> statement-breakpoint
DELETE FROM `task_triggers` WHERE `target` = 'curator';--> statement-breakpoint
-- A curator run's session reads as the delegate it was (roles.ts `roleOf`
-- derives it from its parent), and a spawn owed to one names no role.
UPDATE `instances` SET `role` = NULL WHERE `role` = 'curator';--> statement-breakpoint
UPDATE `instances` SET `owed_spawn` = json_remove(`owed_spawn`, '$.payload.role')
WHERE json_extract(`owed_spawn`, '$.payload.role') = 'curator';--> statement-breakpoint
-- The asks of the memory tools that are gone (a note, its withdrawal, a
-- memory proposal, the run's reads and writes): parked, and kept as records.
DELETE FROM `parked_asks` WHERE json_extract(`envelope`, '$.payload.toolName') IN (
	'mcp__cawco__memory_note', 'mcp__cawco__memory_withdraw', 'mcp__cawco__memory_propose',
	'mcp__cawco__memory_classify', 'mcp__cawco__memory_read', 'mcp__cawco__memory_apply'
);--> statement-breakpoint
DELETE FROM `asks` WHERE json_extract(`kept`, '$.asked.tool') IN (
	'mcp__cawco__memory_note', 'mcp__cawco__memory_withdraw', 'mcp__cawco__memory_propose',
	'mcp__cawco__memory_classify', 'mcp__cawco__memory_read', 'mcp__cawco__memory_apply'
);--> statement-breakpoint
-- A delegate type proposal's parked ask names it as one (core frames.ts
-- `typeProposal`), no longer as a memory proposal.
UPDATE `parked_asks` SET `envelope` = json_set(
	json_remove(`envelope`, '$.payload.memoryProposal'),
	'$.payload.typeProposal',
	json_extract(`envelope`, '$.payload.memoryProposal')
) WHERE json_extract(`envelope`, '$.payload.memoryProposal') IS NOT NULL;--> statement-breakpoint
-- The nightly run's own once-only passes, named per project, are gone.
DELETE FROM `data_migrations` WHERE `name` LIKE 'memory-lesson-tasks-dropped:%' OR `name` LIKE 'memory-ledger-gone:%';--> statement-breakpoint
-- What the nightly run read the person's words by (db/sends.ts `personSaidIn`).
DROP INDEX `sent_messages_origin_time`;
