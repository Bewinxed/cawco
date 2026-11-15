-- A parked ask's call input, as it was asked, gets a column of its own,
-- sealed under the hub's key (secret-box.ts): the envelope beside it keeps
-- the ask as every screen reads it. Null until the step before 0434
-- (db/migrate.ts `parked-inputs`, db/parked-inputs.ts) seals what each row
-- holds; 0434 then holds every row to one.
ALTER TABLE `parked_asks` ADD `input_sealed` text;
