-- A move waiting for work in flight ("Can't move from A to B yet") is one
-- line per session, said again in its place while it waits, gone once the
-- move lands or the wait ends (hub db/at-limit.ts `waitsLine`). Before, every
-- attempt wrote a line of its own: they all go, but for a session still held
-- whose newest line is one, which stands as its one line.
DELETE FROM `limit_events`
WHERE json_extract(`move`, '$.kind') = 'unmoved'
  AND json_extract(`move`, '$.action') = 'move'
  AND json_extract(`move`, '$.waits') = 1
  AND `id` NOT IN (
    SELECT `e`.`id`
    FROM `limit_events` AS `e`
    JOIN `limit_holds` AS `h` ON `h`.`instance_id` = `e`.`instance_id`
    WHERE `e`.`at` = (
      SELECT max(`x`.`at`) FROM `limit_events` AS `x`
      WHERE `x`.`instance_id` = `e`.`instance_id`
    )
  );
