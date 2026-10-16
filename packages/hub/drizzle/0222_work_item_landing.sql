-- No session declares what the hub runs at finish_item any more: the
-- landing gate (dependency install, lint:changed, typecheck, the iOS build)
-- is the hub's own, so an item keeps no checks. Its marker of a landing in
-- flight is renamed, its value kept, so a hub that restarts mid-landing
-- still resumes it. Written by hand from two prompt-free drizzle-kit passes
-- (a drop, then an add), whose snapshot this migration's is.
ALTER TABLE `work_items` DROP COLUMN `checks`;--> statement-breakpoint
ALTER TABLE `work_items` RENAME COLUMN `checking_since` TO `landing_since`;
