-- The effort each model ran at on an account is rows (audit R9), one per
-- model, not a JSON map on the catalog: learning one writes one row.
CREATE TABLE `account_model_efforts` (
	`account_id` text NOT NULL,
	`model` text NOT NULL,
	`effort` text NOT NULL,
	PRIMARY KEY(`account_id`, `model`),
	FOREIGN KEY (`account_id`) REFERENCES `account_catalogs`(`account_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `account_model_efforts` (`account_id`, `model`, `effort`)
SELECT c.`account_id`, e.key, e.value FROM `account_catalogs` c, json_each(c.`default_efforts`) e;
--> statement-breakpoint
ALTER TABLE `account_catalogs` DROP COLUMN `default_efforts`;
