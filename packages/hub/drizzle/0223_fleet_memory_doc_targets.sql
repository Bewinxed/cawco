CREATE TABLE `fleet_memory_doc_types` (
	`path` text NOT NULL,
	`type_name` text NOT NULL,
	PRIMARY KEY(`path`, `type_name`),
	FOREIGN KEY (`path`) REFERENCES `fleet_memory_docs`(`path`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `memory_briefings` (
	`instance_id` text NOT NULL,
	`path` text NOT NULL,
	`hash` text NOT NULL,
	`handed_at` integer NOT NULL,
	PRIMARY KEY(`instance_id`, `path`),
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`path`) REFERENCES `fleet_memory_docs`(`path`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `fleet_memory_docs` ADD `model` text;--> statement-breakpoint
ALTER TABLE `fleet_memory_docs` ADD `briefer` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `rules` ADD `scope_role` text;--> statement-breakpoint
ALTER TABLE `rules` ADD `scope_delegate_type` text;--> statement-breakpoint
-- A linked `models/<id>.md` reached the Claude sessions running that model
-- through a SessionStart hook; it now reaches them, on every harness, as a
-- document scoped to that model.
UPDATE `fleet_memory_docs` SET `model` = substr(`path`, 8, length(`path`) - 10) WHERE `path` GLOB 'models/*.md' AND substr(`path`, 8) NOT GLOB '*/*' AND `role` IS NULL AND `path` NOT IN (SELECT `path` FROM `fleet_memory_doc_projects`);
