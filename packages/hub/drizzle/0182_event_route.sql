-- An inbound event knows the route that delivered it (ingress.ts `route`):
-- the oldest matching route to the routine it went to, null for one that
-- went to the lead or nowhere, and set to null when that route is deleted.
-- Events stored before this stay unattributed. drizzle-kit 0.31.11 wrote
-- this without its ON DELETE, which would refuse a route's delete while an
-- event names it.
ALTER TABLE `inbound_events` ADD `route_id` text REFERENCES event_routes(id) ON DELETE set null;
