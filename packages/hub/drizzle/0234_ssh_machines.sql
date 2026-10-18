-- The machines the hub added over SSH, and the port on each one's loopback
-- its agent reaches the hub on, carried by the SSH connection the hub holds
-- (hub ssh-tunnels.ts): a machine with no route to any address of the hub's
-- joins through it. Kept so the hub opens every connection again at start,
-- on the same port. Machines added before have none: they move to it when
-- they are added over SSH again.
CREATE TABLE `ssh_machines` (
	`id` text PRIMARY KEY NOT NULL,
	`target` text NOT NULL,
	`ssh_port` integer,
	`box_port` integer,
	`machine_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ssh_machines_machine` ON `ssh_machines` (`machine_id`);