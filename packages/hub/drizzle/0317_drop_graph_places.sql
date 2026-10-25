-- The decision graph is gone, and with it the person's drags it kept in a
-- page's state under `graph.places`. Just before this migration the hub takes
-- that key out of every page's doc (db/drop-graph-places.ts), so an old drag
-- no longer counts as a pick made after the page's send; here its change row
-- goes too, so artifact_read's `since` names no key the state no longer holds.
DELETE FROM `artifact_changes` WHERE `key` = 'graph.places';
