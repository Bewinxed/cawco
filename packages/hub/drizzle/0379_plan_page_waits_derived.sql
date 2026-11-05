-- What a session's plan waits on the person on is read from Needs you on
-- every read (core plan.ts `planWaitsOf`), never stored: the plan's page
-- waits kept here went stale once a page was answered or closed with no
-- later change to its doc, and the recap and the plan panel named it still.
-- An ask made at work on the plan keeps its step in the artifact's own ask
-- (needs.ts `ArtifactAsked.step`), which holds it until it is answered.
ALTER TABLE `session_plans` DROP COLUMN `page_waits`;
