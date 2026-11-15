-- An approval's call input gets a sealed column of its own, and a parked
-- ask its call's keyed digest (call-digest.ts): the step before 0436
-- (db/migrate.ts `ask-inputs`, db/asks-inputs.ts) fills both, holding the
-- hub's key, and rewrites every permit's and approval's kept record to the
-- card's input. Null until then.
ALTER TABLE `asks` ADD `input_sealed` text;--> statement-breakpoint
ALTER TABLE `parked_asks` ADD `call_digest` text;