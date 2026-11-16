-- A hook that calls an MCP tool names the server holding it `server` and the
-- tool `tool`, as Claude Code's settings read them (the Agent SDK's
-- `Settings` hook, typed from the CLI's own schema). The fleet's rows wrote
-- `mcp_server_name` and `tool_name`, which Claude Code never read, so no
-- such hook ever ran. Each one's two fields are renamed, in the fleet's hooks
-- and in their history; every other field, and every other handler, stays as
-- it was. No row is deleted. A machine's own copy of the fleet's hooks (its
-- fleet harness set and its places' sets) is rewritten the same way as its
-- agent starts (agent hook-fields-move.ts).
--
-- Every JSON function sits inside a CASE that proved its column JSON:
-- SQLite may run either side of an AND first.
UPDATE `fleet_hooks`
SET `handler` = json_remove(
  json_set(
    `handler`,
    '$.server', json_extract(`handler`, '$.mcp_server_name'),
    '$.tool', json_extract(`handler`, '$.tool_name')
  ),
  '$.mcp_server_name',
  '$.tool_name'
)
WHERE CASE WHEN json_valid(`handler`) THEN
  json_extract(`handler`, '$.type') = 'mcp_tool'
  AND json_type(`handler`, '$.server') IS NULL
ELSE 0 END;
--> statement-breakpoint
UPDATE `fleet_hook_history`
SET `handler` = json_remove(
  json_set(
    `handler`,
    '$.server', json_extract(`handler`, '$.mcp_server_name'),
    '$.tool', json_extract(`handler`, '$.tool_name')
  ),
  '$.mcp_server_name',
  '$.tool_name'
)
WHERE CASE WHEN json_valid(`handler`) THEN
  json_extract(`handler`, '$.type') = 'mcp_tool'
  AND json_type(`handler`, '$.server') IS NULL
ELSE 0 END;
--> statement-breakpoint
-- An agent hook's `agent` (the subagent it named) is a field Claude Code's
-- settings never read (its `AgentHookSchema` takes `prompt`, `if`,
-- `timeout`, `model`, `statusMessage` and `once`): it goes from the fleet's
-- hooks and their history, every other field kept.
UPDATE `fleet_hooks`
SET `handler` = json_remove(`handler`, '$.agent')
WHERE CASE WHEN json_valid(`handler`) THEN
  json_extract(`handler`, '$.type') = 'agent'
  AND json_type(`handler`, '$.agent') IS NOT NULL
ELSE 0 END;
--> statement-breakpoint
UPDATE `fleet_hook_history`
SET `handler` = json_remove(`handler`, '$.agent')
WHERE CASE WHEN json_valid(`handler`) THEN
  json_extract(`handler`, '$.type') = 'agent'
  AND json_type(`handler`, '$.agent') IS NOT NULL
ELSE 0 END;
