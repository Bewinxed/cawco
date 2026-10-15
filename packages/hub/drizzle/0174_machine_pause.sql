-- A machine the owner paused until a time (machine-pause.ts): the hub starts
-- nothing on it until then. And a work item an interrupt holds
-- (work-items.ts `interrupted`): nothing automatic wakes it until its
-- parent, its lead or the reader sends it something.
ALTER TABLE `agents` ADD `paused_until` integer;--> statement-breakpoint
ALTER TABLE `work_items` ADD `held_at` integer;
