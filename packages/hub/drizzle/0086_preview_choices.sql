CREATE TABLE `preview_canvases` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`project_id` text,
	`instance_id` text,
	`page` text NOT NULL,
	`content_hash` text,
	`created_at` integer NOT NULL,
	`changed_at` integer NOT NULL,
	`sent_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preview_canvases_key_unique` ON `preview_canvases` (`key`);--> statement-breakpoint
CREATE INDEX `preview_canvases_project` ON `preview_canvases` (`project_id`);--> statement-breakpoint
CREATE INDEX `preview_canvases_instance` ON `preview_canvases` (`instance_id`);--> statement-breakpoint
CREATE TABLE `preview_choices` (
	`canvas_id` text NOT NULL,
	`choice_id` text NOT NULL,
	`option` text,
	`options` text,
	`note` text,
	`hash` text,
	`at` integer NOT NULL,
	PRIMARY KEY(`canvas_id`, `choice_id`),
	FOREIGN KEY (`canvas_id`) REFERENCES `preview_canvases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `preview_dials` (
	`canvas_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`at` integer NOT NULL,
	PRIMARY KEY(`canvas_id`, `key`),
	FOREIGN KEY (`canvas_id`) REFERENCES `preview_canvases`(`id`) ON UPDATE no action ON DELETE cascade
);
