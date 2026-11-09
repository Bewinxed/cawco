/**
 * What a person calls the spot a comment stands on, read off the element as
 * the page draws it: its own label and what it is ("Search comments field",
 * "Usage limits card", "Close button"), the way someone pointing at it
 * would say it. Never a component's name, which is the code's word for it,
 * nor the element's text run together ("Open Resolved No open comments"),
 * which is everything inside it at once (the owner, of names like those:
 * "slugs are for slugs, not humans"). It becomes the pin's title (core
 * pin-name.ts reads `anchor.name` first).
 *
 * The label is the accessible name's first sources, as a screen reader
 * would say it (WAI-ARIA accname: `aria-labelledby`, `aria-label`, a
 * field's `<label>`, `alt`, `title`, `placeholder`), else, for what is
 * named by its words (a button, a link, a heading, a tab, a row, a short
 * paragraph), its own words; a container with none is named by its first
 * heading. What it is comes from its role, else its tag.
 */

/** The longest name, in characters, before it is cut at a word with an ellipsis. Our call: about what a row's headline holds on one line. */
const MOST = 48;

/** What an element is, by its role or tag, in a person's word. */
const KIND: Record<string, string> = {
  a: "link",
  link: "link",
  article: "card",
  aside: "panel",
  button: "button",
  checkbox: "checkbox",
  dialog: "card",
  figure: "picture",
  form: "form",
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  h5: "heading",
  h6: "heading",
  heading: "heading",
  header: "header",
  footer: "footer",
  img: "image",
  picture: "image",
  svg: "image",
  canvas: "drawing",
  input: "field",
  textarea: "field",
  searchbox: "field",
  textbox: "field",
  select: "menu",
  combobox: "menu",
  menu: "menu",
  menuitem: "menu item",
  li: "row",
  listitem: "row",
  row: "row",
  option: "option",
  ul: "list",
  ol: "list",
  list: "list",
  nav: "navigation",
  navigation: "navigation",
  p: "text",
  radio: "choice",
  section: "section",
  region: "section",
  switch: "switch",
  tab: "tab",
  tablist: "tabs",
  table: "table",
  toolbar: "bar",
  video: "video",
};

/** What is named by its own words, as a screen reader names it from its content. */
const NAMED_BY_WORDS = new Set([
  "a",
  "button",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "heading",
  "label",
  "legend",
  "li",
  "link",
  "listitem",
  "menuitem",
  "option",
  "p",
  "summary",
  "tab",
]);

/** A heading inside a container, the words a person names it by. */
const HEADING = "h1, h2, h3, h4, h5, h6, [role='heading'], legend, caption";

const SPACES = /\s+/gu;

/** `words` run together and cut at a word past {@link MOST}, with an ellipsis. */
function short(words: string): string {
  const text = words.replace(SPACES, " ").trim();
  if (text.length <= MOST) {
    return text;
  }
  const cut = text.slice(0, MOST);
  const at = cut.lastIndexOf(" ");
  return `${(at > MOST / 2 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

/** The element's own words, read as the page shows them. */
const wordsOf = (el: Element): string =>
  (el instanceof HTMLElement ? el.innerText : el.textContent) ?? "";

/** Its label: the accessible name's own sources, or "" when it has none. */
function labelOf(el: Element): string {
  const doc = el.ownerDocument;
  const by = el.getAttribute("aria-labelledby");
  if (by) {
    const named = by
      .split(SPACES)
      .map((id) => doc.getElementById(id))
      .filter((one): one is HTMLElement => one !== null)
      .map(wordsOf)
      .join(" ");
    if (named.trim()) {
      return named;
    }
  }
  const own = el.getAttribute("aria-label");
  if (own?.trim()) {
    return own;
  }
  if (el.id) {
    const label = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (label && wordsOf(label).trim()) {
      return wordsOf(label);
    }
  }
  const wrapping = el.closest("label");
  if (wrapping && wrapping !== el && wordsOf(wrapping).trim()) {
    return wordsOf(wrapping);
  }
  for (const attribute of ["alt", "title", "placeholder"]) {
    const value = el.getAttribute(attribute);
    if (value?.trim()) {
      return value;
    }
  }
  return "";
}

/** What a person calls `el` on the page, or "" when it says nothing a person would name it by. */
export function spotName(el: Element): string {
  const tag = el.localName;
  const role = el.getAttribute("role") ?? "";
  const kind = KIND[role] ?? KIND[tag] ?? "";
  let label = labelOf(el);
  if (!label && (NAMED_BY_WORDS.has(role) || NAMED_BY_WORDS.has(tag))) {
    label = wordsOf(el);
  }
  if (!label) {
    const heading = el.querySelector(HEADING);
    if (heading) {
      label = labelOf(heading) || wordsOf(heading);
    }
  }
  label = short(label);
  if (!label) {
    return kind ? kind[0].toUpperCase() + kind.slice(1) : "";
  }
  // A heading, a row or a run of text is its words; anything else is its
  // words and what it is ("Search comments field"), unless its words say so.
  if (
    !kind ||
    kind === "heading" ||
    kind === "text" ||
    kind === "row" ||
    label.toLowerCase().endsWith(kind)
  ) {
    return label;
  }
  // A container named by its heading reads as one ("Usage limits card").
  const container = kind === "section" || kind === "panel" ? "card" : kind;
  return `${label} ${container}`;
}
