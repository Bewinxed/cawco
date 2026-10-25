-- A delegate's workspace is no place of its project any more: its machine
-- places the project's rows in the clone as it cuts it, and the hub sends
-- each machine a project's rows once, with its checkouts there. The places
-- of kind `workspace` the hub filed as workspaces opened go.
DELETE FROM `project_places` WHERE `kind` = 'workspace';
