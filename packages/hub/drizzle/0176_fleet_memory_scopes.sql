CREATE TABLE `fleet_memory_doc_projects` (
	`path` text NOT NULL,
	`project_id` text NOT NULL,
	PRIMARY KEY(`path`, `project_id`),
	FOREIGN KEY (`path`) REFERENCES `fleet_memory_docs`(`path`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `fleet_memory_docs` ADD `role` text;