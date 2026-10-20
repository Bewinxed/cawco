-- What an account's sessions do at a plan limit while its extra usage is on
-- (core `AtPlanLimit`): `move` to an account with plan room, the default every
-- existing account takes, or keep going on its `extra-usage`.
ALTER TABLE `accounts` ADD `at_plan_limit` text DEFAULT 'move' NOT NULL;
