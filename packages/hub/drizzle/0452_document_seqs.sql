-- A document is built when the preview server finds it read from a doc
-- that moved since (artifact-documents.ts), not on every update its doc
-- takes: each update had the hub encode the whole doc for its seed, 175 to
-- 260 ms a 150 ms burst on a 13 MB page (2026-11-19). `seqs` says which
-- docs, at which seq, it was read from; a row built before it reads `{}`,
-- which is never current, so its first open builds it again.
ALTER TABLE `artifact_documents` ADD `seqs` text DEFAULT '{}' NOT NULL;
