-- A queued task start keeps whose it was (work_items.origin): a start of
-- yours that waited behind owned files, or for a slot under max_attempts,
-- starts as yours, so its attempt is by_person and its failure reaches your
-- phone. Starts queued before keep null and start as their parent's.
ALTER TABLE `queued_task_starts` ADD `origin` text;
