-- The tasks Caw's message is about are rows (audit R5), indexed by project
-- and task, not a JSON list a query parsed with json_each on every message
-- of the project (db `threadOfTask`). Copied in the list's order (rowid).
CREATE TABLE `thread_message_tasks` (
	`message_id` text NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text NOT NULL,
	PRIMARY KEY(`message_id`, `task_id`),
	FOREIGN KEY (`message_id`) REFERENCES `thread_messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `thread_message_tasks` (`message_id`, `project_id`, `task_id`)
SELECT m.`id`, t.`project_id`, e.value
FROM `thread_messages` m JOIN `project_threads` t ON t.`id` = m.`thread_id`, json_each(m.`tasks`) e
GROUP BY m.`id`, e.value
ORDER BY m.`id`, min(e.key);
--> statement-breakpoint
CREATE INDEX `thread_message_tasks_task` ON `thread_message_tasks` (`project_id`,`task_id`);--> statement-breakpoint
ALTER TABLE `thread_messages` DROP COLUMN `tasks`;
