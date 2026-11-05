-- A show keeps its revision across a hub restart (preview.ts PreviewTarget.revision): a panel open across it loads its page again only for a new show.
ALTER TABLE `shown_previews` ADD `revision` text;
