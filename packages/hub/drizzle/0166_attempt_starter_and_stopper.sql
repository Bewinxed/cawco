-- A failed or cancelled attempt is the business of whoever started it, never
-- the person's Needs you. `by_person` marks the work a person started himself
-- (an attempt he started or retried from the dashboard, or that his own move
-- into a `runs:` stage started): only its failure reaches his phone.
-- `stopped_by` keeps who stopped a cancelled item, so its task says
-- "Stopped by <who>". Items from before keep neither: false, and no stopper.
ALTER TABLE `work_items` ADD `by_person` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `work_items` ADD `stopped_by` text;
