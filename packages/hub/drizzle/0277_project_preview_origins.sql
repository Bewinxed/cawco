PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_preview_ports` (
	`port` integer PRIMARY KEY NOT NULL,
	`instance_id` text,
	`project_id` text,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "preview_ports_one_owner" CHECK(("instance_id" is null) <> ("project_id" is null))
);
--> statement-breakpoint
INSERT INTO `__new_preview_ports`("port", "instance_id", "project_id") SELECT "port", "instance_id", NULL FROM `preview_ports`;--> statement-breakpoint
DROP TABLE `preview_ports`;--> statement-breakpoint
ALTER TABLE `__new_preview_ports` RENAME TO `preview_ports`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `preview_ports_instance_id_unique` ON `preview_ports` (`instance_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `preview_ports_project_id_unique` ON `preview_ports` (`project_id`);