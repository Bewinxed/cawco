-- Review before done becomes Who decides' `done` kind (core decides.ts): a
-- project whose review was off is owed a decides.md line handing marking
-- tasks done to Caw, which the hub writes as it starts
-- (done-routes-carried.ts); one whose review was on follows the fleet's
-- `done`, which is You, and is owed nothing.
CREATE TABLE `done_routes_owed` (
	`project_id` text PRIMARY KEY NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `done_routes_owed` (`project_id`) SELECT `id` FROM `projects` WHERE `review` = 0;--> statement-breakpoint
ALTER TABLE `projects` DROP COLUMN `review`;
