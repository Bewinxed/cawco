/**
 * An element of the stage's drawing (stage.ts) in words a person would
 * say ("Form failure", "Button “Create routine”"), for a clip's row and a
 * difference's line, read on the page where the element stands:
 * its `data-slot` (the house's name for a part), else its accessible name
 * with its kind, else its kind with its first words, else the part it
 * stands in, never one of the stage's own round the drawing
 * (`data-stage-drawing`). Tailwind's classes name nothing, so no class is
 * read.
 */
import { FORM_CONTROLS } from "@cawco/core/pin-name";
import { storyWords } from "@cawco/core/stage-graph";
import { graphWords as words } from "@cawco/core/words/graph";

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
  p: "Text",
  select: "Menu",
  svg: "Icon",
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

/**
 * The house part an element stands in: its closest `data-slot` a reader
 * is told of, never one of the stage's own round the drawing. A morph
 * text's letters are an `aria-hidden` slot drawn only while it morphs:
 * the part is the morph text that holds them.
 */
const partOf = (el: Element): Element | null => {
  let part = el.closest("[data-slot], [data-stage-drawing]");
  while (part?.closest("[aria-hidden='true']")) {
    part =
      part.parentElement?.closest("[data-slot], [data-stage-drawing]") ?? null;
  }
  return part && !part.hasAttribute("data-stage-drawing") ? part : null;
};

/** Kit parts that only draw words: named by the words they say, as a person reads them, never by the part. */
const WORDS_ONLY: ReadonlySet<string> = new Set(["morph-text"]);

/**
 * What a person names for an element that moves: the control it is part
 * of, else the house part it stands in, else the element itself. A morph
 * text's words each move on their own span: keyed by the span, one move
 * drew 35 rows ("“0” moves", "“:” moves"), none a part a person can name.
 */
export const thingOf = (el: Element): Element =>
  el.closest("button, a[href], [role='button']") ?? partOf(el) ?? el;

/** A part's name in words, a word said twice once ("field-field" is a field). */
const slotWords = (slot: string): string =>
  storyWords(
    slot
      .split(SEPARATORS)
      .filter((word, at, all) => word !== all[at - 1])
      .join(" ")
  );

/** The words of the label a part holds, or its legend: what a field is named by. */
const labelIn = (el: Element): string | null => {
  const label = el.querySelector("label, legend");
  const said = label ? wordsOf(label) : "";
  return said || null;
};

/** The label of the house part a control stands in, when its own names none: a field's label over its menu. */
function partLabelOf(el: Element): string | null {
  for (
    let part = el.parentElement?.closest("[data-slot]");
    part && !part.hasAttribute("data-stage-drawing");
    part = part.parentElement?.closest("[data-slot]")
  ) {
    const label = labelIn(part);
    if (label) {
      return label;
    }
  }
  return null;
}

/** A field's label, else its part's, else its placeholder; a menu's label or its part's, never its options' words. */
function fieldLabelOf(el: Element): string | null {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return (
      el.labels?.[0]?.textContent?.trim() || partLabelOf(el) || el.placeholder
    );
  }
  if (el instanceof HTMLSelectElement) {
    return el.labels?.[0]?.textContent?.trim() || partLabelOf(el);
  }
  return null;
}

/** A house part in words: by the label it holds, else by the one control a kit wrapper holds, else by its part's name. */
function slotNameOf(el: Element, slot: string): string {
  const label = labelIn(el);
  if (label) {
    return `${slotWords(slot)} ${quoted(label)}`;
  }
  // A kit wrapper round one control (a native select's) is that control:
  // "Native select wrapper" named the box, not the menu.
  const controls = el.querySelectorAll("input, select, textarea");
  const [only] = controls;
  return controls.length === 1 && only ? nameOf(only) : slotWords(slot);
}

/** The element in words. */
export function nameOf(el: Element): string {
  // A part of a control (a button's label, its slot) is the control.
  const control = el.parentElement?.closest("button, a[href], [role='button']");
  if (control) {
    return nameOf(control);
  }
  const own = CONTROLS.has(el.localName) ? null : el.getAttribute("data-slot");
  const slot = own && !WORDS_ONLY.has(own) ? own : null;
  if (slot) {
    return slotNameOf(el, slot);
  }
  const kind = KIND[el.localName] ?? null;
  const label = el.getAttribute("aria-label") ?? fieldLabelOf(el);
  if (label) {
    const said = quoted(label.replace(SPACES, " ").trim());
    return kind ? `${kind} ${said}` : said;
  }
  // The words it says (a pending label waiting, hidden from a reader, says nothing), else every word it holds.
  const text = saidOf(el) || wordsOf(el);
  if (text) {
    return kind ? `${kind} ${quoted(text)}` : quoted(text);
  }
  // The part it stands in, inside the drawing: the stage's own parts
  // round the drawing (its frame, its page) are no part of the component.
  const holder = el.parentElement?.closest("[data-slot], [data-stage-drawing]");
  return holder && !holder.hasAttribute("data-stage-drawing")
    ? nameOf(holder)
    : (kind ?? words.element);
}
