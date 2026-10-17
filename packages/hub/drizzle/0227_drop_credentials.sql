-- The hub's phone bridge is gone (the iOS app's push is the phone channel):
-- the table that kept its pinned chat goes with it. Nothing else ever wrote a
-- row here.
DROP TABLE `credentials`;
