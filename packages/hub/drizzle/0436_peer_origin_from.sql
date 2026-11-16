-- A send from another session names that session (core `NeutralOrigin`'s
-- `peer`: `from` is required). A kept send whose `peer` origin names no
-- `from` is given the session it came from, its `fromSession`, in its body
-- and in its kept envelope (`payload.message.origin`). One that names no
-- session at all has no sender to name: its origin becomes `unclassified`,
-- the kind Claude Code gives words whose provenance it cannot tell. No row
-- is deleted, and nothing else of a send changes.
--
-- Every JSON function sits inside a CASE that proved its column JSON:
-- SQLite may run either side of an AND first.
UPDATE `sent_messages`
SET `body` = json_set(`body`, '$.origin.from', json_extract(`body`, '$.origin.fromSession'))
WHERE CASE WHEN json_valid(`body`) THEN
  json_extract(`body`, '$.origin.kind') = 'peer'
  AND coalesce(json_type(`body`, '$.origin.from'), '') <> 'text'
  AND json_type(`body`, '$.origin.fromSession') = 'text'
ELSE 0 END;
--> statement-breakpoint
UPDATE `sent_messages`
SET `body` = json_set(`body`, '$.origin', json_object('kind', 'unclassified'))
WHERE CASE WHEN json_valid(`body`) THEN
  json_extract(`body`, '$.origin.kind') = 'peer'
  AND coalesce(json_type(`body`, '$.origin.from'), '') <> 'text'
ELSE 0 END;
--> statement-breakpoint
UPDATE `sent_messages`
SET `envelope` = json_set(`envelope`, '$.payload.message.origin.from', json_extract(`envelope`, '$.payload.message.origin.fromSession'))
WHERE `envelope` IS NOT NULL AND CASE WHEN json_valid(`envelope`) THEN
  json_extract(`envelope`, '$.payload.message.origin.kind') = 'peer'
  AND coalesce(json_type(`envelope`, '$.payload.message.origin.from'), '') <> 'text'
  AND json_type(`envelope`, '$.payload.message.origin.fromSession') = 'text'
ELSE 0 END;
--> statement-breakpoint
UPDATE `sent_messages`
SET `envelope` = json_set(`envelope`, '$.payload.message.origin', json_object('kind', 'unclassified'))
WHERE `envelope` IS NOT NULL AND CASE WHEN json_valid(`envelope`) THEN
  json_extract(`envelope`, '$.payload.message.origin.kind') = 'peer'
  AND coalesce(json_type(`envelope`, '$.payload.message.origin.from'), '') <> 'text'
ELSE 0 END;
