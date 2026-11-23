-- On a GitHub binding, the Status options the hub last added to its Project
-- (tracker.ts), shown under the tie's row in the project's settings; and the
-- notes that said so in the project's conversation go, since nothing the hub
-- does on a project's thing is a line in the person's chat with Caw.
ALTER TABLE `tracker_bindings` ADD `github_statuses_added` text;--> statement-breakpoint
DELETE FROM `project_notes` WHERE json_extract(`note`, '$.event.kind') = 'board-statuses';
