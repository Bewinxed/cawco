-- Every foreign key into a large table, and what a tree serves, found by
-- key instead of read whole (the hub's law control-reads-keyed). A
-- workspace's insert or delete read every artifact for
-- `artifacts.source_workspace`; a session's delete, every artifact for
-- `made_by`; a project's, every artifact and every session for
-- `project_id`; an account's, every conversation; an event route's, every
-- inbound event. The artifacts a workspace or place serves (db/artifacts.ts
-- `previewing`, on each frame of the stage a design or preview starts), those a pin
-- serves (`pinnedBy`) and a machine's pins (`pinsOn`) each read every
-- artifact too.
CREATE INDEX `artifacts_made_by` ON `artifacts` (`made_by`);--> statement-breakpoint
CREATE INDEX `artifacts_project` ON `artifacts` (`project_id`);--> statement-breakpoint
CREATE INDEX `artifacts_source_workspace` ON `artifacts` (`source_workspace`) WHERE "artifacts"."source_workspace" is not null;--> statement-breakpoint
CREATE INDEX `artifacts_source_place` ON `artifacts` (`source_place`) WHERE "artifacts"."source_place" is not null;--> statement-breakpoint
CREATE INDEX `artifacts_machine_dir` ON `artifacts` (`machine_id`,`source_dir`);--> statement-breakpoint
CREATE INDEX `artifacts_source_pin` ON `artifacts` (`source_pin`) WHERE "artifacts"."source_pin" is not null;--> statement-breakpoint
CREATE INDEX `inbound_events_route` ON `inbound_events` (`route_id`) WHERE "inbound_events"."route_id" is not null;--> statement-breakpoint
CREATE INDEX `instance_conversations_account` ON `instance_conversations` (`account_id`) WHERE "instance_conversations"."account_id" is not null;--> statement-breakpoint
CREATE INDEX `instances_project` ON `instances` (`project_id`) WHERE "instances"."project_id" is not null;