-- A session files its open items within a room of the point where its
-- harness compacts it on its own (core `Compaction.fileRoom`, tokens), no
-- longer at a share of its window (`fileAtPct`): a policy of 0 stays off,
-- any other takes the default room, 30,000. A filing stored with the window
-- it fired at names that window as the point it fired short of.
UPDATE `account_routing` SET `at_limit` = json_remove(json_set(`at_limit`, '$.compaction.fileRoom', CASE WHEN json_extract(`at_limit`, '$.compaction.fileAtPct') = 0 THEN 0 ELSE 30000 END), '$.compaction.fileAtPct') WHERE json_type(`at_limit`, '$.compaction') = 'object' AND json_type(`at_limit`, '$.compaction.fileRoom') IS NULL;--> statement-breakpoint
UPDATE `limit_compactions` SET `fill` = json_remove(json_set(`fill`, '$.compactsAt', json_extract(`fill`, '$.window')), '$.window') WHERE `fill` IS NOT NULL AND json_type(`fill`, '$.compactsAt') IS NULL;--> statement-breakpoint
UPDATE `session_lines` SET `content` = json_remove(json_set(`content`, '$.fill.compactsAt', json_extract(`content`, '$.fill.window')), '$.fill.window') WHERE `kind` = 'context' AND json_extract(`content`, '$.kind') = 'filing' AND json_type(`content`, '$.fill.compactsAt') IS NULL;
