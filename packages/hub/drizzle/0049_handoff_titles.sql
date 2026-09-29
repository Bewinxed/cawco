-- Titles derived before the title rule dropped the hand-off marker named a
-- session after who sent it. Cleared, so the next register names them again
-- from the brief.
UPDATE `instances` SET `derived_title` = NULL WHERE `derived_title` LIKE '[Hand-off from the %';
