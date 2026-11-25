/**
 * The overlay's boxes that stand on an element of the page (a change's ring,
 * changes.ts; the One Target, page.ts; a row of pins' pills, pins.ts, in
 * the page's document or a same-origin frame's) stand there by CSS anchor
 * positioning, never at a box measured once: the element takes the box's
 * name (`anchor-name`) and the box's edges are the element's (`anchor()` on
 * its default anchor, `position-anchor`), so the browser lays the box out
 * with the element through every picture and font that loads, every resize
 * and every scroll, the window's and a scroller's of the page's own
 * (css-anchor-position-1 §3.3: a box "compensating for scroll" moves with
 * its default anchor).
 *
 * A name is given inline, after the element's own names, and every box's
 * name on one element is held here, so two boxes on it never write over
 * each other. When the page writes the element's style again (a morph, its
 * framework), the names are given back at once; when the last box leaves
 * it, the element has its own `anchor-name` back, and a style attribute it
 * never had goes with it.
 *
 * A box that anchors here is `position: fixed`, so its containing block is
 * the viewport, which holds every element it can anchor to. Absolute, in a
 * layer of the overlay's, the layer would be its containing block with no
 * element of the page inside it ("acceptable anchor element"); and
 * Chromium moved an absolute box with the window's scroll, not with a fixed
 * element it stood on, and Firefox took no fixed element as its anchor.
 *
 * A name is the document's (a tree-scoped name), and so is the rule that
 * reads it: a box in the overlay's shadow root takes it through a rule of
 * the document's on its part (`::part`), never through its own sheet, which
 * Chromium, WebKit and Firefox all leave unanchored.
 */

/** An element that takes an inline style: what a box can anchor to. */
export type Anchorable = Element & ElementCSSInlineStyle;

/** The namespaces whose elements take an inline style: HTML's, SVG's and MathML's. */
const STYLED = new Set([
  "http://www.w3.org/1999/xhtml",
  "http://www.w3.org/2000/svg",
  "http://www.w3.org/1998/Math/MathML",
]);

/**
 * Whether `el` is an element of `doc` that takes an inline style: what a box
 * of `doc`'s can anchor to. A name is its document's, so a box anchors only
 * in its own document: one of this page's never to a same-origin frame's
 * element; the pins put a frame's pills in that frame's document (pins.ts).
 * Judged by its namespace, never by `instanceof`: Chromium gives a frame's
 * element a wrapper of whichever window's realm reached it first, so it is
 * an instance of the page's classes on one load and the frame's on another.
 */
export const anchorable = (
  el: Element | null,
  doc: Document = document
): el is Anchorable =>
  !!el &&
  el.ownerDocument === doc &&
  STYLED.has(el.namespaceURI ?? "") &&
  "style" in el;

/** Names made since the page loaded: each box's is the next. */
let made = 0;

/** A name no other box of the overlay's has. */
export function anchorName(): string {
  made += 1;
  return `--cawco-anchor-${made}`;
}

/** The declarations that stand a fixed box on anchor `name`, its edges `out` px beyond the element's. */
export const onAnchor = (name: string, out = 0): string =>
  `position:fixed;position-anchor:${name};top:calc(anchor(top) - ${out}px);right:calc(anchor(right) - ${out}px);bottom:calc(anchor(bottom) - ${out}px);left:calc(anchor(left) - ${out}px)`;

/** A list of anchor names, as `anchor-name` computes one, between its names. */
const NAME_LIST = /\s*,\s*/u;

/** An element boxes stand on: what it had before them, the names it has of its own, the boxes', and the value it was last given. */
interface Hold {
  /** Whether it had a style attribute before. */
  attribute: boolean;
  given: string;
  /** Its own inline `anchor-name` before. */
  inline: string;
  names: Set<string>;
  own: string[];
}

const held = new Map<Anchorable, Hold>();

/** `el`'s `anchor-name` written: its own names, then its boxes'. */
function give(el: Anchorable, hold: Hold) {
  el.style.setProperty("anchor-name", [...hold.own, ...hold.names].join(", "));
  hold.given = el.style.getPropertyValue("anchor-name");
}

// The page wrote the element's style again: its boxes' names are given back at once.
const restyled = new MutationObserver((records) => {
  for (const { target } of records) {
    const el = target as Anchorable;
    const hold = held.get(el);
    if (hold && el.style.getPropertyValue("anchor-name") !== hold.given) {
      give(el, hold);
    }
  }
});

/** The box named `name` stands on `el`. */
export function nameOn(el: Anchorable, name: string): void {
  let hold = held.get(el);
  if (!hold) {
    const own = getComputedStyle(el).getPropertyValue("anchor-name").trim();
    hold = {
      attribute: el.hasAttribute("style"),
      given: "",
      inline: el.style.getPropertyValue("anchor-name"),
      names: new Set(),
      own: own === "" || own === "none" ? [] : own.split(NAME_LIST),
    };
    held.set(el, hold);
    restyled.observe(el, { attributes: true, attributeFilter: ["style"] });
  }
  hold.names.add(name);
  give(el, hold);
}

/** The box named `name` stands on `el` no more; with none left, `el` is as it was. */
export function nameOff(el: Anchorable, name: string): void {
  const hold = held.get(el);
  if (!hold?.names.delete(name)) {
    return;
  }
  if (hold.names.size > 0) {
    give(el, hold);
    return;
  }
  held.delete(el);
  if (hold.inline) {
    el.style.setProperty("anchor-name", hold.inline);
  } else {
    el.style.removeProperty("anchor-name");
  }
  if (!hold.attribute && el.getAttribute("style") === "") {
    el.removeAttribute("style");
  }
}

/** Whether a box on an anchor follows the anchor's transform, as measured once ({@link anchorsFollowTransforms}). */
let followsTransforms: boolean | null = null;

/**
 * Whether this browser lays a box on its anchor where the anchor is drawn,
 * its transforms with it (Chromium, Safari 27), or where it is laid out
 * before them (Firefox, Safari 26). Measured once, in `into` (a layer of the
 * overlay's own, after the body, so the page hears nothing): a fixed anchor
 * moved 100px by a transform, and a box standing on its left edge.
 */
export function anchorsFollowTransforms(into: Element): boolean {
  if (followsTransforms !== null) {
    return followsTransforms;
  }
  const doc = into.ownerDocument;
  const name = anchorName();
  const hidden =
    "position:fixed;top:0;left:0;width:10px;height:10px;visibility:hidden;pointer-events:none;margin:0";
  const anchor = doc.createElement("div");
  anchor.style.cssText = `${hidden};transform:translateX(100px);anchor-name:${name}`;
  const box = doc.createElement("div");
  box.style.cssText = `${hidden};position-anchor:${name};left:anchor(left)`;
  into.append(anchor, box);
  followsTransforms =
    Math.abs(
      box.getBoundingClientRect().left - anchor.getBoundingClientRect().left
    ) < 1;
  anchor.remove();
  box.remove();
  return followsTransforms;
}
