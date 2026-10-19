-- The Memory view (hub memory-view.ts). `brief_fact_uses`: each fact line a
-- task's brief carried (memory.ts `contextFor`), one row per brief and line,
-- with the room the brief had for fact lines (its budget less AGENTS.md and
-- the named brand files): the use sparklines, a line's briefs and In briefs.
-- `project_threads.notes`: the project's one standing notes thread, where
-- every note made from the Memory view lands (caw.ts `noteInStanding`).
CREATE TABLE `brief_fact_uses` (
	`project_id` text NOT NULL,
	`task_id` text NOT NULL,
	`title` text NOT NULL,
	`at` integer NOT NULL,
	`path` text NOT NULL,
	`key` text NOT NULL,
	`chars` integer NOT NULL,
	`room` integer NOT NULL,
	PRIMARY KEY(`project_id`, `task_id`, `at`, `path`, `key`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `brief_fact_uses_project_at` ON `brief_fact_uses` (`project_id`,`at`);--> statement-breakpoint
ALTER TABLE `project_threads` ADD `notes` integer DEFAULT false NOT NULL;