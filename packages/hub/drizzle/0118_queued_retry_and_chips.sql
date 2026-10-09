ALTER TABLE `queued_task_starts` ADD `retry` integer DEFAULT false NOT NULL;
--> statement-breakpoint
-- A delegation queued for owned files is a chip in its parent's tray under
-- the ids its item and session take when it starts (work-items.ts
-- `queuedAs`): the item takes the row's id, the session a new v4 id made here.
UPDATE `queued_work_items`
SET `request` = json_set(
  `request`,
  '$.queuedAs',
  json_object(
    'id', `id`,
    'instanceId',
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6)))
  )
)
WHERE json_extract(`request`, '$.queuedAs') IS NULL;
