-- A session's compaction plan is a move's (`move`, `compact_uuid`) or its
-- filing at its context threshold (`fill`, no `/compact`); `context_rises`
-- keeps that one rise files once, until its harness compacts it. Each
-- provider's compaction policy gains `fileAtPct` (core `Compaction`), its
-- default 85.
CREATE TABLE `context_rises` (
	`instance_id` text PRIMARY KEY NOT NULL,
	`line_id` text NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_limit_compactions` (
	`instance_id` text PRIMARY KEY NOT NULL,
	`stage` text NOT NULL,
	`line_id` text NOT NULL,
	`move` text,
	`fill` text,
	`carry_uuid` text,
	`filing_uuid` text NOT NULL,
	`compact_uuid` text,
	`compacted` integer DEFAULT false NOT NULL,
	`ended_step` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_limit_compactions`("instance_id", "stage", "line_id", "move", "fill", "carry_uuid", "filing_uuid", "compact_uuid", "compacted", "ended_step", "created_at") SELECT "instance_id", "stage", "line_id", "move", NULL, "carry_uuid", "filing_uuid", "compact_uuid", "compacted", "ended_step", "created_at" FROM `limit_compactions`;--> statement-breakpoint
DROP TABLE `limit_compactions`;--> statement-breakpoint
ALTER TABLE `__new_limit_compactions` RENAME TO `limit_compactions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
UPDATE `account_routing` SET `at_limit` = json_set(`at_limit`, '$.compaction.fileAtPct', 85) WHERE json_type(`at_limit`, '$.compaction') = 'object' AND json_type(`at_limit`, '$.compaction.fileAtPct') IS NULL;
