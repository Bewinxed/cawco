/** Every match, as a real array. */
export const all = <T extends Element = HTMLElement>(root: ParentNode, selector: string): T[] =>
  Array.from(root.querySelectorAll<T>(selector));

/** The one match the markup promises. Its absence is a bug in the page, so it throws. */
export const one = <T extends Element = HTMLElement>(root: ParentNode, selector: string): T => {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`The page has no "${selector}".`);
  return found;
};
