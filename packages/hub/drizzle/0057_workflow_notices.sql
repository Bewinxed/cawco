CREATE TABLE `workflow_notices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instance_id` text NOT NULL,
	`run_id` text NOT NULL,
	`body` text NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `workflow_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `workflow_notices_instance` ON `workflow_notices` (`instance_id`);