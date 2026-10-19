-- The hub's one-time migrations over its stored rows, by name, once each has
-- run (db/tag-markers.ts, db `migrateSendsOnce`): a row is its rows migrated.
CREATE TABLE `data_migrations` (
	`name` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL
);
