-- Each fact the person forgot (forget-fact.ts), as the secret filter keeps it
-- out of every answer: its word count and a salted sha256 of its words, never
-- the words, since a machine's transcript index may still hold them.
CREATE TABLE `forgotten_facts` (
	`id` text PRIMARY KEY NOT NULL,
	`salt` text NOT NULL,
	`hash` text NOT NULL,
	`words` integer NOT NULL,
	`forgotten_at` integer NOT NULL
);
