-- A tool with its own sign-in (core ToolSpec.signin, the Antigravity CLI):
-- whether it is signed in on the machine, as the machine last read it.
ALTER TABLE `agent_tools` ADD `signin` text;
