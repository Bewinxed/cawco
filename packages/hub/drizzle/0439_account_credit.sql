CREATE TABLE `account_credit` (
	`account_id` text NOT NULL,
	`provider` text NOT NULL,
	`reason` text NOT NULL,
	`since` integer NOT NULL,
	PRIMARY KEY(`account_id`, `provider`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
