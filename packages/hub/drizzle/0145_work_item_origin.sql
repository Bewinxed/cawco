ALTER TABLE `work_items` ADD `origin` text DEFAULT 'you' NOT NULL;
--> statement-breakpoint
-- Items filed before origin was kept: Caw's own (an event's) when their
-- delegation chain reaches a project's lead or a routine, as caw-own.ts
-- decided by walking it; every other item is a person's or a session's ask.
UPDATE `work_items` SET `origin` = 'event' WHERE `id` IN (
	WITH RECURSIVE `chain`(`item`, `at`, `depth`) AS (
		SELECT `id`, `parent_instance_id`, 0 FROM `work_items`
		UNION ALL
		SELECT `chain`.`item`, `instances`.`parent_instance_id`, `chain`.`depth` + 1
		FROM `chain` JOIN `instances` ON `instances`.`id` = `chain`.`at`
		WHERE `instances`.`parent_instance_id` IS NOT NULL AND `chain`.`depth` < 32
	)
	SELECT `chain`.`item` FROM `chain` LEFT JOIN `instances` ON `instances`.`id` = `chain`.`at`
	WHERE `chain`.`at` LIKE 'routine:%' OR `instances`.`role` = 'lead'
);
