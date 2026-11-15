-- The stream relay's health (`stream_relay.health`, each port's last STUN
-- answer) and when it was asked (`checked_at`) are not stored: the hub asks
-- each port again every minute and after each frame of its machine, and
-- keeps the last answer in memory (stream-relay.ts `health`), which the
-- journey reads while the relay is live. `checked_at` had no reader. Both
-- go, with what they held.
ALTER TABLE `stream_relay` DROP COLUMN `health`;--> statement-breakpoint
ALTER TABLE `stream_relay` DROP COLUMN `checked_at`;