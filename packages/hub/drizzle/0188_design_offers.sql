CREATE TABLE `design_offers` (
	`project_id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`offered_at` integer NOT NULL,
	`answer` text,
	`answered_at` integer,
	`built_task_id` text
);
