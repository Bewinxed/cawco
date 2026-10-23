/**
 * What the latest revision changed that the person hasn't looked at (PRD
 * §5.7, "Pointing and what changed"; core comments.ts `ArtifactChanges`),
 * as the host names it (`cawco:changes`): each changed element washed in
 * `--c-change-wash` (the done wash seen through: it stands over the element,
 * so its words read through it) where it stands, at its own radius, with no
 * edge, in an `<svg>` in the page's own document as the pins are (it scrolls
 * with the page), never taking a press. A wash the host stops naming fades off over
 * `--dur-fade`. Coral is the target's alone (DESIGN.md, The One Target
 * Rule): a wash is never coral, and the hover's `brand-wash` is not it.
 *
 * The host steps through them (its tag, `‹ ›`): this answers where each
 * stands in the page (`cawco:change-stops`), a pin whose element is in, holds
 * or is inside a changed one standing with it as one stop, in page order;
 * and a step brings its element into view and chooses it, the one 1px line
 * (`cawco:step-change`). A press on a washed element in Interact mode is a
 * look at it (`cawco:change-pressed`).
 */
import type { PageAnchor, Pin } from "@cawco/core/comments";
import type { Map as YMap } from "yjs";
import { artifact } from "./artifact";
import type { InkChrome } from "./radial";

const SVG = "http://www.w3.org/2000/svg";

export interface ChangesDeps {
  chrome: InkChrome;
  /** Whether the page takes presses now (Interact mode). */
  interacting: () => boolean;
  /** Where a pin's anchor stands now; null when nothing on the page matches it. */
  locate: (anchor: PageAnchor) => { el: Element } | null;
  /** `el` chosen in the overlay (The One Target Rule), or none. */
  outline: (el: Element | null) => void;
  post: (type: string, payload?: object) => void;
}

export interface Changes {
  /** Every wash drawn again where its element stands now. */
  draw: () => void;
  layer: SVGSVGElement;
  /** The changes the person hasn't looked at, by anchor, and the pins with an answer he hasn't: washed, and their stops told. */
  show: (anchors: string[], pins: string[]) => void;
  /** The change at `anchor` brought into view and chosen; a decision card's only for a moment (`flash`). */
  step: (anchor: string, flash: boolean) => void;
}

/** One stop of the host's tag, as this page orders them: the changes there, their element, and the pin standing with them. */
interface Stop {
  anchors: string[];
  el: Element | null;
  pin: string | null;
}

/** The element an anchor names in the page; null when it names none, or names it wrongly. */
const elementOf = (anchor: string): Element | null => {
  try {
    return document.querySelector(anchor);
  } catch {
    return null;
  }
};

export function startChanges(deps: ChangesDeps): Changes {
  const layer = document.createElementNS(SVG, "svg");
  layer.setAttribute("data-cawco-changes", "");
  layer.setAttribute("aria-hidden", "true");
  // Under the pins and the ink: it marks the page, never what stands on it.
  layer.style.cssText =
    "position:absolute;left:0;top:0;z-index:2147483645;overflow:visible;pointer-events:none;margin:0;padding:0;border:0;width:0;height:0";
  document.documentElement.append(layer);

  let anchors: string[] = [];
  let pinIds: string[] = [];
  /** The stops as last said to the host. */
  let lastSaid = "";
  /** Each wash drawn, by anchor. */
  const drawn = new Map<string, SVGRectElement>();

  const radiusOf = (el: Element): number => {
    const own = getComputedStyle(el);
    return Number.parseFloat(own.borderTopLeftRadius) || 0;
  };

  function draw() {
    const fill = deps.chrome.token("--c-change-wash");
    const fade = deps.chrome.ms("--dur-fade");
    const wanted = new Set(anchors);
    for (const [anchor, rect] of drawn) {
      if (!wanted.has(anchor)) {
        drawn.delete(anchor);
        rect.removeAttribute("data-change");
        rect.setAttribute("data-leaving", "");
        // Faded off over --dur-fade, then gone.
        rect.style.transition = `opacity ${fade}ms ease-out`;
        rect.style.opacity = "0";
        setTimeout(() => rect.remove(), fade);
      }
    }
    for (const anchor of anchors) {
      const el = elementOf(anchor);
      const r = el?.getBoundingClientRect();
      let rect = drawn.get(anchor);
      if (!(el && r && r.width > 0 && r.height > 0)) {
        rect?.remove();
        drawn.delete(anchor);
        continue;
      }
      if (!rect) {
        rect = document.createElementNS(SVG, "rect");
        rect.setAttribute("data-change", anchor);
        layer.append(rect);
        drawn.set(anchor, rect);
      }
      const radius = radiusOf(el);
      rect.setAttribute("x", String(r.left + scrollX));
      rect.setAttribute("y", String(r.top + scrollY));
      rect.setAttribute("width", String(r.width));
      rect.setAttribute("height", String(r.height));
      rect.setAttribute("rx", String(radius));
      rect.setAttribute("ry", String(radius));
      rect.setAttribute("fill", fill);
    }
    if (anchors.length + pinIds.length > 0 || lastSaid !== "") {
      tellStops();
    }
  }

  /** Whether `a` and `b` are one stop: one is the other, holds it or is inside it. */
  const together = (a: Element, b: Element) => a.contains(b) || b.contains(a);

  /** The stops in page order: each change with the pins in, holding or inside it; each other pin; changes not on the page last. */
  function tellStops() {
    const pins = artifact.doc().getMap("pins") as YMap<Pin>;
    const stops: Stop[] = anchors.map((anchor) => ({
      anchors: [anchor],
      el: elementOf(anchor),
      pin: null,
    }));
    for (const id of pinIds) {
      const pin = pins.get(id);
      const el =
        pin && "selector" in pin.anchor
          ? (deps.locate(pin.anchor)?.el ?? null)
          : null;
      const joined = el
        ? stops.find(
            (stop) => stop.el && stop.pin === null && together(stop.el, el)
          )
        : undefined;
      if (joined) {
        joined.pin = id;
      } else {
        stops.push({ anchors: [], el, pin: id });
      }
    }
    const placed = stops.filter((stop) => stop.el);
    placed.sort((a, b) => {
      const ra = (a.el as Element).getBoundingClientRect();
      const rb = (b.el as Element).getBoundingClientRect();
      return ra.top - rb.top || ra.left - rb.left;
    });
    const rest = stops.filter((stop) => !stop.el);
    const told = [...placed, ...rest].map(({ anchors: of, pin }) => ({
      anchors: of,
      pin,
    }));
    // Said again only when the order moved: a page drawing itself late (a decision page's cards) moves it.
    const said = JSON.stringify(told);
    if (said !== lastSaid) {
      lastSaid = said;
      deps.post("cawco:change-stops", { stops: told });
    }
  }

  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  function step(anchor: string, flash: boolean) {
    const el = elementOf(anchor);
    if (!el) {
      return;
    }
    clearTimeout(flashTimer);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: reduce ? "auto" : "smooth",
    });
    deps.outline(el);
    if (flash) {
      flashTimer = setTimeout(
        () => deps.outline(null),
        deps.chrome.ms("--dur-fade")
      );
    }
  }

  // A press on a washed element in Interact mode is a look at it.
  addEventListener(
    "pointerdown",
    (event) => {
      if (!deps.interacting() || anchors.length === 0) {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      const hit = anchors.find((anchor) => {
        const el = elementOf(anchor);
        return !!(el && target && el.contains(target));
      });
      if (hit) {
        deps.post("cawco:change-pressed", { anchor: hit });
      }
    },
    { capture: true, passive: true }
  );
  addEventListener("resize", () => draw(), { passive: true });
  // The page laid out again (a font, a picture, a morph): each wash stands where its element is now.
  new ResizeObserver(() => draw()).observe(document.documentElement);

  return {
    layer,
    draw,
    step,
    show: (next, pins) => {
      anchors = next;
      pinIds = pins;
      // Asked again by the host (its page loaded again): said whatever was said before.
      lastSaid = "-";
      draw();
    },
  };
}
