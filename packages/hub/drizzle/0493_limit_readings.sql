-- The readings of the bounds still waiting on data (core limit-readings.ts):
-- one row per metric, machine, UTC day and logarithmic bucket.
CREATE TABLE `limit_readings` (
	`metric` text NOT NULL,
	`machine` text NOT NULL,
	`day` text NOT NULL,
	`bucket` integer NOT NULL,
	`value` real NOT NULL,
	`count` integer NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`metric`, `machine`, `day`, `bucket`)
);
