-- The landing gate and Ship are gone (the owner, 2026-11-17: "literally each
-- project and each agent decides this"): the hub lands by rebase and push
-- alone, so nothing records a gate's passes or the checks a landing passed,
-- a pause counts no merge checks, and nothing reads the repository a gate
-- clone or a Ship command was cut from.
--
-- A landing a hub stopped while it was gating runs again from its first
-- step (landing.ts: running it again is safe), so its phase is cleared.
-- `workspaces.checks_for` stays: this release closes the gate clones it
-- names as their machines register (workspaces.ts `closeGateClones`), and
-- the next release's migration drops it.
UPDATE `work_items` SET `landing_phase` = NULL WHERE `landing_phase` = 'gating';--> statement-breakpoint
DROP TABLE `project_repositories`;--> statement-breakpoint
DROP TABLE `work_item_gate_passes`;--> statement-breakpoint
DROP TABLE `work_item_landed_checks`;--> statement-breakpoint
DROP INDEX `work_items_landed_gate_tree`;--> statement-breakpoint
ALTER TABLE `work_items` DROP COLUMN `gate_passes_unread`;--> statement-breakpoint
ALTER TABLE `work_items` DROP COLUMN `landed_gate_tree`;--> statement-breakpoint
ALTER TABLE `agents` DROP COLUMN `pause_stopped_merge_checks`;
