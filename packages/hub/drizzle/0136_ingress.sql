CREATE TABLE `connector_polls` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`connection` text NOT NULL,
	`tool` text NOT NULL,
	`args` text NOT NULL,
	`interval_s` integer NOT NULL,
	`items_path` text DEFAULT '' NOT NULL,
	`id_path` text NOT NULL,
	`version_path` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`seen` text,
	`reason` text,
	`polled_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `connector_polls_project` ON `connector_polls` (`project_id`);--> statement-breakpoint
CREATE TABLE `event_routes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`source` text NOT NULL,
	`kinds` text NOT NULL,
	`author` text,
	`label` text,
	`branch` text,
	`regex` text,
	`routine_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_routes_project` ON `event_routes` (`project_id`);--> statement-breakpoint
CREATE TABLE `github_pollers` (
	`project_id` text PRIMARY KEY NOT NULL,
	`connection` text NOT NULL,
	`repo` text,
	`cursors` text NOT NULL,
	`reason` text,
	`resume_at` integer,
	`polled_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `inbound_events` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`delivery_key` text NOT NULL,
	`kind` text NOT NULL,
	`project_id` text NOT NULL,
	`payload` text NOT NULL,
	`received_at` integer NOT NULL,
	`via` text NOT NULL,
	`routed_to` text,
	`handled_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inbound_events_delivery` ON `inbound_events` (`source`,`delivery_key`);--> statement-breakpoint
CREATE INDEX `inbound_events_project` ON `inbound_events` (`project_id`,`received_at`);--> statement-breakpoint
CREATE INDEX `inbound_events_inbox` ON `inbound_events` (`project_id`,`routed_to`);