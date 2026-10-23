CREATE TABLE `session_tasks` (
	`instance_id` text NOT NULL,
	`task_id` text NOT NULL,
	`type` text NOT NULL,
	`description` text NOT NULL,
	`since` integer NOT NULL,
	PRIMARY KEY(`instance_id`, `task_id`),
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade
);
