import { type PinnedElement, wholePage } from "./comments/anchor";
import type { Pin } from "./comments/model";
import { fileSpotName, readFileSpot } from "./file-spot";

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

/** `SubagentCard`, `subagent-card`, `subagent_card` → "Subagent card". */
function words(name: string): string {
  const spaced = name
    .replace(CASE_BREAK, "$1 $2")
    .replace(SEPARATORS, " ")
    .trim()
    .toLowerCase();
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : "";
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

/** The most of an element's text a name keeps, in characters, cut at a word: about one headline line. Our call. */
const TEXT_MOST = 48;

/** `text` cut at a word past {@link TEXT_MOST}, with an ellipsis. */
function shortText(text: string): string {
  if (text.length <= TEXT_MOST) {
    return text;
  }
  const cut = text.slice(0, TEXT_MOST);
  const at = cut.lastIndexOf(" ");
  return `${(at > TEXT_MOST / 2 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

/**
 * What a pin stands on, in words, as its row and its card name it: what a
 * person calls the spot (`anchor.name`, read by the overlay as the pin was
 * made: "Search comments field"); for an anchor from before it kept one,
 * the start of the element's own words, else the element by its id, class
 * or kind. Never a component's name (the code's word for it), never the
 * selector, which is the head's tooltip. A pin on the page as a whole is
 * the page; one in a file CawCo's viewer shows, its place in the file.
 */
export function pinName(pin: Pin): string {
  if (pin.title) {
    return pin.title;
  }
  const { anchor } = pin;
  if (!("selector" in anchor)) {
    return `Element ${anchor.element}`;
  }
  // In a file CawCo's viewer shows: where in it ("Page 3, near the top left", "Lines 12–14").
  const file = readFileSpot(anchor.file);
  if (file) {
    return fileSpotName(file);
  }
  if (wholePage(anchor)) {
    return PAGE_WORDS;
  }
  if (anchor.name) {
    return anchor.name;
  }
  const text = anchor.text?.replace(SPACES, " ").trim();
  if (text) {
    return shortText(text);
  }
  const [first] = pin.elements;
  return elementWords(typeof first === "string" ? undefined : first);
}
