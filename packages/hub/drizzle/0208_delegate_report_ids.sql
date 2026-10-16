-- A report's turn identity is columns (audit S6): `recordedTurns` joined on
-- json_extract(payload, '$.resultId') and `claimCompletedTurn` loaded every
-- report's payload (127 KB at most) to read two fields. result_id and
-- completed_at leave the payload, indexed; the rest of it stays the kind's
-- own JSON, read whole.
ALTER TABLE `delegate_events` ADD `result_id` text;--> statement-breakpoint
ALTER TABLE `delegate_events` ADD `completed_at` text;--> statement-breakpoint
UPDATE `delegate_events` SET
  `result_id` = json_extract(`payload`, '$.resultId'),
  `completed_at` = json_extract(`payload`, '$.completedAt')
WHERE `kind` = 'report';--> statement-breakpoint
UPDATE `delegate_events` SET `payload` = json_remove(`payload`, '$.resultId', '$.completedAt')
WHERE `kind` = 'report';--> statement-breakpoint
CREATE INDEX `delegate_events_report` ON `delegate_events` (`instance_id`,`kind`,`result_id`);
