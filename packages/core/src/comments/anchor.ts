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
   * `data-cawco-artifact`): a design graph, a dev server's preview, a page.
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
   * On a design graph: its states file (from the toolchain root), the
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
export const wholePage = (anchor: Pick<PageAnchor, "selector">): boolean =>
  PAGE_ROOTS.has(anchor.selector);

/**
 * The marks of an id a library or framework mints as the page runs: React's
 * `useId` (`:r3:` and `:ra:`, `«r3»`, `_r_3_`) and every id built on one
 * (Radix's `radix-:r1:`, Headless UI's `headlessui-menu-button-:r1:`, Ark's
 * `menu::r1::trigger`), and the libraries that prefix a counter or a random
 * run of their own (bits-ui's `bits-c695`, Melt's `melt-…`).
 */
const MINTED_MARKS =
  /[:«»]|^_r_|_r_[0-9a-z]+_|^(?:bits|melt|radix|headlessui|react-aria|reach|mui|downshift)-/iu;
/** A digit anywhere in an id: a counter's or a random run's. */
const DIGIT = /\d/u;

/**
 * Whether an element's id is one the page minted as it ran, never one its
 * author wrote: it carries a framework's mark ({@link MINTED_MARKS}) or a
 * digit, which every counter and random run does (Svelte's `$props.id()`,
 * `c12` in the browser and `s12` on the server, Vue's `v-0`, and each id an
 * author builds on one, `c12-label`). Such an id counts per page, so two
 * views of one page, or one view after a remount, name one element by two
 * ids, or another element by the same one; an element with one anchors by
 * its next rule. An id of its author's holding a digit (`step-2`) anchors
 * the same way: by its place and its words, which find it as well.
 */
export const generatedId = (id: string): boolean =>
  MINTED_MARKS.test(id) || DIGIT.test(id);

/** A selector's leading `#id`, its escapes as written. */
const LEADING_ID = /^#((?:\\[0-9a-f]{1,6}\s?|\\.|[^\s>+~.#:[\\])+)/iu;
/** One escape in a CSS identifier: a code point in hex (and the space that may end it), or a character as itself. */
const CSS_ESCAPE = /\\(?:([0-9a-f]{1,6})\s?|(.))/giu;

/** The id a selector starts at, as `CSS.escape` writes it (`#bits-c695 > span`, `#\\31 23`), read back; null when it starts elsewhere. */
const leadingId = (selector: string): string | null => {
  const id = selector.match(LEADING_ID)?.[1];
  return id === undefined
    ? null
    : id.replace(CSS_ESCAPE, (_all, hex, char) =>
        hex ? String.fromCodePoint(Number.parseInt(hex, 16)) : char
      );
};

/**
 * Whether a selector names its element by identity: it starts at an id its
 * author wrote ({@link generatedId}) or one of {@link ANCHOR_IDENTITIES}, or
 * it is the page's root or body, so it finds the same element however the
 * page moved round it. A path of places from the page's root
 * (`body > section:nth-of-type(2) > h2:nth-of-type(1)`) names whatever
 * stands there now, and so does an id the page minted.
 */
export const stableSelector = (selector: string): boolean => {
  if (PAGE_ROOTS.has(selector)) {
    return true;
  }
  const id = leadingId(selector);
  return id === null
    ? ANCHOR_IDENTITIES.some((name) => selector.startsWith(`[${name}=`))
    : !generatedId(id);
};

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
 * Whether the element an anchor finds now stands otherwise in the page than
 * the anchor says: another selector, frames, embed, source, component
 * chain, states file or story, or a revision of the page (`page`). Each of
 * these reads the same in every view of one revision of the page, at any
 * width, in either scheme, in a tab, on a phone or in a map's card, so two
 * views never write an anchor back and forth (the pins' first loop was
 * their live words, the next an id bits-ui minted per page). What a view
 * reads of its own is never compared: the element's box, its spot's name,
 * the frame's state (its interaction, scheme and width) and its words. Its
 * words follow only where this view saw them change ({@link wordsFollow});
 * the state and a file's spot are the ones the mark was made in
 * ({@link madeAs}).
 */
const changedAnchor = (was: PageAnchor, now: PageAnchor): boolean =>
  was.selector !== now.selector ||
  (was.frames ?? []).join("\u0000") !== (now.frames ?? []).join("\u0000") ||
  was.embed?.artifact !== now.embed?.artifact ||
  (now.page !== undefined && was.page !== now.page) ||
  JSON.stringify(was.source) !== JSON.stringify(now.source) ||
  JSON.stringify(was.chain ?? []) !== JSON.stringify(now.chain ?? []) ||
  was.sheet?.file !== now.sheet?.file ||
  was.sheet?.story !== now.sheet?.story;

/**
 * An anchor read off its element now, with what was read as the mark was
 * made kept as it was: where in a file it stands (`file`), and the frame's
 * state on a sheet, which says the view the person commented in (its
 * width, its scheme), never the view reading it now.
 */
export const madeAs = (was: PageAnchor, now: PageAnchor): PageAnchor => {
  const state = was.sheet?.state ?? now.sheet?.state;
  return {
    ...now,
    ...(was.file ? { file: was.file } : {}),
    ...(now.sheet
      ? {
          sheet: {
            file: now.sheet.file,
            story: now.sheet.story,
            ...(state ? { state } : {}),
          },
        }
      : {}),
  };
};

/**
 * Whether a mark's anchor takes its element's words as they read now, the
 * element found where its words are no part of finding it (by its `source`,
 * or by its `place` alone): else a later revision, or a reload, finds no
 * element reading them, and the mark is said gone (tsk-22). Only when the
 * element's words changed under this view: two views read their own words
 * (a live count, a zoom percent, copy a narrow layout swaps), and words
 * one view never saw change write nothing. One reader per overlay's marks,
 * by mark.
 */
function wordsFollow() {
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
      (by === "place" || by === "source") &&
      before !== undefined &&
      before !== words &&
      (was.text ?? "") !== words
    );
  };
}

/**
 * How one view writes its marks' anchors again: each found element's
 * anchor as it reads now ({@link madeAs}), returned when the page changed
 * under the mark ({@link changedAnchor}, {@link wordsFollow}), else null,
 * and nothing is written. One per overlay's marks.
 */
export function anchorRereader() {
  const words = wordsFollow();
  return (
    id: string,
    was: PageAnchor,
    read: PageAnchor,
    by: AnchorFound<unknown>["by"]
  ): PageAnchor | null => {
    const now = madeAs(was, read);
    // Both asked, so the words' reader hears every reading.
    const moved = changedAnchor(was, now);
    const reworded = words(id, was, now, by);
    return moved || reworded ? now : null;
  };
}
