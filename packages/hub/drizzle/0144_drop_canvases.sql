-- The canvases' picks move into artifacts' Yjs documents, which SQL cannot
-- write: the tables are set aside here, and the hub imports and drops them at
-- its start (artifacts/legacy.ts).
ALTER TABLE `canvas_choices` RENAME TO `legacy_canvas_choices`;--> statement-breakpoint
ALTER TABLE `canvases` RENAME TO `legacy_canvases`;
