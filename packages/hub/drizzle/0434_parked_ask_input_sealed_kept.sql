-- Every parked ask holds its call's input sealed: the step before this
-- migration (db/migrate.ts `parked-inputs`, db/parked-inputs.ts) sealed each
-- row's input with the hub's key in code, in this same transaction, and kept
-- its envelope as every screen reads it (card-input.ts `cardOf`). An
-- envelope that does not read as an ask keeps its input sealed as stored and
-- loses it from its envelope; an Approve of it withdraws it. No row is
-- dropped. The start that runs it rewrites the file (seal-at-rest.ts), so
-- no plain input stays in its freed pages.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_parked_asks` (
	`request_id` text PRIMARY KEY NOT NULL,
	`instance_id` text,
	`machine_id` text NOT NULL,
	`envelope` text NOT NULL,
	`input_sealed` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_parked_asks`("request_id", "instance_id", "machine_id", "envelope", "input_sealed") SELECT "request_id", "instance_id", "machine_id", "envelope", "input_sealed" FROM `parked_asks`;--> statement-breakpoint
DROP TABLE `parked_asks`;--> statement-breakpoint
ALTER TABLE `__new_parked_asks` RENAME TO `parked_asks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `parked_asks_instance` ON `parked_asks` (`instance_id`);