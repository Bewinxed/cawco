-- A routine's run names the session that did it: a work item run (delegate,
-- orchestrator, curator, trim) now writes its item's session as it starts,
-- where only a conversation run wrote one before. Each run kept with a work
-- item and no session takes its item's.
UPDATE `routine_runs`
SET `instance_id` = (
	SELECT `work_items`.`instance_id` FROM `work_items`
	WHERE `work_items`.`id` = `routine_runs`.`work_item_id`
)
WHERE `instance_id` IS NULL AND `work_item_id` IS NOT NULL;
