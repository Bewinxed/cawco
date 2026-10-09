CREATE TABLE `project_repositories` (
	`project_id` text NOT NULL,
	`machine_id` text NOT NULL,
	`path` text NOT NULL,
	`recorded_at` integer NOT NULL,
	PRIMARY KEY(`project_id`, `machine_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Each project's repository on each machine, from the workspaces of it still
-- active there; the newest one cut stands. One cut from another workspace's
-- clone is left out: that clone is no repository of its own.
INSERT OR REPLACE INTO `project_repositories` (`project_id`, `machine_id`, `path`, `recorded_at`)
SELECT `p`.`project_id`, `w`.`machine_id`, `w`.`repo_root`, `w`.`created_at`
FROM `workspaces` `w`
JOIN `project_places` `p`
  ON `p`.`kind` = 'workspace' AND `p`.`machine_id` = `w`.`machine_id` AND `p`.`path` = `w`.`path`
WHERE `w`.`state` = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM `workspaces` `s`
    WHERE `s`.`machine_id` = `w`.`machine_id` AND `s`.`path` = `w`.`repo_root`
  )
ORDER BY `w`.`created_at`;
