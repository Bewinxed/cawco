-- Each fact line a task's brief carried (hub memory.ts `contextFor`), one row
-- per brief and line: what the Memory view's use sparklines, a line's briefs
-- and a brief's share of its budget are read from. `fact_uses` keeps only a
-- line's last use.
CREATE TABLE `brief_fact_uses` (
	`project_id` text NOT NULL,
	`task_id` text NOT NULL,
	`title` text NOT NULL,
	`at` integer NOT NULL,
	`path` text NOT NULL,
	`key` text NOT NULL,
	`chars` integer NOT NULL,
	PRIMARY KEY(`project_id`, `task_id`, `at`, `path`, `key`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `brief_fact_uses_project_at` ON `brief_fact_uses` (`project_id`,`at`);
