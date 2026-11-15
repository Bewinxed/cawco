-- Every parked ask holds its call's keyed digest: the step before this
-- migration (db/migrate.ts `ask-inputs`, db/asks-inputs.ts) made each from
-- its sealed input in this same transaction, kept every permit by the
-- digest of the call it was asked for and sealed every approval's call
-- input beside its record, each record keeping the card's input alone. No
-- row is dropped. The start that runs it rewrites the file
-- (seal-at-rest.ts), so no plain input stays in its freed pages.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_parked_asks` (
	`request_id` text PRIMARY KEY NOT NULL,
	`instance_id` text,
	`machine_id` text NOT NULL,
	`envelope` text NOT NULL,
	`input_sealed` text NOT NULL,
	`call_digest` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_parked_asks`("request_id", "instance_id", "machine_id", "envelope", "input_sealed", "call_digest") SELECT "request_id", "instance_id", "machine_id", "envelope", "input_sealed", "call_digest" FROM `parked_asks`;--> statement-breakpoint
DROP TABLE `parked_asks`;--> statement-breakpoint
ALTER TABLE `__new_parked_asks` RENAME TO `parked_asks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `parked_asks_instance` ON `parked_asks` (`instance_id`);