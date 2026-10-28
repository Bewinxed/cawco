-- A thread's page reads the sessions Caw started from it (thread-transcript.ts).
CREATE INDEX `instances_thread` ON `instances` (`thread_id`);