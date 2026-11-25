-- Whether agents may file usability feedback on CawCo's own tools as issues
-- on CawCo's repository (the owner, 2026-11-25). Null until a person
-- answers, so the dashboard asks; off until then.
ALTER TABLE `supervisor_config` ADD `usability_feedback` integer;
