-- Every tool call a machine's gateway relayed under an idempotency key, and
-- its answer once it has one (tool-call-keys.ts): a call sent again under the
-- same key is answered the first answer, never run again.
CREATE TABLE `tool_call_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`status` integer,
	`headers` text,
	`body` blob,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tool_call_keys_at_idx` ON `tool_call_keys` (`at`);
