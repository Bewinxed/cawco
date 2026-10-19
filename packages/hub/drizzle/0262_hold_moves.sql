ALTER TABLE `limit_holds` DROP COLUMN `nudge`;--> statement-breakpoint
UPDATE `account_routing` SET `at_limit` = json_set(`at_limit`, '$.delegateWork', 'move');