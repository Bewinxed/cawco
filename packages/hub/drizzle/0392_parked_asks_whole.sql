-- A parked ask saved before the `presentation` stamp (builds before 2026-10-08)
-- is not a whole ask to the schema and would stop boot. It goes: its daemon
-- re-announces a process's own ask after every register, and a move approval
-- is re-parked from its move row.
DELETE FROM `parked_asks` WHERE NOT (json_valid(`envelope`) AND json_extract(`envelope`, '$.payload.kind') = 'permission_request' AND json_type(`envelope`, '$.payload.presentation') = 'object' AND json_type(`envelope`, '$.payload.harness') = 'text' AND json_type(`envelope`, '$.payload.input') = 'object' AND json_type(`envelope`, '$.payload.toolName') = 'text' AND json_type(`envelope`, '$.payload.instanceId') = 'text' AND json_type(`envelope`, '$.payload.requestId') = 'text');
