-- A session's open harness subagents are rows (audit R15), not a JSON list
-- on its taint row: one row per subagent, gone with the taint row.
CREATE TABLE `session_subagents` (
	`instance_id` text NOT NULL,
	`task` text NOT NULL,
	`call` text,
	PRIMARY KEY(`instance_id`, `task`),
	FOREIGN KEY (`instance_id`) REFERENCES `session_taints`(`instance_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `session_subagents` (`instance_id`, `task`, `call`)
SELECT t.`instance_id`, json_extract(s.value, '$.task'), json_extract(s.value, '$.call')
FROM `session_taints` t, json_each(t.`subagents`) s;
--> statement-breakpoint
ALTER TABLE `session_taints` DROP COLUMN `subagents`;
