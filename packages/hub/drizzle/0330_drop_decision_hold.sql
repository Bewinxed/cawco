-- The decision hold is gone: work that depends on a decision waits on its
-- card before it starts (task-waits.ts), and nothing is held at landing.
-- An item held for picks keeps its stored finish_item and landing time, so
-- the next resume of its machine's landings (work-items.ts
-- `resumeLandings`) runs its merge checks on top of main and lands it.
UPDATE `work_items` SET `landing_phase` = NULL WHERE `landing_phase` = 'held';--> statement-breakpoint
ALTER TABLE `work_items` DROP COLUMN `builds_from`;--> statement-breakpoint
ALTER TABLE `work_items` DROP COLUMN `held_push`;
