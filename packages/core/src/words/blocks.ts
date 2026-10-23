/**
 * What a project page of blocks says (blocks/Block.svelte, BlockPage.svelte,
 * and the project page's Place on a page): a block's ⋯, the page's end, a
 * kept view's head. For the dashboard and the native app alike.
 *
 * `bun run words` writes these into the app as `Words.Blocks`
 * (CawCoCore/Words.generated.swift), and `words:check` fails the typecheck
 * chain when that file is stale. So a word is changed here or nowhere.
 */
export const blocksWords = {
  moveUp: "Move up",
  moveDown: "Move down",
  narrow: "Narrow",
  wide: "Wide",
  /** On one column a block's width changes nothing here: its ⋯ keeps it for wider screens. */
  widerScreens: "On wider screens",
  hide: "Hide",
  /** A custom view's block, back to its own tab. */
  showAsTab: "Show as a tab",
  /** The page's end: its hidden blocks, each shown again from there. */
  hidden: "Hidden",
  show: (title: string) => `Show ${title}`,
  /** A block a newer build drew: it keeps its place. */
  newer: "Update CawCo to see this block.",
  /** A kept view's ⋯ places it on a page, as a block. */
  placeOnPage: "Place on a page",
  /** A placement the hub refused without saying why. */
  notPlaced: "The hub did not place the view.",
};
