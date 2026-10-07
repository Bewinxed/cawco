CREATE TABLE `canvas_choices` (
	`canvas_id` text NOT NULL,
	`choice` text NOT NULL,
	`options` text NOT NULL,
	`note` text,
	`value` text,
	`page_hash` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`canvas_id`, `choice`)
);
--> statement-breakpoint
CREATE TABLE `canvases` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text NOT NULL,
	`page_hash` text,
	`sent_at` integer,
	`updated_at` integer NOT NULL
);
