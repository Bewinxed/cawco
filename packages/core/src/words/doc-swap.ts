/** What the hub says when a device holds a copy of an artifact's doc it has since replaced (core doc-swap.ts). */
export const docSwapWords = {
  /**
   * Writes made on the replaced copy, carried by a Send (hub artifacts
   * docs.ts `problem`), and the close a page from before the replacement
   * was known hears (hub artifacts sync.ts `replaced`): reloading takes the
   * new doc.
   */
  copyReplaced: "This page is out of date. Reload.",
};
