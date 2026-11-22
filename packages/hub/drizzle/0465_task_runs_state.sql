-- The open runs read by state across every routine (the scheduler's live
-- runs, its queued routines) seek this index instead of reading task_runs
-- whole: the hub's law control-reads-keyed.
CREATE INDEX `task_runs_state` ON `task_runs` (`state`,`trigger_id`);