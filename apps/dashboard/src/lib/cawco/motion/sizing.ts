/**
 * The attributes whose turning can move a box's size or a row's place
 * anywhere: a class, `hidden`, `open`, and bits-ui's `data-state`. What
 * morph (a container's size) and reflow (a list's rows) hear by default.
 *
 * A state its site keeps on an attribute of its own (a class is a style, a
 * state is an attribute: `data-wide`, `data-two`, `data-bare`) is named by
 * that site (`on`), never heard by observing every attribute: one that turns
 * on every pointer move (a highlighted row) would measure the page on each.
 */
export const SIZING = ["class", "hidden", "open", "data-state"] as const;

/** The mutations that can move a size or a place inside a box, its site's own state attributes (`on`) with them. */
export const sizingChanges = (
  on: readonly string[] = []
): MutationObserverInit => ({
  childList: true,
  characterData: true,
  subtree: true,
  attributes: true,
  attributeFilter: [...SIZING, ...on],
});
