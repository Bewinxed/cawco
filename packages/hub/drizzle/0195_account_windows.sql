-- An account reading's limit windows are rows (audit R8), keyed by kind and
-- model scope ("" for none), not a JSON list merged in JS: a report replaces
-- the rows of the windows it names. Copied in the list's order (rowid).
CREATE TABLE `account_windows` (
	`account_id` text NOT NULL,
	`kind` text NOT NULL,
	`scope_label` text DEFAULT '' NOT NULL,
	`group` text NOT NULL,
	`is_active` integer NOT NULL,
	`percent` real NOT NULL,
	`severity` text NOT NULL,
	`resets_at` text,
	PRIMARY KEY(`account_id`, `kind`, `scope_label`),
	FOREIGN KEY (`account_id`) REFERENCES `account_readings`(`account_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `account_windows` (`account_id`, `kind`, `scope_label`, `group`, `is_active`, `percent`, `severity`, `resets_at`)
SELECT r.`account_id`, json_extract(w.value, '$.kind'), coalesce(json_extract(w.value, '$.scopeLabel'), ''),
  json_extract(w.value, '$.group'), coalesce(json_extract(w.value, '$.isActive'), 0),
  json_extract(w.value, '$.percent'), json_extract(w.value, '$.severity'), json_extract(w.value, '$.resetsAt')
FROM `account_readings` r, json_each(r.`windows`) w
ORDER BY r.`account_id`, w.key;
--> statement-breakpoint
ALTER TABLE `account_readings` DROP COLUMN `windows`;
