PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_project_starter_sources` (
	`project_id` text NOT NULL,
	`place` text NOT NULL,
	`position` integer NOT NULL,
	`seq` integer NOT NULL,
	`kind` text NOT NULL,
	`ref` text NOT NULL,
	PRIMARY KEY(`project_id`, `place`, `position`, `seq`),
	FOREIGN KEY (`project_id`,`place`,`position`) REFERENCES `project_starters`(`project_id`,`place`,`position`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_project_starter_sources`("project_id", "place", "position", "seq", "kind", "ref") SELECT "project_id", 'board', "position", "seq", "kind", "ref" FROM `project_starter_sources`;--> statement-breakpoint
DROP TABLE `project_starter_sources`;--> statement-breakpoint
ALTER TABLE `__new_project_starter_sources` RENAME TO `project_starter_sources`;--> statement-breakpoint
CREATE TABLE `__new_project_starters` (
	`project_id` text NOT NULL,
	`place` text NOT NULL,
	`position` integer NOT NULL,
	`text` text NOT NULL,
	`glyph` text NOT NULL,
	`reason` text NOT NULL,
	PRIMARY KEY(`project_id`, `place`, `position`),
	FOREIGN KEY (`project_id`,`place`) REFERENCES `project_starter_sets`(`project_id`,`place`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_project_starters`("project_id", "place", "position", "text", "glyph", "reason") SELECT "project_id", 'board', "position", "text", "glyph", "reason" FROM `project_starters`;--> statement-breakpoint
DROP TABLE `project_starters`;--> statement-breakpoint
ALTER TABLE `__new_project_starters` RENAME TO `project_starters`;--> statement-breakpoint
CREATE TABLE `__new_project_starter_sets` (
	`project_id` text NOT NULL,
	`place` text NOT NULL,
	`generated_at` integer NOT NULL,
	`input_hash` text NOT NULL,
	`trigger` text NOT NULL,
	PRIMARY KEY(`project_id`, `place`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_project_starter_sets`("project_id", "place", "generated_at", "input_hash", "trigger") SELECT "project_id", 'board', "generated_at", "input_hash", "trigger" FROM `project_starter_sets`;--> statement-breakpoint
DROP TABLE `project_starter_sets`;--> statement-breakpoint
ALTER TABLE `__new_project_starter_sets` RENAME TO `project_starter_sets`;--> statement-breakpoint
CREATE TABLE `__new_starter_outcomes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`place` text NOT NULL,
	`text` text NOT NULL,
	`outcome` text NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_starter_outcomes`("id", "project_id", "place", "text", "outcome", "at") SELECT "id", "project_id", 'board', "text", "outcome", "at" FROM `starter_outcomes`;--> statement-breakpoint
DROP TABLE `starter_outcomes`;--> statement-breakpoint
ALTER TABLE `__new_starter_outcomes` RENAME TO `starter_outcomes`;--> statement-breakpoint
CREATE INDEX `starter_outcomes_project` ON `starter_outcomes` (`project_id`,`at`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
