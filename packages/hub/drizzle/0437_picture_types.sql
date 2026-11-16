-- A picture a turn carries is of a type some session's provider takes (core
-- `IMAGE_MEDIA_TYPES`: JPEG, PNG, GIF, WebP, HEIC, HEIF); one of any other
-- type is refused where it enters. A continuation or a move kept with a
-- picture of another type, which no provider would have taken, keeps every
-- other picture and loses that one; nothing else of the request changes,
-- and no row is deleted.
--
-- Every JSON function sits inside a CASE that proved its column JSON:
-- SQLite may run either side of an AND first.
UPDATE `continuations`
SET `request` = json_set(`request`, '$.images', (
  SELECT json_group_array(json(`value`))
  FROM json_each(`request`, '$.images')
  WHERE json_extract(`value`, '$.mediaType') IN ('image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif')
))
WHERE CASE WHEN json_valid(`request`) AND json_type(`request`, '$.images') = 'array' THEN
  EXISTS (
    SELECT 1 FROM json_each(`request`, '$.images')
    WHERE coalesce(json_extract(`value`, '$.mediaType'), '') NOT IN ('image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif')
  )
ELSE 0 END;
--> statement-breakpoint
UPDATE `moves`
SET `request` = json_set(`request`, '$.images', (
  SELECT json_group_array(json(`value`))
  FROM json_each(`request`, '$.images')
  WHERE json_extract(`value`, '$.mediaType') IN ('image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif')
))
WHERE CASE WHEN json_valid(`request`) AND json_type(`request`, '$.images') = 'array' THEN
  EXISTS (
    SELECT 1 FROM json_each(`request`, '$.images')
    WHERE coalesce(json_extract(`value`, '$.mediaType'), '') NOT IN ('image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif')
  )
ELSE 0 END;
