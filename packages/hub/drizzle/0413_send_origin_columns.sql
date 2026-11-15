-- Who sent a send (`sent_messages.body`'s `origin`: its `kind`, its
-- `name`, and a peer's `from`) is three columns SQLite reads out of the
-- body itself, VIRTUAL generated columns, and the four reads that reached
-- into the JSON for them (db/sends.ts `lastPeerSend`, `personUnanswered`,
-- `latestSends`; db/instances.ts `newestKeptAlive`) find a session's sends
-- by them, `origin_kind` indexed with its session and when it was
-- accepted. The body stays whole: it is the conversation's own message,
-- `origin` part of what the apps are sent. Nothing is written, so a send
-- has one source of who sent it.
--
-- A field that is text is placed as it is. A send with no origin (a body
-- stored before origins were kept) was never set: each column null, as
-- json_extract read it. An origin that is there and whose field is not text,
-- or a body that is not JSON, reads as null in that column, never an error:
-- a send whose kind does not read is from no one, never the person's, a
-- peer's or a keep-alive. The step before this migration (db/migrate.ts
-- `send-origins-unread`) logs each send whose origin is there and whose
-- kind does not read.
--
-- `PRAGMA table_info` does not list a generated column (`table_xinfo`
-- does), and an INSERT names none: db/migrate.ts reads a table's columns
-- with `table_xinfo`.
--
-- Every JSON function here sits inside a CASE that proved the body JSON.
ALTER TABLE `sent_messages` ADD `origin_kind` text GENERATED ALWAYS AS (CASE WHEN json_valid(body) THEN CASE WHEN json_type(body, '$.origin.kind') = 'text' THEN json_extract(body, '$.origin.kind') END END) VIRTUAL;--> statement-breakpoint
ALTER TABLE `sent_messages` ADD `origin_name` text GENERATED ALWAYS AS (CASE WHEN json_valid(body) THEN CASE WHEN json_type(body, '$.origin.name') = 'text' THEN json_extract(body, '$.origin.name') END END) VIRTUAL;--> statement-breakpoint
ALTER TABLE `sent_messages` ADD `origin_from` text GENERATED ALWAYS AS (CASE WHEN json_valid(body) THEN CASE WHEN json_type(body, '$.origin.from') = 'text' THEN json_extract(body, '$.origin.from') END END) VIRTUAL;--> statement-breakpoint
CREATE INDEX `sent_messages_origin` ON `sent_messages` (`instance_id`,`origin_kind`,`accepted_at`);