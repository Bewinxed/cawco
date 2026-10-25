-- Every turn the hub cut and why (core turn-cuts.ts): a transcript says the
-- cause on the calls each cut ended and on its line, where its harness wrote
-- "rejected" or "aborted".
CREATE TABLE `turn_cuts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instance_id` text NOT NULL,
	`at` integer NOT NULL,
	`cause` text NOT NULL,
	`calls` text NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `turn_cuts_instance` ON `turn_cuts` (`instance_id`,`at`);