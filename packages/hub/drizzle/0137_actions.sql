CREATE TABLE `actions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text,
	`connection` text NOT NULL,
	`service` text NOT NULL,
	`account` text NOT NULL,
	`tool` text NOT NULL,
	`args` text NOT NULL,
	`args_hash` text NOT NULL,
	`run_at` integer,
	`reason` text NOT NULL,
	`proposed_by` text NOT NULL,
	`state` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`approved_by` text,
	`approved_at` integer,
	`started_at` integer,
	`ended_at` integer,
	`result` text,
	`error` text,
	`then_stage` text,
	`stage_result` text,
	`checked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `actions_idempotency_key_unique` ON `actions` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `actions_project` ON `actions` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `actions_due` ON `actions` (`state`,`run_at`);