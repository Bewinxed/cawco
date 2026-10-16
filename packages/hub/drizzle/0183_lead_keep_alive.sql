-- A Claude lead keeps its prompt cache warm (caw.ts `startLead`): the leads
-- already running take keep-alive too, under its existing cap.
UPDATE `instances` SET `keep_alive` = 1, `keep_alive_sent` = 0, `keep_alive_stopped` = NULL
WHERE `harness` = 'claude'
  AND `status` NOT IN ('stopping', 'stopped', 'discarded', 'error')
  AND `id` IN (SELECT `lead_instance_id` FROM `projects` WHERE `lead_instance_id` IS NOT NULL);
