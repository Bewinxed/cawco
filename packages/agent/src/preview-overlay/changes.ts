/**
 * What the person hasn't looked at since an update changed it (PRD §5.7,
 * "Pointing and what changed"; core comments.ts `ArtifactChanges`), as the
 * host names it (`cawco:changes`): each changed element ringed where it
 * stands, a `--c-change-ring` line `--c-change-ring-width` heavy standing
 * `--c-change-ring-offset` outside its box at its own radius grown by as
 * much, so it follows the element's shape and never covers what it says;
 * in the page's own document as the pins are, never taking a press.
 *
 * A ring stands on its element by CSS anchor positioning (anchor-names.ts),
 * never at a box measured here. A box measured once and placed in the
 * document's px stood where the element was then: a decision page scrolls
 * inside its first row (`page-scroll`), so neither its pictures loading nor
 * its scrolling ever moved the document, nor the rings. The ring hides while its element is scrolled out of its scroller
 * (`position-visibility: anchors-visible`). A ring the host stops naming
 * fades off over `--dur-fade`, on its element until it goes. Coral is the target's alone (DESIGN.md, The One Target
 * Rule): a ring is never coral.
 *
 * A ring pings once as its change lands, and again when the person steps
 * to it: a halo of its own colour spreading `--c-change-ping-spread` out
 * from the line as it fades, one turn of `--dur-loop` on `--ease-out`, a
 * Web Animation (`id` {@link PING}) on the ring's own halo, never on the
 * element. Asking for less motion, the ring stands without its ping.
 *
 * The host steps through them (its tag, `‹ ›`, a To check row, a chip):
 * this answers where each stands in the page (`cawco:change-stops`), a pin
 * whose element is in, holds or is inside a changed one standing with it
 * as one stop, in page order; and a step brings its element into view and
 * chooses it, the one 1px line (`cawco:step-change`), and pings its ring.
 * A press on a ringed element in Interact mode is a look at it
 * (`cawco:change-pressed`).
 */
import { type PageAnchor, readPins } from "@cawco/core/comments";
import {
  type Anchorable,
  anchorable,
  anchorName,
  nameOff,
  nameOn,
  onAnchor,
} from "./anchor-names";
import { artifact } from "./artifact";
import type { InkChrome } from "./radial";
import { bringInto, scrollersOf, scrollMoves } from "./scrollers";

/** A ring's ping, as `getAnimations()` names it. */
const PING = "cawco-change-ping";

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
  /** Every ring put on the element its anchor names now (a morph or a re-render may have made it another node), and the stops told. */
  draw: () => void;
  layer: HTMLDivElement;
  /** The changes the person hasn't looked at, by anchor, and the pins with an answer he hasn't: ringed, and their stops told. */
  show: (anchors: string[], pins: string[]) => void;
  /** The change at `anchor` brought into view, chosen and its ring pinged; a decision card's only for a moment (`flash`). */
  step: (anchor: string, flash: boolean) => void;
}

/** A ring: its box, the anchor name it stands on, and the element holding that name now. */
interface Ring {
  box: HTMLDivElement;
  el: Anchorable | null;
  name: string;
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
  const layer = document.createElement("div");
  layer.setAttribute("data-cawco-changes", "");
  layer.setAttribute("aria-hidden", "true");
  // No box of its own: each ring is fixed, its containing block the viewport (anchor-names.ts).
  layer.style.cssText = "display:contents";
  document.documentElement.append(layer);

  let anchors: string[] = [];
  let pinIds: string[] = [];
  /** The stops as last said to the host. */
  let lastSaid = "";
  /** Each ring drawn, by anchor. */
  const drawn = new Map<string, Ring>();
  /** Ring `ring` taken off the page at once. */
  function drop(ring: Ring) {
    ring.box.remove();
    if (ring.el) {
      nameOff(ring.el, ring.name);
    }
  }
  /** Rings drawn since the page loaded: one is pinged as it first stands. */
  const landed = new Set<string>();

  // The page laid out again (a font, a picture, a morph) or an element a
  // ring names took a box or lost it: drawn again in the next frame, for
  // which elements have a ring and the stops' order; where a ring stands is
  // its anchor's, never this. Drawn inside the delivery, what it wrote laid
  // the page out again where the delivery had already passed, and WebKit
  // reported "ResizeObserver loop completed with undelivered notifications"
  // (a decision page's embed, its root 0×0).
  let laidOut = 0;
  const sized = new ResizeObserver(() => {
    if (!laidOut) {
      laidOut = requestAnimationFrame(() => {
        laidOut = 0;
        draw();
      });
    }
  });
  sized.observe(document.documentElement);
  /** The elements the host's anchors name, each watched for its box (`sized`); observed once, since observing again delivers again. */
  const watched = new Set<Element>();

  const radiusOf = (el: Element): number => {
    const own = getComputedStyle(el);
    return Number.parseFloat(own.borderTopLeftRadius) || 0;
  };

  const look = () =>
    deps.chrome.tokens({
      ring: ["--c-change-ring"],
      width: ["--c-change-ring-width", "width"],
      offset: ["--c-change-ring-offset", "width"],
      spread: ["--c-change-ping-spread", "width"],
    });

  /** Ring `ring` pings once: its halo spreads out from the line and fades, unless the person asks for less motion. */
  function ping(ring: HTMLDivElement) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const halo = ring.firstElementChild as HTMLDivElement | null;
    if (!halo) {
      return;
    }
    for (const running of halo.getAnimations()) {
      running.cancel();
    }
    const { ring: colour, spread } = look();
    const run = halo.animate(
      [
        { boxShadow: `0 0 0 0 ${colour}`, opacity: 0.6 },
        { boxShadow: `0 0 0 ${spread} ${colour}`, opacity: 0 },
      ],
      {
        duration: deps.chrome.ms("--dur-loop"),
        easing: deps.chrome.token("--ease-out", "transition-timing-function"),
      }
    );
    run.id = PING;
  }

  /** The rings the host no longer names fade off over --dur-fade, standing on their element until they go. */
  function letGo(wanted: ReadonlySet<string>) {
    const fade = deps.chrome.ms("--dur-fade");
    for (const [anchor, ring] of drawn) {
      if (wanted.has(anchor)) {
        continue;
      }
      drawn.delete(anchor);
      ring.box.removeAttribute("data-change");
      ring.box.setAttribute("data-leaving", "");
      ring.box
        .animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: fade,
          easing: "ease-out",
          fill: "forwards",
        })
        .finished.then(
          () => drop(ring),
          () => drop(ring)
        );
    }
  }

  /** The ring for `anchor`, made and put on the layer when it has none; `fresh` when made now. */
  function ringFor(anchor: string): { ring: Ring; fresh: boolean } {
    const had = drawn.get(anchor);
    if (had) {
      return { ring: had, fresh: false };
    }
    const ring: Ring = {
      box: document.createElement("div"),
      el: null,
      name: anchorName(),
    };
    ring.box.setAttribute("data-change", anchor);
    const halo = document.createElement("div");
    halo.setAttribute("data-ping", "");
    ring.box.append(halo);
    layer.append(ring.box);
    drawn.set(anchor, ring);
    return { ring, fresh: true };
  }

  /** The elements `named` watched for their box (`sized`), and no other. */
  function watch(named: ReadonlySet<Element>) {
    for (const el of watched) {
      if (!named.has(el)) {
        sized.unobserve(el);
        watched.delete(el);
      }
    }
    for (const el of named) {
      if (!watched.has(el)) {
        sized.observe(el);
        watched.add(el);
      }
    }
  }

  /**
   * The ring for `anchor` stands on the element it names as the page has it
   * now: made, moved to the element the anchor names now, or taken off while
   * that element has no box (none on the page, `display: none`, nothing to
   * it yet, as a picture before it loads). Where it stands is the browser's
   * (the anchor), so nothing here is measured but whether there is a box.
   * The element named, box or none.
   */
  function stand(
    anchor: string,
    { colour, line, out }: { colour: string; line: number; out: number }
  ): Anchorable | null {
    const found = elementOf(anchor);
    const el = anchorable(found) ? found : null;
    const box = el?.getBoundingClientRect();
    if (!(el && box && box.width > 0 && box.height > 0)) {
      const gone = drawn.get(anchor);
      if (gone) {
        drop(gone);
        drawn.delete(anchor);
      }
      return el;
    }
    const { ring, fresh } = ringFor(anchor);
    if (ring.el !== el) {
      if (ring.el) {
        nameOff(ring.el, ring.name);
      }
      ring.el = el;
      nameOn(el, ring.name);
    }
    const radius = radiusOf(el) + out;
    // Its edges are its element's, `out` beyond them; it hides while its element is scrolled out of its scroller.
    ring.box.style.cssText = `${onAnchor(ring.name, out)};position-visibility:anchors-visible;z-index:2147483645;box-sizing:border-box;margin:0;pointer-events:none;border:${line}px solid ${colour};border-radius:${radius}px`;
    (ring.box.firstElementChild as HTMLDivElement).style.cssText =
      `position:absolute;inset:-${line}px;border-radius:${radius}px;opacity:0;pointer-events:none`;
    if (fresh && !landed.has(anchor)) {
      landed.add(anchor);
      ping(ring.box);
    }
    return el;
  }

  /** Every ring the host names stands on its element ({@link stand}), the rest let go, and the stops told. */
  function draw() {
    const { ring: colour, width, offset } = look();
    const line = Number.parseFloat(width) || 2;
    const out = (Number.parseFloat(offset) || 3) + line;
    letGo(new Set(anchors));
    const named = new Set<Element>();
    for (const anchor of anchors) {
      const el = stand(anchor, { colour, line, out });
      if (el) {
        named.add(el);
      }
    }
    // Watched whether it has a box now or not: one without takes its ring when it gets one.
    watch(named);
    if (anchors.length + pinIds.length > 0 || lastSaid !== "") {
      tellStops();
    }
  }

  /** Whether `a` and `b` are one stop: one is the other, holds it or is inside it. */
  const together = (a: Element, b: Element) => a.contains(b) || b.contains(a);

  /** The stops in page order: each change with the pins in, holding or inside it; each other pin; changes not on the page last. */
  function tellStops() {
    const pins = readPins(artifact.doc());
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
    // Up and down only, by the scrollers round it (scrollers.ts, as a pin is
    // brought out): `scrollIntoView` also scrolled every scroller round it
    // sideways, a page's column off its fixed foot among them.
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const moves = bringInto(scrollersOf(el), el.getBoundingClientRect().top, [
      { top: 0, bottom: innerHeight },
    ]);
    if (moves) {
      scrollMoves(moves, reduce ? "auto" : "smooth");
    }
    deps.outline(el);
    const ring = drawn.get(anchor);
    if (ring) {
      ping(ring.box);
    }
    if (flash) {
      flashTimer = setTimeout(
        () => deps.outline(null),
        deps.chrome.ms("--dur-fade")
      );
    }
  }

  // A press on a ringed element in Interact mode is a look at it.
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
