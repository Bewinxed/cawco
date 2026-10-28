-- GitHub discussions are their own event kinds, named as GitHub's webhooks
-- name them (github.ts): `discussion.created` for a discussion opened (was
-- `discussion.opened`), and `discussion_comment.created` for a comment on
-- one (was `comment.created`, beside an issue's or pull request's). The
-- events stored so far and the routes that name them read the new kinds; a
-- route that took `comment.created` took discussion comments too, and still
-- does.
UPDATE `inbound_events` SET `kind` = 'discussion.created' WHERE `kind` = 'discussion.opened';--> statement-breakpoint
UPDATE `inbound_events` SET `kind` = 'discussion_comment.created' WHERE `kind` = 'comment.created' AND `delivery_key` LIKE 'discussion-comment:%';--> statement-breakpoint
UPDATE OR IGNORE `event_route_kinds` SET `kind` = 'discussion.created' WHERE `kind` = 'discussion.opened';--> statement-breakpoint
DELETE FROM `event_route_kinds` WHERE `kind` = 'discussion.opened';--> statement-breakpoint
INSERT OR IGNORE INTO `event_route_kinds` (`route_id`, `kind`) SELECT `route_id`, 'discussion_comment.created' FROM `event_route_kinds` WHERE `kind` = 'comment.created';
