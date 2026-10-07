CREATE TABLE `parked_asks` (
	`request_id` text PRIMARY KEY NOT NULL,
	`instance_id` text,
	`machine_id` text NOT NULL,
	`envelope` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `parked_asks_instance` ON `parked_asks` (`instance_id`);