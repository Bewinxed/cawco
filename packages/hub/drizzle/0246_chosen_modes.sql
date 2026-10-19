-- The permission mode the person last chose for a harness on a machine, as
-- a start from the dashboard's or the app's form went out on it. A revive of
-- a session whose row records no mode runs on it (server.ts `settleMode`);
-- with none here the revive is refused. Nothing is filled in for machines
-- from before: the next start from a form files its mode.
CREATE TABLE `chosen_modes` (
	`machine_id` text NOT NULL,
	`harness` text NOT NULL,
	`permission_mode` text NOT NULL,
	`chosen_at` integer NOT NULL,
	PRIMARY KEY(`machine_id`, `harness`)
);
