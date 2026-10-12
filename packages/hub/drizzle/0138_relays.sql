CREATE TABLE `relays` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`provider` text NOT NULL,
	`secret` text,
	`secret_from` text,
	`connection` text,
	`hook_id` text,
	`signature_header` text,
	`timestamp_header` text,
	`id_path` text,
	`host` text NOT NULL,
	`public_url` text,
	`state` text NOT NULL,
	`reason` text,
	`tested_at` integer,
	`last_delivery_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `relays_project` ON `relays` (`project_id`);