-- The account a project's sessions start on when a start names none
-- (project-edit.ts `account`): null, the fleet's routing, for every project
-- as before; removing the account clears it.
ALTER TABLE `projects` ADD `account` text REFERENCES accounts(id) ON DELETE set null;
