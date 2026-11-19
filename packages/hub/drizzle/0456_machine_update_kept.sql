-- Each machine's binary update state as its agent last said it, kept for
-- when it is offline and through the hub's restart (the MacBook dropped off
-- the update list as its socket closed, 2026-11-19). Null for every machine
-- until its agent says one again.
ALTER TABLE `agents` ADD `binary_update` text;
