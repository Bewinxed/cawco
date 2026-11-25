-- The write ledger names the events each write itself caused (hub
-- writes.ts, providers event-keys.ts), in place of the version it left the
-- item at: an event is CawCo's own only when its key is one of them, never
-- for being near a write in time, so a person's close a moment after
-- CawCo's is theirs.
--
-- What a stored row says carries over as far as it can be known: an item
-- CawCo made opened under `<issue|pr>:<key>:opened`. The close, reopen or
-- label an earlier update made has no key the row kept, so those rows name
-- none; the events they caused were stored and handled when they came.
ALTER TABLE `external_writes` ADD `events` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
UPDATE `external_writes` SET `events` = json_array(`kind` || ':' || `key` || ':opened') WHERE `kind` IN ('issue', 'pr');--> statement-breakpoint
ALTER TABLE `external_writes` DROP COLUMN `version`;
