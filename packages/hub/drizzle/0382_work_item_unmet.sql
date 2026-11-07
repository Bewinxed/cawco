-- When the hub sent an attempt's task back to todo because Jev did not show
-- its acceptance criteria met: the task counts it as a failed attempt.
ALTER TABLE `work_items` ADD `unmet_at` integer;
