-- Each key's last change on an artifact is a row (audit R6), indexed by
-- seq, not a JSON map merged on every update and filtered by `seq > since`
-- in JS by every read.
CREATE TABLE `artifact_changes` (
	`artifact_id` text NOT NULL,
	`key` text NOT NULL,
	`seq` integer NOT NULL,
	`by` text NOT NULL,
	PRIMARY KEY(`artifact_id`, `key`),
	FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `artifact_changes` (`artifact_id`, `key`, `seq`, `by`)
SELECT a.`id`, c.key, json_extract(c.value, '$.seq'), json_extract(c.value, '$.by')
FROM `artifacts` a, json_each(a.`changes`) c;
--> statement-breakpoint
CREATE INDEX `artifact_changes_seq` ON `artifact_changes` (`artifact_id`,`seq`);--> statement-breakpoint
ALTER TABLE `artifacts` DROP COLUMN `changes`;
