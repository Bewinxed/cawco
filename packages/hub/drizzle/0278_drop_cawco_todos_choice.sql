-- A session's plan is CawCo's list on every harness, always: the fleet's
-- "CawCo's to-dos" choice is gone, and every session is denied its harness's
-- own list and plan mode at spawn (core OWN_LIST_DENIED).
ALTER TABLE `supervisor_config` DROP COLUMN `cawco_todos`;
