-- An LFS endpoint git-lfs refused stands in Needs you until the person puts
-- it away (offers-waiting.ts), with the checkout it was refused in; and the
-- notes the hub wrote into a project's conversation about a routine, a
-- task's wait, a design offer or a repository go, since nothing the hub
-- writes about a project's thing is a line in the person's chat with Caw:
-- those now stand on the routine's or task's thread, or in Needs you.
ALTER TABLE `lfs_refusals` ADD `root` text;--> statement-breakpoint
ALTER TABLE `lfs_refusals` ADD `machine_id` text;--> statement-breakpoint
ALTER TABLE `lfs_refusals` ADD `dismissed_at` integer;--> statement-breakpoint
DELETE FROM `project_notes` WHERE json_extract(`note`, '$.event.kind') IN ('routine', 'routine-made', 'wait', 'design-offer', 'repo');
