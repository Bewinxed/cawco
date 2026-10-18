/**
 * The page in the scheme it isn't showing, for its thumbnail: the transcript
 * draws the thumbnail in the reader's scheme, so a page artifact (which draws
 * in the host's theme, page.ts `themed`) is drawn in both.
 *
 * The live page is never touched: flipping its root would repaint what the
 * person is looking at. A thumbnail is drawn from the DOM and its computed
 * styles (picture.ts), not from pixels, so the other scheme needs only a
 * document whose styles resolve in it. That document is a copy of this one,
 * as it stands now, in a frame of this page's own origin that is never
 * painted (`visibility: hidden`), the size of this page's viewport, inside
 * the overlay's shadow root (none of the page's observers see it), sandboxed
 * with scripts off (its copied scripts and handlers never run, and its own
 * frames load nothing). No second load of the page, no second overlay, no
 * second join of the artifact's doc. What a static copy would lose is
 * carried over: a style filled by script, adopted sheets, open shadow
 * roots, a canvas's drawing, a select's choice, scroll, the page's custom
 * elements as defined, and its quirks mode.
 *
 * A page whose colours in view are the same in both schemes is light-only
 * (or dark-only): it is said `same`, and nothing more is drawn.
 */
import { readWithin } from "@cawco/core/bounded";
import { cropPicture, groundOf, SKIPPED } from "./picture";

export type Scheme = "light" | "dark";

/** How long the copy's sheets, images and fonts have to arrive (each from the cache the page filled). Our call. */
const SETTLE_MS = 3000;
/** Elements in view whose colours are compared at most; past it the page is taken to change. Our call. */
const COMPARED_MAX = 4000;
/** What every box paints, wherever it stands. */
const BOX_PAINT = ["background-color", "background-image", "box-shadow"];
/** What text paints: read only where an element holds text, as a colour no text uses draws nothing (a root's `CanvasText` under a body that sets its own). */
const TEXT_PAINT = ["color", "text-decoration-color", "text-shadow"];
/** What an SVG shape paints. */
const SHAPE_PAINT = ["fill", "stroke"];
const SIDES = ["top", "right", "bottom", "left"];
/** Elements whose text is their own though no text node says it. */
const TEXT_CONTROLS = new Set(["input", "textarea", "select", "button"]);
const SVG_NS = "http://www.w3.org/2000/svg";

/** Whether `el` holds words of its own (a text node, a control's value). */
const holdsText = (el: Element) =>
  TEXT_CONTROLS.has(el.localName) ||
  Array.from(el.childNodes).some(
    (node) => node.nodeType === Node.TEXT_NODE && !!node.textContent?.trim()
  );

/** The properties `el` (or its pseudo-element, when `pseudo`) paints with, as `style` (the page's) has it drawn. */
function paintedBy(
  el: Element,
  style: CSSStyleDeclaration,
  pseudo: boolean
): string[] {
  const keys = [...BOX_PAINT];
  for (const side of SIDES) {
    if (
      Number.parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0 &&
      style.getPropertyValue(`border-${side}-style`) !== "none"
    ) {
      keys.push(`border-${side}-color`);
    }
  }
  if (
    style.outlineStyle !== "none" &&
    Number.parseFloat(style.outlineWidth) > 0
  ) {
    keys.push("outline-color");
  }
  if (pseudo ? style.content !== "none" : holdsText(el)) {
    keys.push(...TEXT_PAINT);
  }
  if (el.namespaceURI === SVG_NS) {
    keys.push(...SHAPE_PAINT);
  }
  return keys;
}

/** Each element of the page beside its copy, in document order, the roots first. */
type Pairs = [Element, Element][];

/** Whether `el` (this page's) stands in its viewport. */
const inView = (el: Element) => {
  const r = el.getBoundingClientRect();
  return (
    r.width > 0 &&
    r.height > 0 &&
    r.right > 0 &&
    r.bottom > 0 &&
    r.left < innerWidth &&
    r.top < innerHeight
  );
};

/** The sandboxed, unpainted frame the copy stands in, this viewport's size, ready to write. */
function blankFrame(into: ParentNode): Promise<HTMLIFrameElement> {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("sandbox", "allow-same-origin");
  frame.tabIndex = -1;
  // `prefers-color-scheme` in a frame follows its element's `color-scheme`:
  // the copy hears what this page hears.
  const prefers = matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
  frame.style.cssText = `position:fixed;left:0;top:0;inline-size:${innerWidth}px;block-size:${innerHeight}px;border:0;margin:0;padding:0;visibility:hidden;pointer-events:none;color-scheme:${prefers}`;
  // The copy lays out in this page's mode, at its base URL: a page with no
  // doctype in the frame's first about:blank document (quirks, there at
  // once), any other in a srcdoc one (always no-quirks).
  if (document.compatMode === "BackCompat") {
    into.append(frame);
    return Promise.resolve(frame);
  }
  frame.srcdoc = "<!doctype html>";
  return new Promise((done) => {
    frame.addEventListener("load", () => done(frame), { once: true });
    into.append(frame);
  });
}

/** A copy's sheet as the browser holds it: its rules, CSSOM edits included. */
function rulesOf(sheet: CSSStyleSheet | null): string | null {
  try {
    return sheet
      ? Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n")
      : null;
  } catch {
    return null;
  }
}

/** `sheets` (a document's or a shadow root's adopted ones) as <style> elements of `doc`, appended to `into`. */
function adopt(
  doc: Document,
  sheets: CSSStyleSheet[],
  into: ParentNode | null
) {
  for (const sheet of sheets) {
    const rules = rulesOf(sheet);
    if (rules && into) {
      const style = doc.createElement("style");
      style.textContent = rules;
      into.append(style);
    }
  }
}

/**
 * The elements under `live` beside their copies under `copy` (the same
 * tree, imported), each copy made to draw as its element does: a style's
 * rules as the browser holds them, a frame left blank, media left still, an
 * open shadow root copied in (its own elements paired the same way).
 */
function pairUp(
  doc: Document,
  live: ParentNode,
  copy: ParentNode,
  pairs: Pairs
) {
  const lives = live.querySelectorAll("*");
  const copies = copy.querySelectorAll("*");
  for (let i = 0; i < lives.length; i += 1) {
    const [one, made] = [lives[i], copies[i]];
    if (!(one && made)) {
      break;
    }
    pairs.push([one, made]);
    drawsAsIs(one, made);
    const shadow = one.shadowRoot;
    if (shadow && !one.matches(SKIPPED) && !made.shadowRoot) {
      copyShadow(doc, shadow, made, pairs);
    }
  }
}

/** `made` set to draw as `one` does: a style's rules as the browser holds them, a frame left blank, media left still. */
function drawsAsIs(one: Element, made: Element) {
  if (one instanceof HTMLStyleElement) {
    // A style the page's script filled by insertRule has no text of its own.
    const rules = rulesOf(one.sheet);
    if (rules !== null) {
      made.textContent = rules;
    }
  } else if (one.localName === "iframe" || one.localName === "frame") {
    made.setAttribute("src", "about:blank");
    made.removeAttribute("srcdoc");
  } else if (one.localName === "video" || one.localName === "audio") {
    made.removeAttribute("autoplay");
    made.setAttribute("preload", "none");
  }
}

/** An open shadow root `shadow` copied onto `made`, its elements paired as the page's are. */
function copyShadow(
  doc: Document,
  shadow: ShadowRoot,
  made: Element,
  pairs: Pairs
) {
  try {
    const into = made.attachShadow({ mode: "open" });
    into.append(
      ...Array.from(shadow.childNodes, (node) => doc.importNode(node, true))
    );
    adopt(doc, shadow.adoptedStyleSheets, into);
    pairUp(doc, shadow, into, pairs);
  } catch {
    // An element that takes no shadow root of its own draws as its light tree.
  }
}

/** This page's document copied into `doc`, element beside element. */
function copyInto(doc: Document): Pairs {
  const live = document.documentElement;
  const root = doc.importNode(live, true);
  const pairs: Pairs = [[live, root]];
  pairUp(doc, live, root, pairs);
  doc.replaceChild(root, doc.documentElement);
  // A copied <link> keeps its own URL; others read the copy at this page's.
  adopt(doc, document.adoptedStyleSheets, doc.head);
  return pairs;
}

/** What the live page holds that a copy loses: a canvas's drawing, a select's choice, a box's scroll. */
function carryState(pairs: Pairs) {
  for (const [one, copy] of pairs) {
    if (one instanceof HTMLCanvasElement) {
      const ctx = (copy as HTMLCanvasElement).getContext("2d");
      try {
        ctx?.drawImage(one, 0, 0);
      } catch {
        // A canvas the copy can't draw from stays blank.
      }
    } else if (one instanceof HTMLSelectElement) {
      (copy as HTMLSelectElement).selectedIndex = one.selectedIndex;
    }
    if (one.scrollTop || one.scrollLeft) {
      copy.scrollTop = one.scrollTop;
      copy.scrollLeft = one.scrollLeft;
    }
  }
}

/** What `:defined` reads in the copy: the copy's own built-ins, and each custom element defined on the page (marked {@link DEFINED_MARK}). */
const DEFINED = ":is(:defined, [data-cawco-defined])";
const DEFINED_MARK = "data-cawco-defined";

/** `rules` and every rule nested in them, `:defined` read as {@link DEFINED}; by shape, as they are another window's. */
function defineIn(rules: CSSRuleList) {
  for (const rule of Array.from(rules)) {
    const styled = rule as Partial<CSSStyleRule>;
    if (styled.selectorText?.includes(":defined")) {
      styled.selectorText = styled.selectorText.replaceAll(":defined", DEFINED);
    }
    const nested = (rule as Partial<CSSGroupingRule>).cssRules;
    if (nested) {
      defineIn(nested);
    }
  }
}

/**
 * The page's custom elements as defined as they are on the page. The copy
 * runs no script, so its registry is empty and `:defined` would match none
 * of them (a page hiding them until defined drew them hidden): each one the
 * page has defined is marked, and every sheet the copy reads, in the
 * document and in its shadow roots, reads `:defined` as the mark too.
 */
function carryDefined(doc: Document, pairs: Pairs) {
  for (const [one, copy] of pairs) {
    if (one.localName.includes("-") && customElements.get(one.localName)) {
      copy.setAttribute(DEFINED_MARK, "");
    }
  }
  const roots: (Document | ShadowRoot)[] = [doc];
  for (const [, copy] of pairs) {
    if (copy.shadowRoot) {
      roots.push(copy.shadowRoot);
    }
  }
  for (const root of roots) {
    for (const sheet of Array.from(root.styleSheets)) {
      try {
        defineIn(sheet.cssRules);
      } catch {
        // Another origin's sheet keeps its rules as they are.
      }
    }
  }
}

/**
 * The copy's sheets, images and fonts, each from the cache, within
 * {@link SETTLE_MS}. Unanswered by then, the copy is drawn as it stands: one
 * late image is a gap in a 90 px thumbnail, never a reason to draw none.
 */
function settled(doc: Document): Promise<unknown> {
  const waits: Promise<unknown>[] = [doc.fonts.ready];
  for (const link of doc.querySelectorAll<HTMLLinkElement>(
    'link[rel~="stylesheet"]'
  )) {
    if (!link.sheet) {
      waits.push(
        new Promise((done) => {
          link.addEventListener("load", done, { once: true });
          link.addEventListener("error", done, { once: true });
        })
      );
    }
  }
  for (const img of doc.images) {
    if (!img.complete) {
      waits.push(img.decode().catch(() => undefined));
    }
  }
  return readWithin(SETTLE_MS, () => Promise.all(waits));
}

/**
 * Whether every element in view paints the same colours in the copy as on
 * the page, on the same ground (the root's background, else the body's,
 * else the browser's canvas, which a scheme turns: picture.ts `groundOf`).
 */
function sameColours(view: Window, pairs: Pairs): boolean {
  if (groundOf(window) !== groundOf(view)) {
    return false;
  }
  let compared = 0;
  for (const [one, copy] of pairs) {
    if (one.closest(SKIPPED) || !(one === pairs[0]?.[0] || inView(one))) {
      continue;
    }
    compared += 1;
    if (compared > COMPARED_MAX) {
      return false;
    }
    // The element, and its ::before and ::after where they draw: what each paints.
    for (const pseudo of [null, "::before", "::after"]) {
      const was = getComputedStyle(one, pseudo);
      if (pseudo && was.content === "none") {
        continue;
      }
      const now = view.getComputedStyle(copy, pseudo);
      if (
        paintedBy(one, was, !!pseudo).some(
          (key) => was.getPropertyValue(key) !== now.getPropertyValue(key)
        )
      ) {
        return false;
      }
    }
  }
  return true;
}

/**
 * This page drawn in `scheme` (its root's `color-scheme` and `data-theme`
 * set by `theme`, as page.ts `themed` sets them), at the scroll it stands at
 * now, as a thumbnail of at most `area` pixels; `same` when nothing in view
 * would change, so nothing is drawn.
 */
export async function drawInScheme(
  scheme: Scheme,
  {
    area,
    into,
    theme,
    failed,
  }: {
    area: number;
    failed: (message: string) => void;
    into: ParentNode;
    theme: (root: HTMLElement, scheme: Scheme) => void;
  }
): Promise<{ same: true } | { same: false; png: string | null }> {
  const frame = await blankFrame(into);
  try {
    const view = frame.contentWindow;
    const doc = frame.contentDocument;
    if (!(view && doc)) {
      failed("The browser gave no frame to draw the page's other scheme in.");
      return { same: false, png: null };
    }
    const pairs = copyInto(doc);
    theme(doc.documentElement, scheme);
    await settled(doc);
    carryDefined(doc, pairs);
    view.scrollTo(scrollX, scrollY);
    carryState(pairs);
    if (sameColours(view, pairs)) {
      return { same: true };
    }
    const png = await cropPicture(
      { x: view.scrollX, y: view.scrollY, w: innerWidth, h: innerHeight },
      failed,
      { area, thumbnail: true, view }
    );
    return { same: false, png };
  } finally {
    frame.remove();
  }
}
