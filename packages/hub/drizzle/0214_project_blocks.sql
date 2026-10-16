CREATE TABLE `project_blocks` (
	`project_id` text NOT NULL,
	`page` text NOT NULL,
	`block` text NOT NULL,
	`position` integer NOT NULL,
	`width` text NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`project_id`, `block`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_blocks_page` ON `project_blocks` (`project_id`,`page`);