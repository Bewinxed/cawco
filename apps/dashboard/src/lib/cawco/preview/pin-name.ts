import type { PageAnchor, Pin, PinnedElement } from "@cawco/core/comments";

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

const CASE_BREAK = /([a-z0-9])([A-Z])/g;
const SEPARATORS = /[-_.]+/g;
const SPACES = /\s+/g;
/** A component's file: its name, when it is a component's. */
const COMPONENT_FILE = /^(.+)\.(svelte|vue|[jt]sx)$/;

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
  if (!element) {
    return "Element";
  }
  const named = element.id || element.classes[0];
  return (named && words(named)) || TAG_WORDS[element.tag] || "Element";
}

/**
 * What a pin stands on, in words, as its row and its card name it: the
 * component it is written in and the element's own text ("Subagent card ·
 * Coconut cover take 3"); either alone; else the element by its id, class or
 * kind. The selector is never the name: it is the head's tooltip.
 */
export function pinName(pin: Pin): string {
  const { anchor } = pin;
  if (!("selector" in anchor)) {
    return `Element ${anchor.element}`;
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

/** The pin's selector, for the head's tooltip; a canvas pin has none. */
export function pinSelector(pin: Pin): string | null {
  return "selector" in pin.anchor ? pin.anchor.selector : null;
}
