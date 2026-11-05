-- Every artifact carries a title its agent wrote in plain words
-- (artifact_create's `title`): what the panel head, the artifacts menu,
-- Needs you, chips and push text name it by. `name` stays its slug for agents
-- and URLs. Rows made before have none: empty.
ALTER TABLE `artifacts` ADD `title` text DEFAULT '' NOT NULL;
