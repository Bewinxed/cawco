-- A task's to-do count now holds only its agreed to-dos (core todoProgress):
-- every task file is read again on the next scan, so a count that took in
-- offered ones is counted again.
UPDATE `project_tasks` SET `hash` = '';
