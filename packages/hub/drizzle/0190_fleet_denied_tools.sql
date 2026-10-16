-- The fleet's tool denials are rows (audit R16), not a JSON list on the
-- choices row: one row per tool name, in the order the list held them
-- (rowid). `denied_seeded` says the list is set, which a null list said.
CREATE TABLE `fleet_denied_tools` (
	`tool` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE `supervisor_config` ADD `denied_seeded` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `supervisor_config` SET `denied_seeded` = (`denied_tools` IS NOT NULL);--> statement-breakpoint
INSERT INTO `fleet_denied_tools` (`tool`)
SELECT d.value FROM `supervisor_config` s, json_each(s.`denied_tools`) d
WHERE s.`id` = 'supervisor'
ORDER BY d.key;--> statement-breakpoint
ALTER TABLE `supervisor_config` DROP COLUMN `denied_tools`;
