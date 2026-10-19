-- A session's credential grants while the session may run (db revokeIdentities):
-- what a session gone from the hub, or one whose end is confirmed, still held is revoked.
DELETE FROM `session_identities` WHERE `instance_id` NOT IN (SELECT `id` FROM `instances`) OR `instance_id` IN (SELECT `id` FROM `instances` WHERE `end_confirmed_at` IS NOT NULL OR `status` = 'discarded');
