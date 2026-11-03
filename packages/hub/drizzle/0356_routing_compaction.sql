-- Each provider's at-limit policy gains how a moving session is compacted
-- (core `Compaction`, its default `DEFAULT_COMPACTION`), and loses
-- `prepareAtPct`, which nothing has read since the summary it timed went.
UPDATE `account_routing` SET `at_limit` = json_remove(json_set(`at_limit`, '$.compaction', json('{"beforeMove":"native","atLimit":"summary","summarizer":{"harness":"claude","model":"claude-sonnet-5-5"}}')), '$.prepareAtPct') WHERE json_type(`at_limit`, '$.compaction') IS NULL;
