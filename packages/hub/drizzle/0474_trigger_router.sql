CREATE TABLE `fleet_trigger_settings` (
	`kind` text PRIMARY KEY NOT NULL,
	`harness` text,
	`model` text,
	`mode` text,
	`account` text,
	FOREIGN KEY (`account`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `held_triggers` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`thing_kind` text NOT NULL,
	`thing_id` text NOT NULL,
	`thing_name` text NOT NULL,
	`what` text NOT NULL,
	`delta` text NOT NULL,
	`who` text NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `held_triggers_project` ON `held_triggers` (`project_id`,`at`);--> statement-breakpoint
CREATE TABLE `project_trigger_settings` (
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`harness` text,
	`model` text,
	`mode` text,
	`account` text,
	PRIMARY KEY(`project_id`, `kind`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null
);
