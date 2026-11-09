/**
 * The overlay's boxes that stand on an element of the page (a change's ring,
 * changes.ts; the One Target, page.ts) stand there by CSS anchor
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

/** Whether `el` is an element of this page's document that takes an inline style; another document's (a same-origin frame's) never anchors a box of this one. */
export const anchorable = (el: Element | null): el is Anchorable =>
  !!el &&
  el.ownerDocument === document &&
  (el instanceof HTMLElement ||
    el instanceof SVGElement ||
    el instanceof MathMLElement);

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
