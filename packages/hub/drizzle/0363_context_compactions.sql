-- A session its harness compacted that has answered no request of its own
-- since: no filing at its context threshold starts until it has (server.ts
-- `fileMayStart`), so a compaction's own result never files.
CREATE TABLE `context_compactions` (
	`instance_id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade
);
