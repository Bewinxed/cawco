-- What a session may start is a list of delegate type names (core
-- `MayStart`), not a yes or no: `["any"]` is an orchestrator's, `[]` a leaf
-- that starts none. A session that could delegate may start any; one that
-- could not, none; null stays a session nobody delegated. A start owed to a
-- machine and a delegation queued for its files say it the same way.
ALTER TABLE `instances` ADD `may_start` text;--> statement-breakpoint
UPDATE `instances` SET `may_start` = CASE `can_delegate` WHEN 1 THEN '["any"]' WHEN 0 THEN '[]' END WHERE `can_delegate` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `instances` DROP COLUMN `can_delegate`;--> statement-breakpoint
UPDATE `instances` SET `owed_spawn` = json_set(json_remove(`owed_spawn`, '$.payload.canDelegate'), '$.payload.mayStart', json(CASE json_extract(`owed_spawn`, '$.payload.canDelegate') WHEN 1 THEN '["any"]' ELSE '[]' END)) WHERE json_valid(`owed_spawn`) AND json_type(`owed_spawn`, '$.payload.canDelegate') IS NOT NULL;--> statement-breakpoint
UPDATE `queued_work_items` SET `request` = json_set(json_remove(`request`, '$.canDelegate'), '$.mayStart', json(CASE json_extract(`request`, '$.canDelegate') WHEN 1 THEN '["any"]' ELSE '[]' END)) WHERE json_valid(`request`) AND json_type(`request`, '$.canDelegate') IS NOT NULL;
