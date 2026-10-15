/**
 * The one outline a tab and its hang (HangCard `tab`) are drawn in, and the
 * shape's one shadow: an svg over the page, above the card, drawing the
 * silhouette (motion/hang-shape) as one path with one stroke, and the same
 * shape's cast below the shelf.
 *
 * - The stroke: 1px, on the outline `HALF` in from the silhouette's edge, so
 *   it lies wholly inside it and covers whole device px at every scale
 *   (`vector-effect: non-scaling-stroke`). Its ink is the tab's rim at the
 *   strength the tab wears it (`--hang-rim`, PaneTabs) across the tab's top,
 *   running into the hang's edge (`border-control`) down the tab's flanks,
 *   whole by the top of the foot: the foot, the joint and the hang are one
 *   ink.
 * - The cast: `shadow-overlay-hung`'s two layers (0 18px 48px and 0 2px 6px,
 *   a blur of half each radius) of the same silhouette under the shelf,
 *   drawn only outside the shape (an `out` composite), so it draws no edge
 *   of its own, and cut at the shelf, so none falls on the tab.
 */
import type { HangGeometry } from "#lib/cawco/motion/hang-shape.js";
import { hangClip, hangOutline } from "#lib/cawco/motion/hang-shape.js";

const NS = "http://www.w3.org/2000/svg";

export interface OutlineLayer {
  /** Draws the silhouette `shape`, its rim in `rim` (a colour). */
  draw: (shape: HangGeometry, rim: string) => void;
  remove: () => void;
  /** Shown while the hang stands drawn out of its tab. */
  show: (shown: boolean) => void;
}

/** How many layers have been made: each one's defs are named apart. */
let made = 0;

/** The outline layer of the card `card`, stacked just over it. */
export function outlineLayer(card: HTMLElement): OutlineLayer {
  made += 1;
  const id = `hang-outline-${made}`;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "hang-outline");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = `<defs>
<linearGradient id="${id}-ink" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="0" y2="1"><stop offset="0" class="rim"/><stop offset="1" class="edge"/></linearGradient>
<clipPath id="${id}-under"><rect x="-100000" y="0" width="200000" height="200000"/></clipPath>
<filter id="${id}-cast" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">
<feGaussianBlur in="SourceAlpha" stdDeviation="24"/><feOffset dy="18" result="far"/><feFlood class="far"/><feComposite in2="far" operator="in" result="farInk"/>
<feGaussianBlur in="SourceAlpha" stdDeviation="3"/><feOffset dy="2" result="near"/><feFlood class="near"/><feComposite in2="near" operator="in" result="nearInk"/>
<feMerge result="both"><feMergeNode in="farInk"/><feMergeNode in="nearInk"/></feMerge>
<feComposite in="both" in2="SourceAlpha" operator="out"/>
</filter>
</defs>
<path class="cast" filter="url(#${id}-cast)" clip-path="url(#${id}-under)"/>
<path class="line" fill="none" stroke="url(#${id}-ink)" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  const gradient = svg.querySelector("linearGradient") as SVGElement;
  const rimStop = svg.querySelector("stop.rim") as SVGElement;
  const under = svg.querySelector("clipPath rect") as SVGElement;
  const cast = svg.querySelector("path.cast") as SVGElement;
  const line = svg.querySelector("path.line") as SVGElement;
  // Just over the card: at its stack (its own z-index, or its floating
  // wrapper's), later in the page, so over it.
  const stacks = [card, card.parentElement ?? card]
    .map((el) => Number.parseInt(getComputedStyle(el).zIndex, 10))
    .filter(Number.isFinite);
  svg.style.zIndex = stacks.length > 0 ? String(Math.max(...stacks)) : "";
  svg.style.display = "none";
  document.body.append(svg);
  return {
    draw(shape, rim) {
      line.setAttribute("d", hangOutline(shape));
      cast.setAttribute("d", hangClip(shape, { x: 0, y: 0 }));
      under.setAttribute("y", String(shape.tab.bottom));
      gradient.setAttribute("y1", String(shape.tab.top + shape.box.radius));
      gradient.setAttribute("y2", String(shape.tab.bottom - shape.box.flare));
      rimStop.style.setProperty("stop-color", rim || "var(--border-control)");
    },
    show(shown) {
      svg.style.display = shown ? "" : "none";
    },
    remove() {
      svg.remove();
    },
  };
}
