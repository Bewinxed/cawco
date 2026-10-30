-- One kind of session (one-session build, slice 1): a session's scope is its
-- folder and its project, and no role marks the session a project's events
-- reach. Its project's row names it (`projects.lead_instance_id`).
--
-- The session a project's events started is `project` where it was `caw`.
-- A session that conversation started takes the origin its caller asked for,
-- as every other start does: `delegate` when it runs a work item, else
-- `check`.
UPDATE `instances` SET `origin` = 'project' WHERE `origin` = 'caw' AND `role` = 'lead';--> statement-breakpoint
UPDATE `instances` SET `origin` = CASE WHEN `work_item_id` IS NOT NULL THEN 'delegate' ELSE 'check' END WHERE `origin` = 'caw';--> statement-breakpoint
-- The role goes: such a session is a worker, read from how it started.
UPDATE `instances` SET `role` = NULL WHERE `role` = 'lead';--> statement-breakpoint
-- A routine that messages the project's conversation, and an inbound event
-- kept for it, name it so.
UPDATE `routines` SET `target` = 'conversation' WHERE `target` = 'lead';--> statement-breakpoint
UPDATE `inbound_events` SET `routed_to` = 'conversation' WHERE `routed_to` = 'lead';--> statement-breakpoint
-- A routine the project's conversation made was made by a session.
UPDATE `routines` SET `made_by` = 'session' WHERE `made_by` = 'caw';--> statement-breakpoint
-- So is the notice that says so: Caw's name is drawn from the session now.
UPDATE `thread_messages` SET `event` = json_set(`event`, '$.by', 'session') WHERE json_extract(`event`, '$.kind') = 'routine-made' AND json_extract(`event`, '$.by') = 'caw';--> statement-breakpoint
-- A start still owed to its machine names no role the hub reads now.
UPDATE `instances` SET `owed_spawn` = json_remove(`owed_spawn`, '$.payload.role') WHERE json_extract(`owed_spawn`, '$.payload.role') = 'lead';
