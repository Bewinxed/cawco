-- What a work item's landing put where (hub work-items.ts `finish`,
-- design-system.ts `ownLandings`): kept when the item runs again, so a
-- follow-up that ends blocked, stopped or failed leaves landed work done and
-- its task in review, and a design system its own task landed is still its
-- builder's. Before it, Caw's send-back of a landed design build failed the
-- attempt and parked its fix as a proposal nobody could approve (nightly
-- 3944). Items that landed before carry none.
ALTER TABLE `work_items` ADD `landed` text;
