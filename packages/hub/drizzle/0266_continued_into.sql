-- The session a continuation moved a session's work item to (hub server.ts
-- `retireContinued`): the old one never runs again (core `relaunchOf`), and
-- what is sent to it goes there. Null on every row before it. Written by hand
-- in drizzle-kit 0.31.11's form (its generate no longer loads the schema in a
-- workspace: core process-identity.ts needs bun:ffi).
ALTER TABLE `instances` ADD `continued_into` text;
