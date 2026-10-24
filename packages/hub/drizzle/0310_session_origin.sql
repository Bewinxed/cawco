ALTER TABLE `instances` ADD `origin` text DEFAULT 'person' NOT NULL;--> statement-breakpoint
ALTER TABLE `project_threads` ADD `archived_at` integer;--> statement-breakpoint
-- Who started each session, from what its row already says (core
-- `SessionOrigin`): a project's Caw, and what his turns started (a thread
-- named, or the lead its parent); the hub's summarisers; a work item's
-- session, a leaf or a typed one (only `delegate` makes either); any other
-- session started under a parent (`start_session`); else a person's.
UPDATE `instances` SET `origin` = CASE
  WHEN `role` = 'lead' THEN 'caw'
  WHEN `kind` = 'summariser' THEN 'check'
  WHEN `thread_id` IS NOT NULL THEN 'caw'
  WHEN `parent_instance_id` IN (SELECT `id` FROM `instances` WHERE `role` = 'lead') THEN 'caw'
  WHEN `work_item_id` IS NOT NULL THEN 'delegate'
  WHEN `parent_instance_id` IS NOT NULL AND (`delegate_type` IS NOT NULL OR `can_delegate` = 0) THEN 'delegate'
  WHEN `parent_instance_id` IS NOT NULL THEN 'check'
  ELSE 'person'
END;--> statement-breakpoint
-- One project per session. A session at the top of its tree (no parent, or
-- one the hub has no row for) with none: the deepest place on its machine
-- that holds its launch directory, the oldest project where two share it
-- (core `projectAt`).
UPDATE `instances` SET `project_id` = (
  SELECT `pl`.`project_id`
  FROM `project_places` AS `pl`
  JOIN `projects` AS `p` ON `p`.`id` = `pl`.`project_id`
  WHERE `pl`.`machine_id` = `instances`.`machine_id`
    AND `pl`.`kind` <> 'hub'
    AND (
      rtrim(`instances`.`cwd`, '/') = rtrim(`pl`.`path`, '/')
      OR substr(`instances`.`cwd`, 1, length(rtrim(`pl`.`path`, '/')) + 1) = rtrim(`pl`.`path`, '/') || '/'
    )
  ORDER BY length(rtrim(`pl`.`path`, '/')) DESC, `p`.`created_at` ASC, `p`.`id` ASC
  LIMIT 1
)
WHERE `project_id` IS NULL
  AND (
    `parent_instance_id` IS NULL
    OR `parent_instance_id` NOT IN (SELECT `id` FROM `instances`)
  );--> statement-breakpoint
-- Every session under one: its top's, none included, as the hub writes a
-- child's at its start (its parent's). A row in a loop of parents has no
-- top, and keeps its own.
UPDATE `instances` SET `project_id` = `found`.`project_id`
FROM (
  WITH RECURSIVE `tree`(`id`, `project_id`) AS (
    SELECT `id`, `project_id`
    FROM `instances`
    WHERE `parent_instance_id` IS NULL
      OR `parent_instance_id` NOT IN (SELECT `id` FROM `instances`)
    UNION ALL
    SELECT `child`.`id`, `tree`.`project_id`
    FROM `instances` AS `child`
    JOIN `tree` ON `child`.`parent_instance_id` = `tree`.`id`
  )
  SELECT `id`, `project_id` FROM `tree`
) AS `found`
WHERE `instances`.`id` = `found`.`id`
  AND `instances`.`parent_instance_id` IN (SELECT `id` FROM `instances`)
  AND `instances`.`project_id` IS NOT `found`.`project_id`;
