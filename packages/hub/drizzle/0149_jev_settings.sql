-- Jev's own settings (schema.ts `jevSettings`): the TypeSafe key the hub
-- reaches Jev with directly, and the composer's suggestions switch, which
-- moves here off the OpenRouter row so it holds on either route. A hub that
-- had the switch on keeps it on.
CREATE TABLE `jev_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`typesafe_key` text,
	`typesafe_key_set_at` integer,
	`suggest_while_typing` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
INSERT INTO `jev_settings` (`id`, `suggest_while_typing`)
SELECT 'jev', `suggest_while_typing` FROM `openrouter_connection` WHERE `id` = 'openrouter';
--> statement-breakpoint
ALTER TABLE `openrouter_connection` DROP COLUMN `suggest_while_typing`;
