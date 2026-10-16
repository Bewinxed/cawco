-- The accounts a project allows are rows (audit R10), each a foreign key
-- to its account, not a JSON list of ids: removing an account removes it
-- from every project. `accounts_limited` says a project allows only its
-- rows, which a non-null list said; one whose last account goes allows
-- none, as a list naming only removed accounts did. An id naming no account
-- already allowed nothing and is not copied.
CREATE TABLE `project_accounts` (
	`project_id` text NOT NULL,
	`account_id` text NOT NULL,
	PRIMARY KEY(`project_id`, `account_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `projects` ADD `accounts_limited` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `projects` SET `accounts_limited` = (`accounts` IS NOT NULL);--> statement-breakpoint
INSERT INTO `project_accounts` (`project_id`, `account_id`)
SELECT p.`id`, a.value FROM `projects` p, json_each(p.`accounts`) a
WHERE a.value IN (SELECT `id` FROM `accounts`)
GROUP BY p.`id`, a.value
ORDER BY p.`id`, min(a.key);
--> statement-breakpoint
ALTER TABLE `projects` DROP COLUMN `accounts`;
