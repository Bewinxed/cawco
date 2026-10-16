CREATE TABLE `project_starter_sets` (
	`project_id` text PRIMARY KEY NOT NULL,
	`generated_at` integer NOT NULL,
	`input_hash` text NOT NULL,
	`trigger` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `project_starter_sources` (
	`project_id` text NOT NULL,
	`position` integer NOT NULL,
	`seq` integer NOT NULL,
	`kind` text NOT NULL,
	`ref` text NOT NULL,
	PRIMARY KEY(`project_id`, `position`, `seq`),
	FOREIGN KEY (`project_id`,`position`) REFERENCES `project_starters`(`project_id`,`position`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `project_starters` (
	`project_id` text NOT NULL,
	`position` integer NOT NULL,
	`text` text NOT NULL,
	`glyph` text NOT NULL,
	`reason` text NOT NULL,
	PRIMARY KEY(`project_id`, `position`),
	FOREIGN KEY (`project_id`) REFERENCES `project_starter_sets`(`project_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `starter_outcomes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`text` text NOT NULL,
	`outcome` text NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `starter_outcomes_project` ON `starter_outcomes` (`project_id`,`at`);