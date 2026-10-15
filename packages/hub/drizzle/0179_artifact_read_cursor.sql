-- artifact_list (artifacts/service.ts `status`): the seq each session last
-- read its artifact at, and the revision a person last had on screen. An
-- artifact made before starts read up to what its session was last told of.
ALTER TABLE `artifacts` ADD `read_seq` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `artifacts` SET `read_seq` = `delivered_seq`;--> statement-breakpoint
ALTER TABLE `artifacts` ADD `opened_revision` integer;
