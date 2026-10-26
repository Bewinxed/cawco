// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: the page's reader is one function `page.evaluate` sends whole (it runs in the page and can import nothing)
/**
 * What scrolls sideways in a document, and why, read from the engine.
 *
 * A hit area (`touch-hit`, `pointer-hit`: a transparent ::after placed
 * absolutely about its control, design.css) counts toward the scrollable
 * overflow of every ancestor up to the first that clips, by the platform's
 * rule: a control at a box's end makes that box's scrollWidth its reach
 * past it. Inside a box that never scrolls that draws nothing. It matters
 * only where it lets the page, or a scroller, move sideways under a finger.
 *
 * `sideways()` reads the page's own scroller (`document.scrollingElement`)
 * and every element whose `overflow-x` lets it scroll, and for each one that
 * is wider inside than its box (scrollWidth > clientWidth) says why: its
 * content (some box drawn inside it reaches past its end: a strip that
 * scrolls by design), or a hit area (no box does; a control's ::after
 * reaches to its scroll width).
 *
 * It runs inside the page (`page.evaluate(sideways)`), so it is one
 * function with everything it needs inside it.
 */

/** One element that scrolls sideways, and why. */
export interface Sideways {
  /** Its content's farthest end from its scroll origin, its end padding included. */
  boxEdge: number;
  /** `content`: a box drawn in it reaches past its end; `hitArea`: only a control's ::after does. */
  cause: "content" | "hitArea";
  client: number;
  /** The farthest a hit area's ::after reaches from its scroll origin, 0 with none. */
  hitEdge: number;
  /** The controls whose ::after reach past its content's end. */
  hosts: string[];
  name: string;
  scroll: number;
}

export interface SidewaysRead {
  /** The page's own scroller. */
  page: { client: number; scroll: number };
  /** Every element that scrolls sideways, the page's own scroller among them. */
  scrollers: Sideways[];
}

export function sideways(): SidewaysRead {
  const root = document.scrollingElement ?? document.documentElement;
  const name = (el: Element) => {
    const slot =
      el.getAttribute("data-slot") ??
      el.getAttribute("aria-label") ??
      el.getAttribute("data-head-item");
    const cls = [...el.classList].slice(0, 2).join(".");
    return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}${slot ? `[${slot}]` : ""}`;
  };
  const shown = (el: Element) =>
    el.checkVisibility({ visibilityProperty: true, opacityProperty: false });
  const clips = (el: Element) =>
    getComputedStyle(el).overflowX !== "visible" ||
    // biome-ignore lint/performance/useTopLevelRegex: serialized into the page
    /paint|strict|content/u.test(getComputedStyle(el).contain);
  /** Whether a box between `el` and `scroller` clips it first. */
  const clippedBefore = (el: Element, scroller: Element) => {
    for (
      let at = el.parentElement;
      at && at !== scroller;
      at = at.parentElement
    ) {
      if (at === document.body && scroller === root) {
        return false;
      }
      if (clips(at)) {
        return true;
      }
    }
    return false;
  };
  const scrolls = (el: Element) => {
    if (el === root) {
      return !["hidden", "clip"].includes(
        getComputedStyle(document.documentElement).overflowX
      );
    }
    return ["auto", "scroll"].includes(getComputedStyle(el).overflowX);
  };
  const candidates = [
    root,
    ...[...document.querySelectorAll("body *")].filter(
      (el) => el !== root && scrolls(el)
    ),
  ].filter(
    (el) =>
      scrolls(el) &&
      (el === root || shown(el)) &&
      el.scrollWidth > el.clientWidth + 0.5
  );
  const scrollers: Sideways[] = candidates.map((scroller) => {
    const isRoot = scroller === root;
    const frame = isRoot ? { left: 0 } : scroller.getBoundingClientRect();
    const origin =
      frame.left +
      (isRoot ? 0 : scroller.clientLeft) -
      (isRoot ? window.scrollX : scroller.scrollLeft);
    const end = Number.parseFloat(getComputedStyle(scroller).paddingInlineEnd);
    let boxEdge = 0;
    let hitEdge = 0;
    const reaches: { edge: number; host: string }[] = [];
    for (const el of scroller.querySelectorAll("*")) {
      if (!shown(el) || clippedBefore(el, scroller)) {
        continue;
      }
      const { position } = getComputedStyle(el);
      if (position === "fixed") {
        continue;
      }
      const box = el.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) {
        continue;
      }
      boxEdge = Math.max(boxEdge, box.right - origin + end);
      const after = getComputedStyle(el, "::after");
      if (after.content !== "none" && after.position === "absolute") {
        const right = Number.parseFloat(after.right);
        if (Number.isFinite(right) && right < 0) {
          const edge = box.right - right + 0.5 - origin;
          hitEdge = Math.max(hitEdge, edge);
          reaches.push({ edge, host: name(el) });
        }
      }
    }
    boxEdge = Math.ceil(boxEdge);
    const scroll = scroller.scrollWidth;
    const client = scroller.clientWidth;
    const cause: Sideways["cause"] =
      boxEdge <= client + 0.5 && hitEdge >= scroll - 1 ? "hitArea" : "content";
    return {
      name: isRoot ? "document.scrollingElement" : name(scroller),
      scroll,
      client,
      boxEdge,
      hitEdge: Math.round(hitEdge * 10) / 10,
      cause,
      hosts: reaches
        .filter((one) => one.edge > boxEdge)
        .map((one) => one.host)
        .slice(0, 6),
    };
  });
  return {
    page: { scroll: root.scrollWidth, client: root.clientWidth },
    scrollers,
  };
}

/** A read's verdict: the page scrolls nothing sideways, and no scroller does because of a hit area. */
export const sidewaysHolds = (read: SidewaysRead): boolean =>
  read.page.scroll <= read.page.client &&
  read.scrollers.every((one) => one.cause !== "hitArea");
