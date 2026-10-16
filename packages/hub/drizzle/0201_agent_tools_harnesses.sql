-- A machine's tool statuses and harness reports are rows (audit R3), one
-- per tool and one per harness, not a JSON map and list merged by
-- read-modify-write. A harness's report stays the daemon's own, whole.
-- Copied in the list's order (rowid).
CREATE TABLE `agent_harnesses` (
	`machine_id` text NOT NULL,
	`harness` text NOT NULL,
	`report` text NOT NULL,
	PRIMARY KEY(`machine_id`, `harness`),
	FOREIGN KEY (`machine_id`) REFERENCES `agents`(`machine_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `agent_tools` (
	`machine_id` text NOT NULL,
	`tool_id` text NOT NULL,
	`state` text NOT NULL,
	`version` text,
	`method` text,
	`detail` text,
	`at` integer NOT NULL,
	PRIMARY KEY(`machine_id`, `tool_id`),
	FOREIGN KEY (`machine_id`) REFERENCES `agents`(`machine_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `agent_tools` (`machine_id`, `tool_id`, `state`, `version`, `method`, `detail`, `at`)
SELECT a.`machine_id`, t.key, json_extract(t.value, '$.state'), json_extract(t.value, '$.version'),
  json_extract(t.value, '$.method'), json_extract(t.value, '$.detail'), coalesce(json_extract(t.value, '$.at'), 0)
FROM `agents` a, json_each(a.`tools`) t;
--> statement-breakpoint
INSERT INTO `agent_harnesses` (`machine_id`, `harness`, `report`)
SELECT a.`machine_id`, json_extract(h.value, '$.harness'), h.value
FROM `agents` a, json_each(a.`harnesses`) h
ORDER BY a.`machine_id`, h.key;
--> statement-breakpoint
ALTER TABLE `agents` DROP COLUMN `tools`;--> statement-breakpoint
ALTER TABLE `agents` DROP COLUMN `harnesses`;
