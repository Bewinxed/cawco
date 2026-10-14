-- A session whose end is recorded but not yet confirmed by its machine is
-- `stopping` (core `InstanceStatus`): its process may still run. Rows written
-- before the status existed were filed `stopped` the moment the end was
-- asked; the ones whose machine has not confirmed it yet are stopping.
UPDATE `instances`
SET `status` = 'stopping'
WHERE `status` = 'stopped'
	AND `end_intent` IS NOT NULL
	AND `end_confirmed_at` IS NULL;
