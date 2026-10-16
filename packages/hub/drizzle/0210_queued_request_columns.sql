-- What the queue reads of a queued delegate's request is columns (audit
-- S5): the task it starts (`task`, its project a foreign key that
-- cascades) and the session id it stands under (`queuedAs.instanceId`).
-- They leave the request JSON, which stays the rest of what `delegate` made,
-- read whole; `queuedAs.id` is the row's own id. A queued delegate for a
-- project already gone goes as the key would have taken it, its globs with
-- it. Rebuilt by hand: drizzle-kit 0.31.11 added queued_instance_id NOT NULL
-- with no default and the key without its ON DELETE.
CREATE TABLE `__new_queued_work_items` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_instance_id` text NOT NULL,
	`request` text NOT NULL,
	`project_id` text,
	`task_id` text,
	`queued_instance_id` text NOT NULL,
	`title` text NOT NULL,
	`queued_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
DELETE FROM `queued_work_item_globs` WHERE `queued_id` IN (
  SELECT `id` FROM `queued_work_items`
  WHERE json_extract(`request`, '$.task.projectId') IS NOT NULL
    AND json_extract(`request`, '$.task.projectId') NOT IN (SELECT `id` FROM `projects`)
);--> statement-breakpoint
INSERT INTO `__new_queued_work_items` (`id`, `parent_instance_id`, `request`, `project_id`, `task_id`, `queued_instance_id`, `title`, `queued_at`)
SELECT `id`, `parent_instance_id`, json_remove(`request`, '$.task', '$.queuedAs'),
  json_extract(`request`, '$.task.projectId'), json_extract(`request`, '$.task.id'),
  json_extract(`request`, '$.queuedAs.instanceId'), `title`, `queued_at`
FROM `queued_work_items`
WHERE json_extract(`request`, '$.task.projectId') IS NULL
  OR json_extract(`request`, '$.task.projectId') IN (SELECT `id` FROM `projects`);
--> statement-breakpoint
DROP TABLE `queued_work_items`;--> statement-breakpoint
ALTER TABLE `__new_queued_work_items` RENAME TO `queued_work_items`;
