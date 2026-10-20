-- The person's changes to a session's plan, one row each, in their words
-- (core plan.ts PlanChange, hub plan-changes.ts): what the plan shows of
-- them, and what is still owed to whoever the plan answers to.
CREATE TABLE `plan_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text NOT NULL,
	`receiver` text NOT NULL,
	`kind` text NOT NULL,
	`step` text NOT NULL,
	`was` text NOT NULL,
	`words` text NOT NULL,
	`at` integer NOT NULL,
	`told_at` integer,
	`sent_uuid` text,
	`settled` integer DEFAULT false NOT NULL,
	`undelivered` text
);
--> statement-breakpoint
CREATE INDEX `plan_changes_instance` ON `plan_changes` (`instance_id`,`at`);--> statement-breakpoint
CREATE INDEX `plan_changes_receiver` ON `plan_changes` (`receiver`,`told_at`);