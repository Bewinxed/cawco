-- When each preview origin was last used, written at most once a minute
-- (hub preview.ts `used`): a full range takes the port of the one used
-- least recently first (`reclaimOne`), and that order now survives the
-- hub's restarts. Null until an origin is next used.
ALTER TABLE `preview_ports` ADD `used_at` integer;