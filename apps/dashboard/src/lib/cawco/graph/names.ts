/**
 * An element on the stage in words a person would say ("Form failure",
 * "Button “Create routine”"), for a clip's row and a difference's line:
 * its `data-slot` (the house's name for a part), else its accessible name
 * with its kind, else its kind with its first words. Tailwind's classes
 * name nothing, so no class is read.
 */
import { FORM_CONTROLS } from "@cawco/core/pin-name";
import { graphWords as words } from "@cawco/core/words/graph";
import { storyWords } from "./model";

const KIND: Record<string, string> = {
  a: "Link",
  button: "Button",
  h1: "Heading",
  h2: "Heading",
  h3: "Heading",
  h4: "Heading",
  img: "Image",
  input: "Field",
  label: "Label",
  li: "Row",
  p: "Line",
  select: "Menu",
  svg: "Glyph",
  textarea: "Field",
  ul: "List",
  ol: "List",
};

/** Controls a person names by what they are and say, whatever their part's name: a button is "Button “Create routine”". */
const CONTROLS: ReadonlySet<string> = new Set(["a", ...FORM_CONTROLS]);

const SPACES = /\s+/gu;
const SEPARATORS = /[-_]+/gu;
/** The most words a name quotes. */
const QUOTED = 28;

/** The element's first words, white space run together. */
export const wordsOf = (el: Element): string =>
  (el.textContent ?? "").replace(SPACES, " ").trim();

const quoted = (text: string): string =>
  text.length > QUOTED
    ? `“${text.slice(0, QUOTED - 1).trimEnd()}…”`
    : `“${text}”`;

/** Its words a reader is told: every text inside it but what an `aria-hidden` part holds. */
function saidOf(el: Element): string {
  const said: string[] = [];
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const hider = node.parentElement?.closest("[aria-hidden='true']");
    if (!(hider && el.contains(hider))) {
      said.push(node.textContent ?? "");
    }
  }
  return said.join(" ").replace(SPACES, " ").trim();
}

/** The element in words. */
export function nameOf(el: Element): string {
  // A part of a control (a button's label, its slot) is the control.
  const control = el.parentElement?.closest("button, a[href], [role='button']");
  if (control) {
    return nameOf(control);
  }
  const slot = CONTROLS.has(el.localName) ? null : el.getAttribute("data-slot");
  if (slot) {
    return storyWords(slot.replace(SEPARATORS, " "));
  }
  const kind = KIND[el.localName] ?? null;
  const label =
    el.getAttribute("aria-label") ??
    (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
      ? (el.labels?.[0]?.textContent?.trim() ?? el.placeholder)
      : null);
  if (label) {
    return `${kind ?? words.element} ${quoted(label.replace(SPACES, " ").trim())}`;
  }
  // The words it says (a pending label waiting, hidden from a reader, says nothing), else every word it holds.
  const text = saidOf(el) || wordsOf(el);
  if (text) {
    return `${kind ?? words.element} ${quoted(text)}`;
  }
  const holder = el.parentElement?.closest("[data-slot]");
  return holder ? nameOf(holder) : (kind ?? words.element);
}
