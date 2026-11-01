/**
 * An element on the stage in words a person would say ("Form failure",
 * "Button “Create routine”"), for a clip's row and a difference's line:
 * its `data-slot` (the house's name for a part), else its accessible name
 * with its kind, else its kind with its first words. Tailwind's classes
 * name nothing, so no class is read.
 */
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
const CONTROLS: ReadonlySet<string> = new Set([
  "a",
  "button",
  "input",
  "select",
  "textarea",
]);

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
  // The words drawn (a pending label waiting hidden says nothing), else every word it holds.
  const text =
    (el instanceof HTMLElement && el.innerText.replace(SPACES, " ").trim()) ||
    wordsOf(el);
  if (text) {
    return `${kind ?? words.element} ${quoted(text)}`;
  }
  const holder = el.parentElement?.closest("[data-slot]");
  return holder ? nameOf(holder) : (kind ?? words.element);
}
