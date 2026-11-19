-- A project's nightly memory run reads what the person typed to its
-- sessions over a window of time (db/sends.ts `personSaidIn`). Found by
-- `sent_messages_origin` alone (instance, origin, time), SQLite walked
-- every send's entry of it; this one reads his in that window.
CREATE INDEX `sent_messages_origin_time` ON `sent_messages` (`origin_kind`,`accepted_at`);
