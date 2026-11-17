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
ALTER TABLE `stranded_sessions` ADD `provider` text;--> statement-breakpoint
-- A move the hub owed a ChatGPT session to another ChatGPT plan is not
-- made; a person's own (`by_hand`, `move_asked`) stays. One off a removed or
-- signed-out plan, its row already on no account, strands it as that
-- removal does now, named by the plan its line moves it from.
INSERT OR REPLACE INTO `stranded_sessions` (`instance_id`, `account_name`, `why`, `since`, `account_id`, `provider`)
SELECT `owed_moves`.`instance_id`,
  coalesce(json_extract(`owed_moves`.`move`, '$.from.name'), 'its ChatGPT plan'),
  CASE WHEN json_extract(`owed_moves`.`move`, '$.removed') THEN 'removed' ELSE 'signed-out' END,
  CAST(unixepoch('subsec') * 1000 AS INTEGER),
  json_extract(`owed_moves`.`move`, '$.from.id'),
  'openai-codex'
FROM `owed_moves` JOIN `instances` ON `instances`.`id` = `owed_moves`.`instance_id`
WHERE `owed_moves`.`by_hand` = 0
  AND `instances`.`account_id` IS NULL
  AND `owed_moves`.`to_account_id` IN (SELECT `id` FROM `accounts` WHERE `provider` = 'openai-codex')
  AND (json_extract(`owed_moves`.`move`, '$.removed') OR json_extract(`owed_moves`.`move`, '$.signedOut'));--> statement-breakpoint
DELETE FROM `owed_moves`
WHERE `by_hand` = 0
  AND `to_account_id` IN (SELECT `id` FROM `accounts` WHERE `provider` = 'openai-codex')
  AND `instance_id` IN (
    SELECT `instances`.`id` FROM `instances`
    LEFT JOIN `accounts` ON `accounts`.`id` = `instances`.`account_id`
    WHERE (`accounts`.`provider` = 'openai-codex' AND `instances`.`account_id` <> `owed_moves`.`to_account_id`)
      OR `instances`.`id` IN (SELECT `instance_id` FROM `stranded_sessions` WHERE `provider` = 'openai-codex')
  );--> statement-breakpoint
DELETE FROM `limit_compactions`
WHERE `kind` = 'move'
  AND coalesce(`move_asked`, 0) = 0
  AND `move_to_account_id` IN (SELECT `id` FROM `accounts` WHERE `provider` = 'openai-codex')
  AND `instance_id` IN (
    SELECT `instances`.`id` FROM `instances`
    JOIN `accounts` ON `accounts`.`id` = `instances`.`account_id`
    WHERE `accounts`.`provider` = 'openai-codex'
      AND `instances`.`account_id` <> `limit_compactions`.`move_to_account_id`
  );
