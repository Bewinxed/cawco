-- Where each of the hub's own lines stands in a session's transcript: after
-- the rows it followed when it was first placed, the nearest first (schema
-- `lineAnchors`). A line written before this table has none, and gets one
-- the first time a read places it, by its clock, once.
CREATE TABLE `line_anchors` (
	`instance_id` text NOT NULL,
	`line_id` text NOT NULL,
	`after` text NOT NULL,
	PRIMARY KEY(`instance_id`, `line_id`),
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade
);
