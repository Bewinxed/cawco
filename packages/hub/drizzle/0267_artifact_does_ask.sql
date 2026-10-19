-- Every artifact carries what the person does on it (`does`: pick, judge,
-- try or draw) and its one line in the panel's head (`ask`). Rows made
-- before have neither: they read as judge, and the head shows the name alone.
ALTER TABLE `artifacts` ADD `does` text DEFAULT 'judge' NOT NULL;--> statement-breakpoint
ALTER TABLE `artifacts` ADD `ask` text DEFAULT '' NOT NULL;
