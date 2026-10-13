-- A stored `unmoved` line names what failed (core `AccountMove` `action`):
-- a whole move, or a continuation from a summary. Lines written before the
-- field existed are told by what the hub stored with them, each by a rule
-- that only one writer could produce:
--
-- - `asked`: a continuation the session asked for (`continue_session`).
--   No move is ever asked this way.
-- - `step` other than "start" ("prepare", "summary", and the old "end"):
--   only a continuation has those steps. A whole move fails at "start".
-- - `step` "start" with the reason "its process runs": a whole move. That
--   is the at-limit move's carry refused by its machine (`moveWhole`,
--   since b6465df9). No continuation fails with it: none carried a
--   session's data before 8fe4fba3, and since then `leaveConversation`
--   asks again instead of failing.
--
-- Any other "start" line (a carry error or a machine away, which both
-- paths can meet) stays as it is.
UPDATE `limit_events`
SET `move` = json_set(`move`, '$.action', 'continue')
WHERE json_extract(`move`, '$.kind') = 'unmoved'
	AND json_type(`move`, '$.action') IS NULL
	AND (
		json_extract(`move`, '$.asked') = 1
		OR json_extract(`move`, '$.step') <> 'start'
	);
--> statement-breakpoint
UPDATE `limit_events`
SET `move` = json_set(`move`, '$.action', 'move')
WHERE json_extract(`move`, '$.kind') = 'unmoved'
	AND json_type(`move`, '$.action') IS NULL
	AND json_extract(`move`, '$.step') = 'start'
	AND json_extract(`move`, '$.reason') = 'its process runs';
