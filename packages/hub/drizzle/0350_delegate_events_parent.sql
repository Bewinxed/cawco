-- A parent's delegate events by index: the paged GET /api/delegate-events
-- (newest first by id, carried after the key, so no sort), a continuation
-- moving its pending asks, and a session's deletion no longer scan the table.
CREATE INDEX `delegate_events_parent` ON `delegate_events` (`parent_instance_id`);
