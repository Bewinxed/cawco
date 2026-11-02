PRAGMA foreign_keys=OFF;--> statement-breakpoint
-- An artifact's preview origin has an identity of its own (`origin`), which
-- its row points at, so a held next version's origin can be handed to its
-- artifact as the parent opens it without renaming anything: its port, its
-- host-mode label, its passes and its machine's listener stay keyed by it
-- (hub server.ts `endArtifactOrigin`, db/artifacts.ts `handOrigin`). Every
-- row standing gets its own id as its origin, so each origin open now keeps
-- its key (`embed-<id>`), and with it its port and address.
CREATE TABLE `__new_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text,
	`made_by` text,
	`held_for` text,
	`origin` text NOT NULL,
	`project_id` text,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`does` text DEFAULT 'judge' NOT NULL,
	`ask` text DEFAULT '' NOT NULL,
	`composer` integer DEFAULT false NOT NULL,
	`machine_id` text,
	`source_page` text,
	`source_dir` text,
	`source_port` integer,
	`source_path` text,
	`source_workspace` text,
	`source_place` text,
	`source_stage_dir` text,
	`source_stage_file` text,
	`source_serve_command` text,
	`source_serve_cwd` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`seq` integer DEFAULT 0 NOT NULL,
	`delivered_seq` integer DEFAULT 0 NOT NULL,
	`read_seq` integer DEFAULT 0 NOT NULL,
	`opened_revision` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`shown_at` integer,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`made_by`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`held_for`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_workspace`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_artifacts`("id", "instance_id", "made_by", "held_for", "origin", "project_id", "kind", "name", "does", "ask", "composer", "machine_id", "source_page", "source_dir", "source_port", "source_path", "source_workspace", "source_place", "source_stage_dir", "source_stage_file", "source_serve_command", "source_serve_cwd", "revision", "seq", "delivered_seq", "read_seq", "opened_revision", "created_at", "updated_at", "shown_at") SELECT "id", "instance_id", "made_by", "held_for", "id", "project_id", "kind", "name", "does", "ask", "composer", "machine_id", "source_page", "source_dir", "source_port", "source_path", "source_workspace", "source_place", "source_stage_dir", "source_stage_file", "source_serve_command", "source_serve_cwd", "revision", "seq", "delivered_seq", "read_seq", "opened_revision", "created_at", "updated_at", "shown_at" FROM `artifacts`;--> statement-breakpoint
DROP TABLE `artifacts`;--> statement-breakpoint
ALTER TABLE `__new_artifacts` RENAME TO `artifacts`;--> statement-breakpoint
CREATE INDEX `artifacts_instance` ON `artifacts` (`instance_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `artifacts_instance_name` ON `artifacts` (`instance_id`,`kind`,`name`,`composer`) WHERE "artifacts"."held_for" is null and ("artifacts"."project_id" is null or "artifacts"."kind" <> 'page');--> statement-breakpoint
CREATE UNIQUE INDEX `artifacts_project_page` ON `artifacts` (`project_id`,`name`) WHERE "artifacts"."held_for" is null and "artifacts"."project_id" is not null and "artifacts"."kind" = 'page';--> statement-breakpoint
CREATE UNIQUE INDEX `artifacts_held_for` ON `artifacts` (`held_for`);--> statement-breakpoint
CREATE UNIQUE INDEX `artifacts_origin` ON `artifacts` (`origin`);--> statement-breakpoint
-- A port is kept by the origin, not by the artifact row that points at it
-- now: no foreign key, since a held version's opening repoints the origin
-- from one row to another. It goes as its origin ends.
CREATE TABLE `__new_preview_ports` (
	`port` integer PRIMARY KEY NOT NULL,
	`instance_id` text,
	`project_id` text,
	`origin` text,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "preview_ports_one_owner" CHECK(("instance_id" is not null) + ("project_id" is not null) + ("origin" is not null) = 1)
);
--> statement-breakpoint
INSERT INTO `__new_preview_ports`("port", "instance_id", "project_id", "origin") SELECT "port", "instance_id", "project_id", "artifact_id" FROM `preview_ports`;--> statement-breakpoint
DROP TABLE `preview_ports`;--> statement-breakpoint
ALTER TABLE `__new_preview_ports` RENAME TO `preview_ports`;--> statement-breakpoint
CREATE UNIQUE INDEX `preview_ports_instance_id_unique` ON `preview_ports` (`instance_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `preview_ports_project_id_unique` ON `preview_ports` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `preview_ports_origin_unique` ON `preview_ports` (`origin`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
