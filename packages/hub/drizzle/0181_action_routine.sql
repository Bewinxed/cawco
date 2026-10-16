-- An approved action knows the routine run that proposed it (actions.ts
-- `routineRunOf`): null for one proposed outside any routine, and set to null
-- when its routine or run is deleted. drizzle-kit 0.31.11 wrote these without
-- their ON DELETE, which would refuse a routine's delete while an action names it.
ALTER TABLE `actions` ADD `routine_id` text REFERENCES routines(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `actions` ADD `run_id` text REFERENCES routine_runs(id) ON DELETE set null;
