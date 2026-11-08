-- A handler (hub handlers.ts) is a work item whose handles_kind and
-- handles_id name the thing of its project it was started for; the index is
-- handled_by: a thing's handlers, newest first.
ALTER TABLE `work_items` ADD `handles_kind` text;--> statement-breakpoint
ALTER TABLE `work_items` ADD `handles_id` text;--> statement-breakpoint
CREATE INDEX `work_items_handled_by` ON `work_items` (`project_id`,`handles_kind`,`handles_id`,`created_at`);