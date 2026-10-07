CREATE TABLE `session_plans` (
	`instance_id` text PRIMARY KEY NOT NULL,
	`steps` text NOT NULL,
	`spec` text,
	`spec_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
-- "CawCo's to-dos" now also denies each harness's built-in plan mode: a
-- baseline that already denies the four ledger tools (the choice on) gets
-- EnterPlanMode and ExitPlanMode too, so the choice still reads as on.
UPDATE `supervisor_config`
SET `denied_tools` = (
	SELECT json_group_array(`value`) FROM (
		SELECT `value` FROM json_each(`supervisor_config`.`denied_tools`)
		UNION ALL SELECT 'EnterPlanMode' WHERE NOT EXISTS (SELECT 1 FROM json_each(`supervisor_config`.`denied_tools`) WHERE `value` = 'EnterPlanMode')
		UNION ALL SELECT 'ExitPlanMode' WHERE NOT EXISTS (SELECT 1 FROM json_each(`supervisor_config`.`denied_tools`) WHERE `value` = 'ExitPlanMode')
	)
)
WHERE `denied_tools` IS NOT NULL
	AND (SELECT count(*) FROM json_each(`supervisor_config`.`denied_tools`) WHERE `value` IN ('TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet')) = 4;
