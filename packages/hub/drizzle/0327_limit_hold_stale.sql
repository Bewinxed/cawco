-- When a session's hold at its account's limit went stale: held past the
-- cutoff (core `AtLimit.staleAfterHours`), nothing carries it on until a
-- person or its parent writes to it (hub at-limit.ts `goneStale`). Null while
-- it is carried on; every put of the hold clears it.
ALTER TABLE `limit_holds` ADD `stale_at` integer;
