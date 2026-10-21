/**
 * Where an element's name tag stands (SamplePage's `tag`, as an attachment):
 * at its outline's top-left, as comment-design §2 draws it, unless that spot
 * lacks room; then the first of the outline's top-right, bottom-left and
 * bottom-right that has it. Room is `ROOM` clear of every part drawn on the
 * page that isn't the tag's own element (words, fills, edges, fields, glyphs,
 * pins with their rings, floating surfaces), inside the well or frame that
 * holds the page. With no spot clear, the tag keeps the top-left and
 * render.ts's sweep names what crowds it.
 *
 * It places again whenever something it reads can move: the fonts settling,
 * the page resizing, a pin or a floating surface arriving, moving or
 * finishing its entrance.
 */

/** The room a tag keeps from its neighbours; render.ts's sweep reads the same. */
const ROOM = 3;

/** The outline stands 4px out (2px offset, 2px wide); a tag stands on its outer edge. */
const OUT = "-4px";
const OFF = "calc(100% + 4px)";

const PLACES = [
  { insetInlineStart: OUT, insetInlineEnd: "auto", top: "auto", bottom: OFF },
  { insetInlineStart: "auto", insetInlineEnd: OUT, top: "auto", bottom: OFF },
  { insetInlineStart: OUT, insetInlineEnd: "auto", top: OFF, bottom: "auto" },
  { insetInlineStart: "auto", insetInlineEnd: OUT, top: OFF, bottom: "auto" },
] as const;

type Place = (typeof PLACES)[number];

const meets = (a: DOMRect, b: DOMRect) =>
  Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 &&
  Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;

const within = (a: DOMRect, b: DOMRect) =>
  a.left >= b.left - 0.5 && a.right <= b.right + 0.5 && a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5;

const grow = (r: DOMRect, by: number) => new DOMRect(r.x - by, r.y - by, r.width + 2 * by, r.height + 2 * by);

/** The box a part paints, its outline (a pin's focus ring) included; null when it paints nothing. */
const painted = (el: Element): DOMRect | null => {
  const s = getComputedStyle(el);
  if (s.display === "none" || s.visibility === "hidden") {
    return null;
  }
  const words = [...el.childNodes].some((child) => child.nodeType === Node.TEXT_NODE && (child.textContent ?? "").trim());
  const fill = s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent";
  const edge = [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth].some((w) => Number.parseFloat(w) > 0);
  const glyph = el instanceof SVGSVGElement || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
  if (!(words || fill || edge || glyph)) {
    return null;
  }
  const box = el.getBoundingClientRect();
  const ring = s.outlineStyle === "none" ? 0 : Number.parseFloat(s.outlineOffset) + Number.parseFloat(s.outlineWidth);
  return ring > 0 ? grow(box, ring) : box;
};

const put = (tag: HTMLElement, place: Place) => {
  Object.assign(tag.style, place);
};

/** Whether the tag, where it stands now, has its room. */
const roomy = (tag: HTMLElement) => {
  const field = tag.closest("[data-well], [data-frame]");
  const t = tag.getBoundingClientRect();
  if (field && !within(t, field.getBoundingClientRect())) {
    return false;
  }
  const room = grow(t, ROOM);
  const parts = [...(field ?? document.body).querySelectorAll("*"), ...document.querySelectorAll("[data-float]")];
  return parts.every((el) => {
    // Its own element, what holds it, and the decorations drawn aria-hidden (outlines, edges, dots) are no neighbours.
    if (el === tag || tag.contains(el) || el.contains(tag) || el.closest("[aria-hidden='true']")) {
      return true;
    }
    const box = painted(el);
    return !(box && meets(room, box));
  });
};

export const placeTag = (tag: HTMLElement) => {
  const place = () => {
    const fit = PLACES.find((spot) => {
      put(tag, spot);
      return roomy(tag);
    });
    put(tag, fit ?? PLACES[0]);
  };
  let queued = 0;
  const later = () => {
    cancelAnimationFrame(queued);
    queued = requestAnimationFrame(place);
  };
  place();
  document.fonts.ready.then(later);
  const sizes = new ResizeObserver(later);
  sizes.observe(tag.closest("[data-anchor='page']") ?? document.body);
  // A pin or a floating surface arriving or moving; the tag's own moves are left out.
  const moves = new MutationObserver((records) => {
    if (records.some((record) => !tag.contains(record.target))) {
      later();
    }
  });
  moves.observe(document.body, { attributes: true, attributeFilter: ["style", "class", "data-state", "hidden"], childList: true, subtree: true });
  // A surface easing in (a popover's open scale) moves its box with no mutation: place again once it lands.
  document.addEventListener("transitionend", later, true);
  document.addEventListener("animationend", later, true);
  return () => {
    cancelAnimationFrame(queued);
    sizes.disconnect();
    moves.disconnect();
    document.removeEventListener("transitionend", later, true);
    document.removeEventListener("animationend", later, true);
  };
};
