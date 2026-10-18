-- The machine key an SSH add wrote to its machine over its own connection
-- (hub ssh-tunnels.ts `admit`), sealed, until the machine proves it under the
-- id it registers as (hub-auth.ts). An SSH add admits the machine: what it
-- reaches the hub with through its forward is held to that key, as a paired
-- hub holds every machine to its own.
ALTER TABLE `ssh_machines` ADD `pending_key` text;
