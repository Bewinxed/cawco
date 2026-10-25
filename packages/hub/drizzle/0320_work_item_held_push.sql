-- The commit a held build's landing pushed to its own branch is kept on its
-- work item past its end, so a later attempt's push there replaces it.
ALTER TABLE `work_items` ADD `held_push` text;
