-- Your words that did not wake Caw are typed data on their note (core
-- threads.ts `CawNotWoken`): the message he has not read, why, and the hub's
-- sentence for it, which the thread's Try again reads. Notes written before
-- carried the cause only in prose:
--   Caw hasn't read your message: <cause>. Your message is kept in this
--   thread. Write again to wake him with it.
-- Each gets its cause as `words` (its stop back on), its reason read from
-- the sentences the hub wrote for them (the rest are `failed`), and the
-- message it was about: the thread's newest words of yours before it. The
-- prose goes; the note is its title and its data.
UPDATE `thread_messages`
SET
	`event` = json_set(
		`event`,
		'$.notWoken',
		json_object(
			'message', (
				SELECT `yours`.`id` FROM `thread_messages` AS `yours`
				WHERE `yours`.`thread_id` = `thread_messages`.`thread_id`
					AND `yours`.`author` = 'you'
					AND `yours`.`answer` IS NULL
					AND `yours`.`created_at` <= `thread_messages`.`created_at`
				ORDER BY `yours`.`created_at` DESC, `yours`.`rowid` DESC
				LIMIT 1
			),
			'reason', CASE
				WHEN `body` LIKE '%his session didn''t take it%' THEN 'not-taken'
				WHEN `body` LIKE '%No machine is online%' THEN 'no-machine'
				WHEN `body` LIKE '%Caw takes no turn until the next%' THEN 'capped'
				ELSE 'failed'
			END,
			'words', CASE
				WHEN `body` LIKE '%his session didn''t take it%' THEN 'His session didn''t take the message.'
				WHEN `body` LIKE 'Caw hasn''t read your message: %. Your message is kept in this thread.%' THEN substr(
					`body`,
					length('Caw hasn''t read your message: ') + 1,
					instr(`body`, '. Your message is kept in this thread.') - length('Caw hasn''t read your message: ')
				)
				ELSE `body`
			END
		)
	),
	`body` = ''
WHERE `author` = 'event'
	AND json_extract(`event`, '$.kind') = 'caw'
	AND json_extract(`event`, '$.what') = 'not-woken'
	AND json_extract(`event`, '$.notWoken') IS NULL
	AND EXISTS (
		SELECT 1 FROM `thread_messages` AS `yours`
		WHERE `yours`.`thread_id` = `thread_messages`.`thread_id`
			AND `yours`.`author` = 'you'
			AND `yours`.`answer` IS NULL
			AND `yours`.`created_at` <= `thread_messages`.`created_at`
	);
