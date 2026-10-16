CREATE TABLE `view_proposals` (
	`project_id` text NOT NULL,
	`view` text NOT NULL,
	`page` text NOT NULL,
	`position` integer,
	`proposed_by` text NOT NULL,
	`proposed_at` integer NOT NULL,
	PRIMARY KEY(`project_id`, `view`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
