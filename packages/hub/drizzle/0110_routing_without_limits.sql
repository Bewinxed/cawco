-- Spread and Soonest reset weigh the limits CawCo reads, which are Claude's,
-- ChatGPT's (openai-codex) and OpenCode Go's (core LIMITED_PROVIDERS when
-- this was written). For any other provider they only ever placed as Fill
-- first does, and its routing now offers Pinned and Fill first alone
-- (core `strategiesFor`): a choice stored as either is Fill first.
UPDATE `account_routing` SET `yours` = json_object('strategy', 'fill-first')
WHERE `provider` NOT IN ('anthropic', 'openai-codex', 'opencode-go')
  AND json_extract(`yours`, '$.strategy') IN ('spread', 'soonest-reset');--> statement-breakpoint
UPDATE `account_routing` SET `delegates` = json_object('strategy', 'fill-first')
WHERE `provider` NOT IN ('anthropic', 'openai-codex', 'opencode-go')
  AND json_extract(`delegates`, '$.strategy') IN ('spread', 'soonest-reset');
