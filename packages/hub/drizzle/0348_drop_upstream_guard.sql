-- No choice holds a session's writes to any repository: the fleet's answer
-- (`upstream_settings`), each project's own (`projects.upstream_posts`) and
-- every post held for the person's answer (a parked ask carrying
-- `upstreamPost`) go.
DROP TABLE `upstream_settings`;--> statement-breakpoint
ALTER TABLE `projects` DROP COLUMN `upstream_posts`;--> statement-breakpoint
DELETE FROM `parked_asks` WHERE json_valid(`envelope`) AND json_type(`envelope`, '$.payload.upstreamPost') IS NOT NULL;
