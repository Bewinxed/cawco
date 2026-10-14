CREATE TABLE `preview_ports` (
	`instance_id` text PRIMARY KEY NOT NULL,
	`port` integer NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preview_ports_port_unique` ON `preview_ports` (`port`);--> statement-breakpoint
CREATE TABLE `preview_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`mode` text DEFAULT 'port' NOT NULL,
	`pattern` text
);
