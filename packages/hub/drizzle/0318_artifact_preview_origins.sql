-- A machine artifact's preview origin keeps its port across restarts, as a
-- session's and a project's do: preview_ports gains its artifact as a third
-- owner, exactly one of the three per row.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_preview_ports` (
	`port` integer PRIMARY KEY NOT NULL,
	`instance_id` text,
	`project_id` text,
	`artifact_id` text,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "preview_ports_one_owner" CHECK(("instance_id" is not null) + ("project_id" is not null) + ("artifact_id" is not null) = 1)
);
--> statement-breakpoint
INSERT INTO `__new_preview_ports`("port", "instance_id", "project_id", "artifact_id") SELECT "port", "instance_id", "project_id", NULL FROM `preview_ports`;--> statement-breakpoint
DROP TABLE `preview_ports`;--> statement-breakpoint
ALTER TABLE `__new_preview_ports` RENAME TO `preview_ports`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `preview_ports_instance_id_unique` ON `preview_ports` (`instance_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `preview_ports_project_id_unique` ON `preview_ports` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `preview_ports_artifact_id_unique` ON `preview_ports` (`artifact_id`);