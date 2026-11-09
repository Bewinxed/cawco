/** Where a pin stands on a page, and how a revision of the page finds it again. */

import type { FileSpot } from "../file-spot";
import type { PreviewElement } from "../preview/protocol";
import type { Interaction } from "../stage";

/**
 * What a page's mark stands on: the element, by where it is written, its
 * selector and its text. An element inside a same-origin frame names the
 * frames it stands in, outermost first, each by its selector in the document
 * that holds it; its selector, source and text are read in the innermost
 * frame's document.
 */
export interface PageAnchor {
  /** The element's box in the page when it was anchored, px: what the moved tray shows. */
  box?: { h: number; w: number; x: number; y: number };
  /**
   * On a sheet: the components the element stands in, innermost first, each
   * where it is used (Svelte's `__svelte_meta.parent` component entries, or
   * a stamped component root's call site), then the story that mounts them.
   */
  chain?: ChainLink[];
  /**
   * The artifact whose frame holds it, when that frame shows one (a decision
   * page's Preview, dashboard decisions host Preview.svelte
   * `data-cawco-artifact`): a component canvas, a dev server's preview, a page.
   */
  embed?: { artifact: string };
  /**
   * Where it stands in a file that is no HTML page, shown by CawCo's file
   * viewer (file-spot.ts): a point on the image or on a PDF's page, a text's
   * line or lines, or the file as a whole. The element is the viewer's spot
   * for it; this is what finds it again and what the agent is told.
   */
  file?: FileSpot;
  /**
   * The frames it stands in, outermost first, each by its selector in its
   * parent's document; none at the top. A frame of another origin is read
   * through its own overlay (@cawco/preview overlay embeds.ts), and the
   * selector, source, text, chain and sheet are read in the innermost frame's
   * document either way.
   */
  frames?: string[];
  /**
   * What a person calls the spot, read off the element as the page drew it
   * (@cawco/preview overlay spot-name.ts: its label and what it is, "Search
   * comments field"): the pin's name (core pin-name.ts), never a
   * component's name or its text run together.
   */
  name?: string;
  /**
   * Named by its place alone: the hash of the document it stands in, as it was
   * served when the anchor was read. While the document is that one, the words at its place have changed
   * only by the page's own running, so the element there is the mark's
   * ({@link findAnchor}); a revision may have put another there.
   */
  page?: string;
  selector: string;
  /**
   * On a component canvas: its states file (from the toolchain root), the
   * story whose frame holds the element, and the frame's state: the
   * interaction it is forced into, its scheme and its width (px; null when it
   * fits its content).
   */
  sheet?: {
    file: string;
    state?: {
      interaction: Interaction;
      // Indexed off the array, not a named type: the apps' schema names this field's enum.
      scheme: (typeof STORY_SCHEMES)[number];
      width: number | null;
    };
    story: string;
  };
  source: PreviewElement["source"];
  /** The element's text, at most {@link COMMENT_LIMITS.anchorText} characters. */
  text?: string;
}

/**
 * One link of a sheet's chain: a component, by its name, at the place it is
 * used (1-based line and column); the last link is the story, by its
 * export's name, at the export in the story file.
 */
export interface ChainLink {
  column: number;
  component: string;
  file: string;
  line: number;
}

/** A canvas's mark stands on one of its elements, by id. */
interface CanvasAnchor {
  element: string;
}

export type Anchor = PageAnchor | CanvasAnchor;

/** An element under a pin, as the overlay describes it, without its markup. */
export type PinnedElement = Omit<PreviewElement, "html">;

/**
 * The colour scheme a page or a component's stories are shown in: the
 * page's own, light, dark, or both side by side.
 */
export const PREVIEW_SCHEMES = ["page", "light", "dark", "both"] as const;
type PreviewScheme = (typeof PREVIEW_SCHEMES)[number];

/** The schemes one story is drawn in: one at a time, never both. */
const STORY_SCHEMES = [
  "page",
  "light",
  "dark",
] as const satisfies readonly PreviewScheme[];

/**
 * How a page looks an anchor up, in a document `D`: the same-origin frame
 * `selector` names in `within` (its document, or null when it is not there,
 * not loaded, or of another origin), then, in the document the anchor's frames
 * lead to, every element whose dev source is `file` at `line` (in document
 * order; none when nothing matches), the element `selector` names, and the
 * deepest element whose text is `text`, null when nothing matches; and an
 * element's text as an anchor keeps it.
 */
export interface AnchorLookup<E, D> {
  bySelector: (within: D, selector: string) => E | null;
  bySource: (within: D, file: string, line: number) => E[];
  byText: (within: D, text: string) => E | null;
  /** Whether an element is content, never the page's own box however much of it it covers: it draws words of its own. */
  content: (el: E) => boolean;
  frame: (within: D, selector: string) => D | null;
  /** The document's page as a whole: its body; null when it has none. */
  page: (within: D) => E | null;
  /** Whether a box in the page (an anchor's, as it was kept) is nearly as wide and as tall as the document's page now: the page's own box. */
  pageSized: (within: D, box: NonNullable<PageAnchor["box"]>) => boolean;
  /** Whether the page is the one the anchor was read on: not revised since ({@link PageAnchor.page}). */
  samePage: (anchor: PageAnchor, within: D) => boolean;
  textOf: (el: E) => string;
  /** The top document, where an anchor's frames start. */
  top: D;
}

/** Where an anchor stands now, and by which part of it ({@link findAnchor}). */
export interface AnchorFound<E> {
  /**
   * `place`: the element it last found, still named by its selector, whose
   * words changed in place, which its text test cannot tell from another
   * element standing there.
   */
  by: "source" | "selector" | "text" | "page" | "place";
  el: E;
}

/**
 * The attributes that name an element by what it is, not where it stands,
 * after its `id`: a test id, and a decision card's choice and option. An
 * anchor's selector starts at the nearest of the element and its ancestors
 * one of them names alone ({@link stableSelector}).
 */
export const ANCHOR_IDENTITIES = [
  "data-testid",
  "data-cawco-choice",
  "data-option",
  "data-cawco-artifact",
] as const;

/**
 * The selectors of a document's own root and body: a mark on one stands on
 * the page as a whole (a press in its padding with no content near), which
 * is there whatever the page says from one state to the next.
 */
const PAGE_ROOTS = new Set(["html", "body"]);

/** Whether a mark stands on the page as a whole ({@link PAGE_ROOTS}), not on an element of it. */
export const wholePage = (anchor: PageAnchor): boolean =>
  PAGE_ROOTS.has(anchor.selector);

/**
 * An id a framework mints per render, which names whatever element the next
 * render hands it to: React's `useId` (`:r3:`, `:R1d6:` on the server) and
 * Radix's (`radix-…`). Never an element's identity.
 */
const MINTED_ID = /^:r[0-9a-z]+:$|^radix-/iu;
/** A selector starting at such an id, as `CSS.escape` writes it (`#\:r3\:`, `#radix-…`). */
const MINTED_ID_SELECTOR = /^#(?:\\:r[0-9a-z]+\\:|radix-)/iu;

/** Whether an element's id is one a framework minted ({@link MINTED_ID}): it anchors by its next rule. */
export const generatedId = (id: string): boolean => MINTED_ID.test(id);

/**
 * Whether a selector names its element by identity: it starts at an id or
 * one of {@link ANCHOR_IDENTITIES}, or it is the page's root or body, so it
 * finds the same element however the page moved round it. A path of places
 * from the page's root (`body > section:nth-of-type(2) > h2:nth-of-type(1)`)
 * names whatever stands there now.
 */
export const stableSelector = (selector: string): boolean =>
  PAGE_ROOTS.has(selector) ||
  (selector.startsWith("#") && !MINTED_ID_SELECTOR.test(selector)) ||
  ANCHOR_IDENTITIES.some((name) => selector.startsWith(`[${name}=`));

/**
 * The page as a whole, where an anchor's kept box was the page's own: a
 * press in its padding kept on the page-sized container that held it. Never
 * for a selector that is the element's identity (`stable`), nor for content
 * the selector still names reading its text: a page of one card has a body
 * the card's height.
 */
function pageOf<E, D>(
  anchor: PageAnchor,
  doc: D,
  lookup: AnchorLookup<E, D>,
  named: { el: E | null; holds: (el: E) => boolean; stable: boolean }
): E | null {
  const { el, holds, stable } = named;
  if (stable || (el !== null && holds(el) && lookup.content(el))) {
    return null;
  }
  return anchor.box && lookup.pageSized(doc, anchor.box)
    ? lookup.page(doc)
    : null;
}

/**
 * Where a mark stands in the page now, and by which part of its anchor: down
 * its frames, then its source's file:line, then its selector, then its text.
 * A selector of places alone finds its element only while that element
 * still reads the anchor's text, or that text and more: one put in ahead
 * of it stands at its place now, and is never the mark's. A selector of
 * places whose kept box was the page's own (a press in its padding, kept on
 * the page-sized container that held it, before such a press named the
 * body) stands on the page as a whole, as {@link wholePage} does, whatever
 * its container says now; content that draws words of its own and still
 * reads the anchor's is never such a container. On a page not revised since
 * ({@link AnchorLookup.samePage}), the element at its place reading other
 * words, when no element reads the anchor's: a page's own script changed them
 * while nothing was open. Null when none of them finds it: the mark goes to
 * the moved tray.
 */
export function findAnchor<E, D>(
  anchor: PageAnchor,
  lookup: AnchorLookup<E, D>
): AnchorFound<E> | null {
  let within: D | null = lookup.top;
  for (const frame of anchor.frames ?? []) {
    within = lookup.frame(within, frame);
    if (within === null) {
      return null;
    }
  }
  const { source } = anchor;
  const doc: D = within;
  const stable = stableSelector(anchor.selector);
  const named = lookup.bySelector(doc, anchor.selector);
  const text = anchor.text?.trim() ?? "";
  /**
   * Whether the element the selector names is the mark's: always by
   * identity; by places only while it reads the anchor's text, or that text
   * and more (a card whose words stream on).
   */
  const holds = (el: E) => {
    const now = lookup.textOf(el);
    return stable || now === text || (text !== "" && now.startsWith(text));
  };
  if (source?.file && source.line !== null && source.of === "self") {
    const written = lookup.bySource(doc, source.file, source.line);
    if (written.length === 1) {
      return { by: "source", el: written[0] };
    }
    const among =
      written.length > 1
        ? amongWritten(written, { el: named, holds }, text, lookup)
        : null;
    if (among) {
      return among;
    }
  }
  const page = pageOf(anchor, doc, lookup, { el: named, holds, stable });
  if (page) {
    return { by: "page", el: page };
  }
  if (named && holds(named)) {
    return { by: "selector", el: named };
  }
  const found = text ? lookup.byText(doc, text) : null;
  if (found) {
    return { by: "text", el: found };
  }
  // Its words nowhere and the page as it was: they changed where it stands.
  return named && lookup.samePage(anchor, doc)
    ? { by: "place", el: named }
    : null;
}

/**
 * The mark's element among several one line of markup writes (a component
 * in a list: each card of a transcript), never merely the first: the one its
 * selector names that still reads its text; else the one instance that
 * reads its text, wherever the list moved it; else, when no one instance
 * does, the one its selector names while that one holds the mark (by
 * identity, or a card whose text streams on: `named.holds`). Null when no
 * one of them reads its text and its selector names none that holds it.
 */
function amongWritten<E, D>(
  written: E[],
  named: { el: E | null; holds: (el: E) => boolean },
  text: string,
  lookup: AnchorLookup<E, D>
): AnchorFound<E> | null {
  const reads = (one: E) => !!text && lookup.textOf(one) === text;
  const el = named.el && written.includes(named.el) ? named.el : null;
  if (el && reads(el)) {
    return { by: "selector", el };
  }
  const reading = written.filter(reads);
  if (reading.length === 1) {
    return { by: "text", el: reading[0] };
  }
  return el && named.holds(el) ? { by: "selector", el } : null;
}

/**
 * Whether the element an anchor finds now reads otherwise than the anchor
 * says (another selector, source or text): the anchor is written again. Its
 * box moving is no change, so placing a mark never writes it by itself. Nor
 * are its words changing while the anchor's own selector still finds it
 * (`by`): a live element's words (a zoom percent, a clock, a count) change
 * where it stands, and two readings of them (two views of the page at their
 * own widths, two stand-ins of one embedded element) wrote the anchor back
 * and forth on every draw.
 */
export const changedAnchor = (
  was: PageAnchor,
  now: PageAnchor,
  by: AnchorFound<unknown>["by"]
): boolean =>
  was.selector !== now.selector ||
  (was.frames ?? []).join("\u0000") !== (now.frames ?? []).join("\u0000") ||
  was.embed?.artifact !== now.embed?.artifact ||
  (by !== "selector" &&
    by !== "place" &&
    (was.text ?? "") !== (now.text ?? "")) ||
  (now.page !== undefined && was.page !== now.page) ||
  JSON.stringify(was.source) !== JSON.stringify(now.source) ||
  JSON.stringify(was.chain ?? []) !== JSON.stringify(now.chain ?? []) ||
  JSON.stringify(was.file ?? null) !== JSON.stringify(now.file ?? null) ||
  JSON.stringify(was.sheet ?? null) !== JSON.stringify(now.sheet ?? null);

/**
 * Whether a mark's anchor takes its element's words as they read now, its
 * selector naming that element only by place (`place`): else a reload finds
 * no element reading them, and the mark is said gone (tsk-22). Only when the
 * element's words changed under this view: two views reading their own words
 * at their own widths write nothing back and forth (`changedAnchor`). One
 * reader per overlay's marks, by mark.
 */
export function wordsFollow() {
  const read = new Map<string, string>();
  return (
    id: string,
    was: PageAnchor,
    now: PageAnchor,
    by: AnchorFound<unknown>["by"]
  ): boolean => {
    const words = now.text ?? "";
    const before = read.get(id);
    read.set(id, words);
    return (
      by === "place" &&
      before !== undefined &&
      before !== words &&
      (was.text ?? "") !== words
    );
  };
}
