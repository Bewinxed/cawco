-- Moves of a project's folder, files and all (folder-moves.ts): the one
-- record of each job, so a hub that restarts mid-way carries it on from its
-- stage (the owner, 2026-11-18: "move means MOVE as in cut->move").
CREATE TABLE `folder_moves` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`place_id` text NOT NULL,
	`source_machine_id` text NOT NULL,
	`target_machine_id` text NOT NULL,
	`stage` text NOT NULL,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `folder_moves_machines` ON `folder_moves` (`source_machine_id`,`target_machine_id`);--> statement-breakpoint
CREATE INDEX `folder_moves_place` ON `folder_moves` (`place_id`);--> statement-breakpoint
-- A folder the person pointed a checkout at with its machine away (Locate
-- folder, project-locate.ts), held until that machine can read it at its
-- next register. Null: none held, as for every place filed until here.
ALTER TABLE `project_places` ADD `locate_to` text;