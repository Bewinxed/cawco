ALTER TABLE `instances` ADD `delegate_type` text;--> statement-breakpoint
ALTER TABLE `instances` ADD `delegate_type_project` text;--> statement-breakpoint
ALTER TABLE `supervisor_config` ADD `cawco_todos` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- "CawCo's to-dos" is its own flag now, not names in the baseline: a baseline
-- that denied the four ledger tools had the choice on.
UPDATE `supervisor_config` SET `cawco_todos` = 1
WHERE `denied_tools` IS NOT NULL
	AND (SELECT count(*) FROM json_each(`supervisor_config`.`denied_tools`) WHERE `value` IN ('TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet')) = 4;--> statement-breakpoint
-- The names leave the baseline: they are added at spawn while the flag is on.
UPDATE `supervisor_config`
SET `denied_tools` = (
	SELECT json_group_array(`value`) FROM json_each(`supervisor_config`.`denied_tools`)
	WHERE `value` NOT IN ('TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'EnterPlanMode', 'ExitPlanMode')
)
WHERE `denied_tools` IS NOT NULL AND `cawco_todos` = 1;
