-- Each account's window set: the windows its provider's last report that
-- named them carried (core `AccountReading.windowKinds`), so a window the
-- provider stopped reporting (a verified Ultra account's session one) is
-- dropped at once. Null on the rows made before, until a report names it.
ALTER TABLE `account_readings` ADD `window_kinds` text;
