PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_account_credit` (
	`account_id` text NOT NULL,
	`provider` text NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`reason` text NOT NULL,
	`since` integer NOT NULL,
	PRIMARY KEY(`account_id`, `provider`, `model`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_account_credit`("account_id", "provider", "model", "reason", "since") SELECT "account_id", "provider", '', "reason", "since" FROM `account_credit`;--> statement-breakpoint
DROP TABLE `account_credit`;--> statement-breakpoint
ALTER TABLE `__new_account_credit` RENAME TO `account_credit`;--> statement-breakpoint
PRAGMA foreign_keys=ON;