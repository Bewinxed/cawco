CREATE TABLE `connection_projects` (
	`connection_id` text NOT NULL,
	`project_id` text NOT NULL,
	PRIMARY KEY(`connection_id`, `project_id`),
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `connection_projects_project` ON `connection_projects` (`project_id`);--> statement-breakpoint
CREATE TABLE `connections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`service` text NOT NULL,
	`account` text NOT NULL,
	`transport` text NOT NULL,
	`url` text,
	`command` text,
	`args` text,
	`auth` text NOT NULL,
	`header` text,
	`state` text NOT NULL,
	`reason` text,
	`sealed` text,
	`discovery` text,
	`sign_in_state` text,
	`sign_in_redirect` text,
	`sign_in_expires_at` integer,
	`tokens_expire_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `connections_name_unique` ON `connections` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `connections_sign_in_state_unique` ON `connections` (`sign_in_state`);