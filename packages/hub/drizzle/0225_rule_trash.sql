CREATE TABLE `rule_trash` (
	`rule_id` text PRIMARY KEY NOT NULL,
	`scope_project_id` text,
	`rule` text NOT NULL,
	`states` text NOT NULL,
	`deleted_at` integer NOT NULL,
	FOREIGN KEY (`scope_project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
