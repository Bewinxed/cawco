-- A project whose account list lost its last account (removed, cascade)
-- kept `accounts_limited`, so nothing in it could start. Removing the last
-- one now clears the limit (db/accounts.ts `remove`); this clears it for the
-- projects it already happened to.
UPDATE `projects` SET `accounts_limited` = 0 WHERE `accounts_limited` = 1 AND NOT EXISTS (SELECT 1 FROM `project_accounts` WHERE `project_accounts`.`project_id` = `projects`.`id`);
