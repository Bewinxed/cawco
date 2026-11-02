-- The hub that holds each SSH machine's connection, by its id (hub hub-id.ts):
-- only that hub opens it (ssh-tunnels.ts). A scratch hub booted on a copy of
-- the live database has an id of its own, so it no longer dials the live
-- hub's machines, ends their sessions or takes them over. Null on the rows
-- made before, until their hub claims them at its next start
-- (db/ssh-machines.ts `claim`).
ALTER TABLE `ssh_machines` ADD `hub_id` text;
