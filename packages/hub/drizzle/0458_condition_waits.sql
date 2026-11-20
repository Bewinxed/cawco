-- Condition waits: a routine may carry a condition, a statement true once
-- met, which tasks and plan steps wait on (`routine:<id>`). Its deadline is
-- when the hub stops checking it unmet (null: never); met_at, met_by and
-- met_evidence say when, who (a run's id, or owner) and on what it was met;
-- stopped says why the hub turned its checks off (met, deadline, failing).
-- A run of it keeps its verdict (met, unmet, unknown). Null on every row
-- already kept: none of them is a condition.
ALTER TABLE `routine_runs` ADD `verdict` text;--> statement-breakpoint
ALTER TABLE `routines` ADD `condition` text;--> statement-breakpoint
ALTER TABLE `routines` ADD `deadline` integer;--> statement-breakpoint
ALTER TABLE `routines` ADD `met_at` integer;--> statement-breakpoint
ALTER TABLE `routines` ADD `met_by` text;--> statement-breakpoint
ALTER TABLE `routines` ADD `met_evidence` text;--> statement-breakpoint
ALTER TABLE `routines` ADD `stopped` text;