-- What the hub let go each time it replaced an artifact's doc with one
-- holding its live content alone (artifacts/shed.ts): a device whose copy
-- names a client the replaced docs held is told to take the new doc.
CREATE TABLE `artifact_retired` (
	`artifact_id` text PRIMARY KEY NOT NULL,
	`retired` blob NOT NULL,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE cascade
);
