/**
 * What the person hasn't looked at since an update changed it (PRD §5.7,
 * "Pointing and what changed"; core comments.ts `ArtifactChanges`), as the
 * host names it (`cawco:changes`): each changed element ringed where it
 * stands, a `--c-change-ring` line `--c-change-ring-width` heavy standing
 * `--c-change-ring-offset` outside its box at its own radius grown by as
 * much, so it follows the element's shape and never covers what it says;
 * in the page's own document as the pins are (it scrolls with the page),
 * never taking a press. A ring the host stops naming fades off over
 * `--dur-fade`. Coral is the target's alone (DESIGN.md, The One Target
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
import { artifact } from "./artifact";
import type { InkChrome } from "./radial";

/** A ring's ping, as `getAnimations()` names it. */
export const PING = "cawco-change-ping";

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
  /** Every ring drawn again where its element stands now. */
  draw: () => void;
  layer: HTMLDivElement;
  /** The changes the person hasn't looked at, by anchor, and the pins with an answer he hasn't: ringed, and their stops told. */
  show: (anchors: string[], pins: string[]) => void;
  /** The change at `anchor` brought into view, chosen and its ring pinged; a decision card's only for a moment (`flash`). */
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
  const layer = document.createElement("div");
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
  /** Each ring drawn, by anchor. */
  const drawn = new Map<string, HTMLDivElement>();
  /** Rings drawn since the page loaded: one is pinged as it first stands. */
  const landed = new Set<string>();

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

  /** The rings the host no longer names fade off over --dur-fade, then go. */
  function letGo(wanted: ReadonlySet<string>) {
    const fade = deps.chrome.ms("--dur-fade");
    for (const [anchor, ring] of drawn) {
      if (wanted.has(anchor)) {
        continue;
      }
      drawn.delete(anchor);
      ring.removeAttribute("data-change");
      ring.setAttribute("data-leaving", "");
      ring
        .animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: fade,
          easing: "ease-out",
          fill: "forwards",
        })
        .finished.then(
          () => ring.remove(),
          () => ring.remove()
        );
    }
  }

  function draw() {
    const { ring: colour, width, offset } = look();
    const line = Number.parseFloat(width) || 2;
    const out = (Number.parseFloat(offset) || 3) + line;
    letGo(new Set(anchors));
    for (const anchor of anchors) {
      const el = elementOf(anchor);
      const r = el?.getBoundingClientRect();
      let ring = drawn.get(anchor);
      if (!(el && r && r.width > 0 && r.height > 0)) {
        ring?.remove();
        drawn.delete(anchor);
        continue;
      }
      const fresh = !ring;
      if (!ring) {
        ring = document.createElement("div");
        ring.setAttribute("data-change", anchor);
        const halo = document.createElement("div");
        halo.setAttribute("data-ping", "");
        ring.append(halo);
        layer.append(ring);
        drawn.set(anchor, ring);
      }
      const radius = radiusOf(el) + out;
      ring.style.cssText = `position:absolute;box-sizing:border-box;pointer-events:none;left:${r.left + scrollX - out}px;top:${r.top + scrollY - out}px;width:${r.width + 2 * out}px;height:${r.height + 2 * out}px;border:${line}px solid ${colour};border-radius:${radius}px`;
      (ring.firstElementChild as HTMLDivElement).style.cssText =
        `position:absolute;inset:-${line}px;border-radius:${radius}px;opacity:0;pointer-events:none`;
      if (fresh && !landed.has(anchor)) {
        landed.add(anchor);
        ping(ring);
      }
    }
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
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: reduce ? "auto" : "smooth",
    });
    deps.outline(el);
    const ring = drawn.get(anchor);
    if (ring) {
      ping(ring);
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
  // The page laid out again (a font, a picture, a morph): each ring stands
  // where its element is now, drawn in the next frame. Drawn inside the
  // delivery, what it wrote laid the page out again where the delivery had
  // already passed, and WebKit reported "ResizeObserver loop completed with
  // undelivered notifications" (a decision page's embed, its root 0×0).
  let laidOut = 0;
  new ResizeObserver(() => {
    if (!laidOut) {
      laidOut = requestAnimationFrame(() => {
        laidOut = 0;
        draw();
      });
    }
  }).observe(document.documentElement);

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
