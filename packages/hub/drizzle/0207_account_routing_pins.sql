-- A provider's routing choices are columns (audit S4), not JSON bags: each
-- pin is a foreign key to its account that sets null, so removing an
-- account leaves no id behind and placement takes the first by order, as it
-- does with no pin. at_limit stays JSON, read whole.
-- Rebuilt by hand: drizzle-kit 0.31.11 added the strategies as NOT NULL with
-- no default, which a table with rows refuses, and the keys without their
-- ON DELETE. A pin naming no account is copied as none.
CREATE TABLE `__new_account_routing` (
	`provider` text PRIMARY KEY NOT NULL,
	`yours_strategy` text NOT NULL,
	`yours_pinned` text,
	`delegates_strategy` text NOT NULL,
	`delegates_pinned` text,
	`at_limit` text NOT NULL,
	FOREIGN KEY (`yours_pinned`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`delegates_pinned`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_account_routing` (`provider`, `yours_strategy`, `yours_pinned`, `delegates_strategy`, `delegates_pinned`, `at_limit`)
SELECT `provider`,
  json_extract(`yours`, '$.strategy'),
  CASE WHEN json_extract(`yours`, '$.pinnedAccountId') IN (SELECT `id` FROM `accounts`) THEN json_extract(`yours`, '$.pinnedAccountId') END,
  json_extract(`delegates`, '$.strategy'),
  CASE WHEN json_extract(`delegates`, '$.pinnedAccountId') IN (SELECT `id` FROM `accounts`) THEN json_extract(`delegates`, '$.pinnedAccountId') END,
  `at_limit`
FROM `account_routing`;
--> statement-breakpoint
DROP TABLE `account_routing`;--> statement-breakpoint
ALTER TABLE `__new_account_routing` RENAME TO `account_routing`;
