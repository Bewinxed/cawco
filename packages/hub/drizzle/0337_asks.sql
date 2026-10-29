-- The ask, slice 1 (tsk-122): what a session asked the person and the hub
-- carries out, one row each (core asks.ts, hub admin-asks.ts). The asking
-- call answers at once and the answer reaches the session as a message, so
-- no held call is cut by an agent, gateway or hub restart.
CREATE TABLE `asks` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text NOT NULL,
	`state` text NOT NULL,
	`raised_at` integer NOT NULL,
	`record` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `asks_instance` ON `asks` (`instance_id`);--> statement-breakpoint
CREATE INDEX `asks_state` ON `asks` (`state`);--> statement-breakpoint
-- An admin write parked before this kept its envelope with the session asks;
-- it is an open ask now, its id `ask_` and its request id, raised when it was.
INSERT OR IGNORE INTO `asks` (`id`, `instance_id`, `state`, `raised_at`, `record`)
SELECT 'ask_' || `request_id`, `instance_id`, 'open',
	COALESCE(json_extract(`envelope`, '$.payload.raisedAt'), CAST(strftime('%s', 'now') AS INTEGER) * 1000),
	json_patch(
		json_object('asked', json_patch(
			json_object(
				'kind', 'approve',
				'tool', json_extract(`envelope`, '$.payload.adminWrite'),
				'input', json(COALESCE(json_extract(`envelope`, '$.payload.input'), '{}')),
				'carry', json_object('by', 'hub', 'tool', json_extract(`envelope`, '$.payload.adminWrite'))
			),
			json_object('source', json(json_extract(`envelope`, '$.payload.sourceFacts')))
		)),
		json_object(
			'threadId', json_extract(`envelope`, '$.payload.threadId'),
			'toolUseId', json_extract(`envelope`, '$.payload.toolUseId')
		)
	)
FROM `parked_asks`
WHERE `instance_id` IS NOT NULL AND json_type(`envelope`, '$.payload.adminWrite') = 'text';--> statement-breakpoint
DELETE FROM `parked_asks` WHERE json_type(`envelope`, '$.payload.adminWrite') = 'text';
