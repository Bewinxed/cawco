CREATE TABLE `fleet_harness_config` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`settings` text,
	`module` text,
	`package` text,
	`scope` text,
	`project_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
