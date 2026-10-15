-- Where a routine was made and why (routines.ts `create`): the session whose
-- routine_create call made it, the Caw thread its turn was in, what that
-- turn said just before the call, how its notice names that session, and
-- when the notice went. A lead run keeps the thread its wake went to. Rows
-- made before keep null: the hub never heard where they came from, and a
-- routine with no maker is never announced.
ALTER TABLE `routine_runs` ADD `thread_id` text;--> statement-breakpoint
ALTER TABLE `routines` ADD `made_in_instance` text;--> statement-breakpoint
ALTER TABLE `routines` ADD `made_in_thread` text;--> statement-breakpoint
ALTER TABLE `routines` ADD `made_why` text;--> statement-breakpoint
ALTER TABLE `routines` ADD `made_by` text;--> statement-breakpoint
ALTER TABLE `routines` ADD `announced_at` integer;
