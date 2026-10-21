CREATE TABLE `owed_moves` (
	`instance_id` text PRIMARY KEY NOT NULL,
	`to_account_id` text,
	`by_hand` integer DEFAULT false NOT NULL,
	`move` text,
	`waits` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
