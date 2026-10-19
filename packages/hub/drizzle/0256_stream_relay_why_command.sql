-- The command a stream relay failure names as its fix (core RELAY_FAILURES),
-- kept beside its sentence so Settings › Browsers shows it as code. A new
-- nullable column: nothing is rebuilt, and a relay from before reads none.
ALTER TABLE `stream_relay` ADD `why_command` text;