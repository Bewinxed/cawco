-- A delete with its files removes only the checkouts CawCo made (the owner,
-- 2026-11-19: "Only what CawCo made"; project-delete.ts). Nothing recorded
-- how a place came to be before now, so every place filed until here reads
-- as one the person named, and stays on disk.
ALTER TABLE `project_places` ADD `made` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- A checkout whose folder had stood there and its machine did not find,
-- read at each register (machine-commands.ts `learnCheckout`); none is
-- known missing until then.
ALTER TABLE `project_places` ADD `missing` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- A checkout whose folder has stood there: a session start never makes it
-- again (launches.ts `placeHolding`). Every checkout filed until here counts
-- as found, so one whose folder was moved or removed by hand before now is
-- refused at its next start, never made again empty.
ALTER TABLE `project_places` ADD `found` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `project_places` SET `found` = 1 WHERE `kind` = 'checkout';
