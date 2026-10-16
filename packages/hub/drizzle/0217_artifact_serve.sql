-- A workspace preview names what serves its port (core `ServeSpec`): the
-- command the workspace's stage runs and keeps up, and its folder from the
-- clone's root. A preview made before this names none.
ALTER TABLE `artifacts` ADD `source_serve_command` text;--> statement-breakpoint
ALTER TABLE `artifacts` ADD `source_serve_cwd` text;