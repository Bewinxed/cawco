-- A task's wait on a pull request closed unmerged, or on an Actions run gone
-- red, told to the person once: one row per task and wait while it stays
-- flagged, so the hub's next look tells no one again. Empty at first: the
-- flags standing now are told once on their project's next look.
CREATE TABLE `task_wait_flags` (
	`project_id` text NOT NULL,
	`task_id` text NOT NULL,
	`target` text NOT NULL,
	`told_at` integer NOT NULL,
	PRIMARY KEY(`project_id`, `task_id`, `target`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
