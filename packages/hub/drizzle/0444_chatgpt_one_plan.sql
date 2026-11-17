-- A ChatGPT session runs on one plan (the owner's pick, 2026-11-17, "Move
-- only to an API key"): OpenAI's Sign in with ChatGPT terms bar an app from
-- "splitting usage, rotating accounts, or otherwise bypassing usage limits".
-- ChatGPT's routing (provider openai-codex) now offers Pinned alone (core
-- `strategiesFor`): a choice stored as Fill first, Spread or Soonest reset
-- is Pinned, its pin none, so the first ChatGPT plan by order stands in.
UPDATE `account_routing` SET `yours_strategy` = 'pinned', `yours_pinned` = NULL
WHERE `provider` = 'openai-codex' AND `yours_strategy` <> 'pinned';--> statement-breakpoint
UPDATE `account_routing` SET `delegates_strategy` = 'pinned', `delegates_pinned` = NULL
WHERE `provider` = 'openai-codex' AND `delegates_strategy` <> 'pinned';--> statement-breakpoint
-- A session its account's removal or sign-out left on no account names
-- that account and its provider: one a ChatGPT plan left goes back on that
-- plan alone (hub launch-accounts.ts `accountLaunch`). A row stranded
-- before names neither, and is placed as it was.
ALTER TABLE `stranded_sessions` ADD `account_id` text;--> statement-breakpoint
ALTER TABLE `stranded_sessions` ADD `provider` text;
