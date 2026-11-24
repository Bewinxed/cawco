/**
 * Whether this view draws the page as a mark was made (core comments
 * made-view.ts): only then does it write where the mark stands (pins.ts
 * and ink.ts `settled`). The view a mark is made in is kept on its anchor
 * (page.ts `anchorOf`): a sheet's frame state, or off a sheet the window's
 * width and the scheme the page is drawn in. Its page's width thresholds
 * are read off its document's style (each `@media` and `@container` rule,
 * a sheet's own `media`) and off the queries its script asked `matchMedia`
 * (boot.ts `watchMedia`).
 */
import type { PageAnchor } from "@cawco/core/comments/anchor";
import {
  type MadeAway,
  type MadeView,
  madeViewOf,
  showsAsMade,
  widthThresholds,
} from "@cawco/core/comments/made-view";
import { eachRule } from "@cawco/core/scheme-media";
import { storyWords } from "@cawco/core/stage-graph";
import { markOf } from "./boot";

/**
 * Whether `el` is drawn in a box of its own in this view: none under a
 * `display: none`, or in what a `content-visibility: hidden` or a closed
 * `<details>` skips (`checkVisibility`, CSSOM View), and none where it lays
 * out no box (`getClientRects`). A mark stands only on what is drawn: a box
 * of none is the page's origin.
 */
export const drawnHere = (el: Element): boolean =>
  el.getClientRects().length > 0 && el.checkVisibility();

/**
 * The events after which an element may be drawn, or no longer, with no
 * attribute of the page's written (which a mutation observer hears): a
 * `<details>` toggled or a popover shown or hidden (each its `toggle`,
 * heard on capture, as it bubbles from neither), and a menu a focus or a
 * checked box opens by CSS alone. The marks are placed again after each
 * (ink.ts), so a pin hidden with its section stands on it once it shows.
 */
export const SHOWN_BY = ["toggle", "focusin", "focusout", "change"] as const;

/**
 * A drawing's width on a sheet: its own (`data-cawco-width`), else its body
 * as laid out (unscaled by a card's zoom), null when it lays out none.
 */
export const frameWidth = (frame: HTMLElement): number | null => {
  const width = Number(frame.dataset.cawcoWidth);
  return Number.isFinite(width)
    ? width
    : (frame.querySelector<HTMLElement>(".cawco-frame-body") ?? frame)
        .offsetWidth || null;
};

/** A drawing's scheme on a sheet (`data-cawco-scheme`): the page's own unless it names one. */
export const frameScheme = (frame: HTMLElement): MadeView["scheme"] => {
  const scheme = frame.dataset.cawcoScheme;
  return scheme === "light" || scheme === "dark" ? scheme : "page";
};

/**
 * The scheme `doc`'s page is drawn in: the one the overlay drew it in
 * (page.ts `themeRoot`, the root's `data-theme`), else the one it prefers.
 */
const pageScheme = (doc: Document): "light" | "dark" => {
  const drawn = doc.documentElement.dataset.theme;
  if (drawn === "light" || drawn === "dark") {
    return drawn;
  }
  return doc.defaultView?.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

/** Off a sheet: the view `doc` draws its page in now, its window's width as `@media` and `matchMedia` answer it. */
export const pageView = (
  doc: Document
): { scheme: "light" | "dark"; width: number } => ({
  scheme: pageScheme(doc),
  width: doc.defaultView?.innerWidth ?? 0,
});

/** The drawing of `sheet`'s story in `doc`, the first that shows it; null where this view shows another story. */
const drawingOf = (
  doc: Document,
  sheet: NonNullable<PageAnchor["sheet"]>
): HTMLElement | null =>
  [
    ...doc.querySelectorAll<HTMLElement>(
      `[data-cawco-story="${CSS.escape(sheet.story)}"]`
    ),
  ].find((frame) => (frame.dataset.cawcoFile ?? sheet.file) === sheet.file) ??
  null;

/** The width conditions one sheet's rules hold, read once per count of its rules. */
const readSheets = new WeakMap<
  CSSStyleSheet,
  { conditions: string[]; rules: number }
>();
/** A sheet of another origin's, fetched and read by its address: its conditions, or null where it could not be. */
const fetched = new Map<string, string[] | null>();
/** The addresses of the sheets being fetched now. */
const loading = new Set<string>();

/** The conditions of each `@media` and `@container` rule of `sheet` at any depth, and its own and each import's `media`. */
const conditionsIn = (sheet: CSSStyleSheet): string[] => {
  const conditions = [sheet.media.mediaText];
  eachRule(sheet, (rule) => {
    if (rule instanceof CSSMediaRule || rule instanceof CSSContainerRule) {
      conditions.push(rule.conditionText);
    } else if (rule instanceof CSSImportRule) {
      conditions.push(rule.media.mediaText);
    }
  });
  return conditions;
};

/**
 * A sheet of another origin's, which keeps its rules from the page: fetched
 * by its address (a CDN answers any origin) and read as a sheet of its own
 * (`CSSStyleSheet.replaceSync`, never applied). Undefined while it loads,
 * null where it can't be read.
 */
const foreignConditions = (href: string): string[] | null | undefined => {
  if (!(fetched.has(href) || loading.has(href))) {
    loading.add(href);
    readForeign(href).then((read) => {
      fetched.set(href, read);
      loading.delete(href);
    });
  }
  return fetched.get(href);
};

/** The conditions of a sheet of another origin's, fetched by its address; null where it can't be fetched or read. */
const readForeign = async (href: string): Promise<string[] | null> => {
  const [answer] = await Promise.allSettled([
    fetch(href, { credentials: "omit", mode: "cors" }).then((got) =>
      got.ok ? got.text() : null
    ),
  ]);
  if (answer.status === "rejected" || answer.value === null) {
    return null;
  }
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(answer.value);
  return conditionsIn(sheet);
};

/**
 * `doc`'s page's width thresholds (core `widthThresholds`); null while a
 * sheet of its keeps its rules, unread: then only the same width draws the
 * page alike.
 */
const thresholdsOf = (doc: Document): number[] | null => {
  const conditions: string[] = [
    ...(markOf(doc.defaultView ?? window)?.media ?? []),
  ];
  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: number;
    try {
      rules = sheet.cssRules.length;
    } catch {
      const foreign = sheet.href ? foreignConditions(sheet.href) : null;
      if (!foreign) {
        return null;
      }
      conditions.push(...foreign);
      continue;
    }
    let read = readSheets.get(sheet);
    if (read?.rules !== rules) {
      read = { conditions: conditionsIn(sheet), rules };
      readSheets.set(sheet, read);
    }
    conditions.push(...read.conditions);
  }
  return widthThresholds(conditions);
};

/**
 * Why this view can't judge the mark on `anchor` (core `MadeAway`), in
 * `doc`, the document its frames lead to; null where it draws the page as
 * the mark was made (core `showsAsMade`): on a sheet, its story drawn here
 * with the frame's width and scheme; off one, the window's. On a sheet
 * whose drawing of the mark's story isn't here, that story. A document not
 * here (a frame of another origin's, which its own overlay reads, or one
 * still loading, whose marks wait) holds nothing to judge it by, and its
 * marks stand as before.
 */
export const madeAway = (
  anchor: PageAnchor,
  doc: Document | null
): MadeAway | null => {
  if (doc === null) {
    return null;
  }
  const drawing = anchor.sheet ? drawingOf(doc, anchor.sheet) : null;
  if (anchor.sheet && drawing === null) {
    return storyAway(anchor.sheet);
  }
  const made = madeViewOf(anchor);
  if (made === undefined) {
    return null;
  }
  const now: MadeView = drawing
    ? { scheme: frameScheme(drawing), width: frameWidth(drawing) }
    : pageView(doc);
  return showsAsMade(made, now, thresholdsOf(doc))
    ? null
    : { why: "elsewhere", made };
};

/** A mark made on story `sheet.story` of a sheet this view shows another story of: that story, named in plain words until the host names it as its States menu does. */
const storyAway = (
  sheet: NonNullable<PageAnchor["sheet"]>
): Extract<MadeAway, { why: "story" }> => ({
  why: "story",
  file: sheet.file,
  state: storyWords(sheet.story),
  story: sheet.story,
});

/**
 * Whether this view shows the story the mark on `anchor` was made on: a
 * mark off a sheet, or one whose document isn't here, always. A mark on
 * another story stands nowhere in this view, even where its element's
 * source line draws in the story shown: that is another state of it.
 */
export const showsStory = (anchor: PageAnchor, doc: Document | null): boolean =>
  !(anchor.sheet && doc) || drawingOf(doc, anchor.sheet) !== null;

/** Whether this view draws the page `anchor` was made on as it was made ({@link madeAway}): only then does it write where the mark stands. */
export const judges = (anchor: PageAnchor, doc: Document | null): boolean =>
  madeAway(anchor, doc) === null;
