-- Areas (core areas.ts): a group a project sits in, carrying the settings
-- the fleet carries; each project takes its area's where it sets none.
CREATE TABLE `areas` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`account` text,
	`account_at_limit` text DEFAULT 'wait' NOT NULL,
	`caw_mode` text,
	`cap_usd` real,
	`cap_period` text,
	`on_cap` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `connection_areas` (
	`connection_id` text NOT NULL,
	`area_id` text NOT NULL,
	PRIMARY KEY(`connection_id`, `area_id`),
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `connection_areas_area` ON `connection_areas` (`area_id`);--> statement-breakpoint
CREATE TABLE `fleet_memory_doc_areas` (
	`path` text NOT NULL,
	`area_id` text NOT NULL,
	PRIMARY KEY(`path`, `area_id`),
	FOREIGN KEY (`path`) REFERENCES `fleet_memory_docs`(`path`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- The area a project sits in; deleting the area ungroups it.
ALTER TABLE `projects` ADD `area_id` text REFERENCES areas(id) ON DELETE set null;--> statement-breakpoint
-- The area a rule fires in; the rule goes with its area.
ALTER TABLE `rules` ADD `scope_area_id` text REFERENCES areas(id) ON DELETE cascade;