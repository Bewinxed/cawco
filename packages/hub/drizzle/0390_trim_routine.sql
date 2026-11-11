CREATE TABLE `trim_kept` (
	`set` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`kept_at` integer NOT NULL,
	PRIMARY KEY(`set`, `kind`, `name`)
);
--> statement-breakpoint
CREATE TABLE `trim_offers` (
	`project_id` text PRIMARY KEY NOT NULL,
	`answer` text NOT NULL,
	`answered_at` integer NOT NULL
);
