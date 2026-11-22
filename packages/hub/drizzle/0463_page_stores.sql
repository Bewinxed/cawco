-- A page on the design graph keeps its own state in a Yjs store, one per
-- artifact and one per project (hub artifacts/page-stores.ts): each store's
-- update log, kept as an artifact's doc's is, going with its artifact or
-- its project.
CREATE TABLE `page_store_updates` (
	`store` text NOT NULL,
	`artifact_id` text,
	`project_id` text,
	`seq` integer NOT NULL,
	`update` blob NOT NULL,
	PRIMARY KEY(`store`, `seq`),
	FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "page_store_updates_one_owner" CHECK(("artifact_id" is null) <> ("project_id" is null))
);
--> statement-breakpoint
CREATE INDEX `page_store_updates_artifact` ON `page_store_updates` (`artifact_id`) WHERE "page_store_updates"."artifact_id" is not null;--> statement-breakpoint
CREATE INDEX `page_store_updates_project` ON `page_store_updates` (`project_id`) WHERE "page_store_updates"."project_id" is not null;