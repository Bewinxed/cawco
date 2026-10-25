-- An attempt is titled by its task's title alone (dispatch.ts `titleOf`):
-- the person cannot read a task's id, and a session's chip reads its title.
-- Attempts filed before were titled `<task id> <title>`; their work items
-- and their sessions lose the id. A session the owner renamed keeps his name.
UPDATE `instances` SET `title` = (
  SELECT substr(`instances`.`title`, length(`w`.`task_id`) + 2)
  FROM `work_items` `w` WHERE `w`.`id` = `instances`.`work_item_id`
)
WHERE (`title_source` IS NULL OR `title_source` != 'owner')
  AND EXISTS (
    SELECT 1 FROM `work_items` `w`
    WHERE `w`.`id` = `instances`.`work_item_id`
      AND `w`.`task_id` IS NOT NULL
      AND substr(`instances`.`title`, 1, length(`w`.`task_id`) + 1) = `w`.`task_id` || ' '
  );
--> statement-breakpoint
UPDATE `work_items` SET `title` = substr(`title`, length(`task_id`) + 2)
WHERE `task_id` IS NOT NULL
  AND substr(`title`, 1, length(`task_id`) + 1) = `task_id` || ' ';
