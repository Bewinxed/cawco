-- What a machine's pause stopped as it began (machine-pause.ts): how many
-- running checks, workflow commands and other commands, as JSON counts.
ALTER TABLE `agents` ADD `pause_stopped` text;
