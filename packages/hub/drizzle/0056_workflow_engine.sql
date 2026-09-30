CREATE TABLE `workflow_run_log` (
	`run_id` text NOT NULL,
	`seq` integer NOT NULL,
	`kind` text NOT NULL,
	`args` text,
	`result` text,
	`failure` text,
	`at` integer NOT NULL,
	PRIMARY KEY(`run_id`, `seq`),
	FOREIGN KEY (`run_id`) REFERENCES `workflow_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `workflow_run_log_run` ON `workflow_run_log` (`run_id`);--> statement-breakpoint
DROP TABLE `workflow_effects`;--> statement-breakpoint
ALTER TABLE `workflow_steps` ADD `spec` text;--> statement-breakpoint
UPDATE `workflow_attempts` SET `ended_at` = CAST(unixepoch('subsec') * 1000 AS INTEGER), `failure` = 'failed' WHERE `ended_at` IS NULL AND `step_id` IN (SELECT `id` FROM `workflow_steps` WHERE `run_id` IN (SELECT `id` FROM `workflow_runs` WHERE `status` IN ('running', 'waiting')));--> statement-breakpoint
UPDATE `workflow_steps` SET `status` = CASE `status` WHEN 'pending' THEN 'skipped' ELSE 'cancelled' END, `ended_at` = CAST(unixepoch('subsec') * 1000 AS INTEGER) WHERE `status` IN ('pending', 'running', 'waiting') AND `run_id` IN (SELECT `id` FROM `workflow_runs` WHERE `status` IN ('running', 'waiting'));--> statement-breakpoint
UPDATE `workflow_runs` SET `status` = 'failed', `failure` = 'The workflow engine was replaced; start the run again.', `ended_at` = CAST(unixepoch('subsec') * 1000 AS INTEGER) WHERE `status` IN ('running', 'waiting');