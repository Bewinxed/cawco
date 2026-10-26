import {
  type PageAnchor,
  type Pin,
  type PinnedElement,
  wholePage,
} from "./comments";

/** A pin on the page as a whole (core `wholePage`), by name. Our call. */
const PAGE_WORDS = "Whole page";

/** Words for a tag no text, id or class names: what the element is. Our call. */
const TAG_WORDS: Record<string, string> = {
  a: "Link",
  article: "Article",
  aside: "Aside",
  button: "Button",
  canvas: "Drawing",
  figure: "Figure",
  footer: "Footer",
  form: "Form",
  h1: "Heading",
  h2: "Heading",
  h3: "Heading",
  h4: "Heading",
  h5: "Heading",
  h6: "Heading",
  header: "Header",
  img: "Image",
  input: "Field",
  li: "List item",
  nav: "Navigation",
  ol: "List",
  p: "Paragraph",
  picture: "Image",
  section: "Section",
  select: "Menu",
  svg: "Drawing",
  table: "Table",
  textarea: "Field",
  ul: "List",
  video: "Video",
};

const CASE_BREAK = /([a-z0-9])([A-Z])/gu;
const SEPARATORS = /[-_.]+/gu;
const SPACES = /\s+/gu;
/** A component's file: its name, when it is a component's. */
const COMPONENT_FILE = /^(.+)\.(svelte|vue|[jt]sx)$/u;

/** `SubagentCard`, `subagent-card`, `subagent_card` → "Subagent card". */
function words(name: string): string {
  const spaced = name
    .replace(CASE_BREAK, "$1 $2")
    .replace(SEPARATORS, " ")
    .trim()
    .toLowerCase();
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : "";
}

/**
 * The component the element is written in: the page's dev build's name for
 * it, else a sheet's innermost component, else its file's.
 */
function componentOf(anchor: PageAnchor): string | null {
  const { source } = anchor;
  const named = source?.component || anchor.chain?.[0]?.component;
  if (named) {
    return words(named);
  }
  const file = source?.file?.split("/").pop();
  const base = file?.match(COMPONENT_FILE)?.[1];
  return base && base !== "+page" && base !== "index" ? words(base) : null;
}

/** The element itself, when it says nothing: its id, its first class, else what it is. */
function elementWords(element: PinnedElement | undefined): string {
  return element ? elementName(element) : "Element";
}

/** Elements whose insides are no text a person sees on the page: what the overlay reads as no words and a page's diff as no change. */
export const UNSHOWN_ELEMENTS = [
  "script",
  "style",
  "template",
  "noscript",
] as const;

/** Form controls: their text is their own though no text node says it, and each is drawn and named whole. */
export const FORM_CONTROLS = ["input", "textarea", "select", "button"] as const;

/** Elements a person names by what they are, whatever their id says: a button is "Button", never "Cta". */
const KIND_FIRST: ReadonlySet<string> = new Set([
  "a",
  "img",
  "picture",
  "video",
  ...FORM_CONTROLS,
]);

/**
 * An element by what it is, not what it says ("Headline", "Button"): a
 * control or a picture by its kind; anything else by its id, else its first
 * class, else its kind. What a change line names it by (core comments.ts
 * `ChangedItem.element`).
 */
export function elementName(element: {
  classes: readonly string[];
  id?: string | null;
  tag: string;
}): string {
  const kind = TAG_WORDS[element.tag];
  if (kind && KIND_FIRST.has(element.tag)) {
    return kind;
  }
  const named = element.id || element.classes[0];
  return (named && words(named)) || kind || "Element";
}

/**
 * What a pin stands on, in words, as its row and its card name it: the
 * component it is written in and the element's own text ("Subagent card ·
 * Coconut cover take 3"); either alone; else the element by its id, class or
 * kind. A pin on the page as a whole is the page. The selector is never the
 * name: it is the head's tooltip.
 */
export function pinName(pin: Pin): string {
  if (pin.title) {
    return pin.title;
  }
  const { anchor } = pin;
  if (!("selector" in anchor)) {
    return `Element ${anchor.element}`;
  }
  if (wholePage(anchor)) {
    return PAGE_WORDS;
  }
  const text = anchor.text?.replace(SPACES, " ").trim();
  const component = componentOf(anchor);
  if (component && text) {
    return `${component} · ${text}`;
  }
  if (text || component) {
    return text || component || "";
  }
  const [first] = pin.elements;
  return elementWords(typeof first === "string" ? undefined : first);
}
