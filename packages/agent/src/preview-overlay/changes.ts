/**
 * What changed since the person looked, on the page (Projects spec §5.7,
 * "Pointing and what changed"; core changes.ts). The hub writes each
 * revision's changes into the doc's `meta.changes`; the person's looks are
 * `meta.seen` and each pin's `seenAt`.
 *
 * - **The done wash.** Each changed element the person has not looked at
 *   takes a translucent `change-wash` (the done glyph at the alpha that
 *   keeps the element's words at 4.5:1 on it, day and night) over its box,
 *   at its own radius, with no edge, drawn in the pins' layer under the
 *   discs, so it scrolls with the page and takes no press. Looked at, it
 *   fades off over `--dur-fade`.
 * - **The stops.** Every unseen change and every pin with an unread answer,
 *   in page order; a pin and the changed element it stands in, on or round
 *   are one stop. A change that left the page has no box: it stands last,
 *   by its label. Told to the host (`cawco:stops`), whose tag steps them.
 * - **A step** (`cawco:step`) brings its stop out from under the host's
 *   chrome and outlines it as chosen (The One Target Rule: the 1px line),
 *   and the person has looked at it. A pin's card the host opens itself.
 * - **A press** in Interact on a changed element is a look at it.
 */
import {
  type ChangeItem,
  changesOf,
  seeChanges,
  seenOf,
  unseenChanges,
} from "@cawco/core/changes";
import { type Pin, pinUnread } from "@cawco/core/comments";
import { pinName } from "@cawco/core/pin-name";
import type { Map as YMap } from "yjs";
import { artifact } from "./artifact";
import { rectOf } from "./frames";
import { fitToPage } from "./ink";
import type { Pins } from "./pins";
import type { InkChrome } from "./radial";

const SVG = "http://www.w3.org/2000/svg";

/** One stop of the host's tag: a change, a pin's answer, or both at once. */
export interface Stop {
  /** A change's anchor, when the stop is one. */
  anchor?: string;
  key: string;
  label: string;
  /** The pin whose answer it holds, when it holds one: the host opens its card. */
  pin?: string;
  /** It left the page with this revision. */
  removed?: true;
}

export interface ChangesDeps {
  /** The overlay's 1px chosen line round `el`, whatever the mode; none takes it away. */
  choose: (el: Element | null) => void;
  chrome: InkChrome;
  pins: () => Pins;
  post: (type: string, payload?: object) => void;
}

export interface Changes {
  /** Decision card `id` brought where the person sees it and outlined as chosen for one `--dur-fade` once it stands there (a chip's press). */
  card: (id: string) => void;
  /** The washes and the stops again, as the doc and the page stand now. */
  draw: () => void;
  /** A press on the page in Interact: a changed element it lands in is looked at. */
  pressed: (target: Element) => void;
  /** The host's step onto stop `key` (null: the step is over). */
  step: (key: string | null) => void;
}

/** `selector`'s element in the page; null when it names none, or is no selector. */
const find = (selector: string): Element | null => {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
};

/** A stop as it is placed: its element and its point in the page (a canvas's: in its scene), for page order. */
type Placed = Stop & {
  box: { x: number; y: number } | null;
  el: Element | null;
};

/** Where a stop stands in page order: its box's top, then its left; past every box when it has none. */
const orderOf = (box: { x: number; y: number } | null): [number, number] =>
  box ? [box.y, box.x] : [Number.POSITIVE_INFINITY, 0];

export function startChanges(deps: ChangesDeps): Changes {
  const { chrome } = deps;
  const group = document.createElementNS(SVG, "g");
  group.setAttribute("data-cawco-changes", "");
  /** Each wash drawn, by its change's anchor. */
  const washes = new Map<string, SVGRectElement>();
  /** The stops as last told, and their elements. */
  let stops: (Stop & { el: Element | null })[] = [];
  let told = "";
  /** The step's element, outlined as chosen while it lasts. */
  let chosen: Element | null = null;
  /** On a canvas, the step's element by id: the canvas host draws its line. */
  let chosenOnCanvas: string | null = null;

  const meta = () => artifact.doc().getMap("meta");
  const held = () => artifact.keeps() && artifact.kind() !== null;
  const onCanvas = () => artifact.kind() === "canvas";
  const onPage = () => held() && !onCanvas();

  /** The unseen changes of the doc's latest revision: a page's, or a canvas's elements on a canvas. */
  const unseen = (): ChangeItem[] =>
    held()
      ? unseenChanges(
          changesOf(meta().get("changes")),
          seenOf(meta().get("seen")),
          (meta().get("sentAt") as string | undefined) ?? null
        ).filter((item) => (item.kind === "canvas") === onCanvas())
      : [];

  /** Each element of a canvas's scene by id: where it stands, for the stops' order. */
  const sceneAt = () =>
    new Map(
      (
        artifact.doc().getArray("elements").toJSON() as {
          el?: { id?: string; x?: number; y?: number };
        }[]
      ).flatMap(({ el }) =>
        el?.id ? [[el.id, { x: el.x ?? 0, y: el.y ?? 0 }] as const] : []
      )
    );

  /**
   * A canvas's unseen changes as stops in the scene's order; the canvas
   * host (canvas-host changes.tsx) draws their washes and the chosen line.
   */
  const canvasStops = (items: ChangeItem[]): Placed[] => {
    const scene = sceneAt();
    const ids = items.flatMap((item) => (item.removed ? [] : [item.anchor]));
    dispatchEvent(
      new CustomEvent("cawco:canvas-changes", {
        detail: { ids, chosen: chosenOnCanvas },
      })
    );
    const revision = changesOf(meta().get("changes"))?.revision ?? 0;
    return items.map((item) => ({
      key: `change:${revision}:${item.anchor}`,
      anchor: item.anchor,
      label: item.label,
      ...(item.removed ? { removed: true as const } : {}),
      el: null,
      box: item.removed ? null : (scene.get(item.anchor) ?? null),
    }));
  };

  /** `el`'s box in the page, px, and its own top-left radius. */
  const boxOf = (el: Element) => {
    const r = rectOf(el);
    const own = getComputedStyle(el).borderTopLeftRadius;
    const radius = Number.parseFloat(own) || 0;
    return {
      x: r.left + scrollX,
      y: r.top + scrollY,
      w: r.width,
      h: r.height,
      r: own.endsWith("%")
        ? (Math.min(r.width, r.height) * radius) / 100
        : Math.min(radius, r.width / 2, r.height / 2),
    };
  };

  /** A wash looked at fades off over `--dur-fade`, then goes. */
  const fadeOff = (wash: SVGRectElement) => {
    const fade = wash.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: chrome.ms("--dur-fade"),
      easing: chrome.token("--ease-out", "transition-timing-function"),
      fill: "forwards",
    });
    fade.finished.then(
      () => wash.remove(),
      () => wash.remove()
    );
  };

  /** Change `item`'s wash over its element, drawn or moved to where it stands now; its element, or null when it has no box. */
  const washOver = (item: ChangeItem, fill: string) => {
    const el = item.removed ? null : find(item.anchor);
    const box = el ? boxOf(el) : null;
    if (!(el && box && box.w > 0 && box.h > 0)) {
      return { el, box: null };
    }
    const wash =
      washes.get(item.anchor) ?? document.createElementNS(SVG, "rect");
    wash.setAttribute("data-change", item.anchor);
    wash.setAttribute("x", box.x.toFixed(1));
    wash.setAttribute("y", box.y.toFixed(1));
    wash.setAttribute("width", box.w.toFixed(1));
    wash.setAttribute("height", box.h.toFixed(1));
    wash.setAttribute("rx", box.r.toFixed(1));
    wash.setAttribute("fill", fill);
    wash.style.pointerEvents = "none";
    if (!washes.has(item.anchor)) {
      washes.set(item.anchor, wash);
      group.append(wash);
    }
    return { el, box };
  };

  /** The unseen changes washed and placed as stops; every wash of a change looked at since fades off. */
  const washAll = (): Placed[] => {
    const items = unseen();
    if (onCanvas()) {
      return canvasStops(items);
    }
    // A change's stop is its revision's: the next revision's is another stop, which starts the host's round anew.
    const revision = changesOf(meta().get("changes"))?.revision ?? 0;
    const fill = items.length > 0 ? chrome.token("--change-wash") : "";
    const placed = items.map((item): Placed => {
      const { el, box } = washOver(item, fill);
      return {
        key: `change:${revision}:${item.anchor}`,
        anchor: item.anchor,
        label: item.label,
        ...(item.removed ? { removed: true as const } : {}),
        el,
        box,
      };
    });
    const standing = new Set(
      placed.flatMap((stop) => (stop.box && stop.anchor ? [stop.anchor] : []))
    );
    for (const [anchor, wash] of washes) {
      if (!standing.has(anchor)) {
        washes.delete(anchor);
        fadeOff(wash);
      }
    }
    return placed;
  };

  /** Each pin with an unread answer joins the change it stands in, on or round, as one stop, or is a stop of its own. */
  const joinPins = (placed: Placed[]) => {
    // A canvas's pins have no card in its panel to open: its stops are its changes.
    if (!onPage()) {
      return;
    }
    const sentAt = (meta().get("sentAt") as string | undefined) ?? null;
    const unread = onPage()
      ? [...(artifact.doc().getMap("pins") as YMap<Pin>).values()]
          .filter((pin) => pinUnread(pin, sentAt))
          .sort((a, b) => a.number - b.number)
      : [];
    for (const pin of unread) {
      const where = deps.pins().placedAt(pin.id);
      const pinned = where?.el ?? null;
      const joined = pinned
        ? placed.find(
            (stop) =>
              !stop.pin &&
              stop.el &&
              (stop.el.contains(pinned) || pinned.contains(stop.el))
          )
        : undefined;
      if (joined) {
        joined.pin = pin.id;
      } else {
        placed.push({
          key: `pin:${pin.id}`,
          pin: pin.id,
          label: pinName(pin),
          el: pinned,
          box: where ? { x: where.at[0], y: where.at[1] } : null,
        });
      }
    }
  };

  const draw = () => {
    const { layer } = deps.pins();
    if (group.parentNode !== layer) {
      layer.prepend(group);
    }
    const placed = washAll();
    fitToPage(layer, layer.childElementCount > 1 || washes.size > 0);
    joinPins(placed);
    placed.sort((a, b) => {
      const [ay, ax] = orderOf(a.box);
      const [by, bx] = orderOf(b.box);
      return ay - by || ax - bx;
    });
    stops = placed.map(({ box: _box, ...stop }) => stop);
    const said = JSON.stringify(stops.map(({ el: _el, ...stop }) => stop));
    if (said !== told) {
      told = said;
      deps.post("cawco:stops", { stops: JSON.parse(said) });
    }
    if (chosen && !chosen.isConnected) {
      chosen = null;
      deps.choose(null);
    }
  };

  /** A step onto a canvas's stop: the canvas host scrolls to it and draws its line (canvas-host changes.tsx), and the person has looked. */
  const stepOnCanvas = (stop: Stop | undefined) => {
    chosenOnCanvas = stop && !stop.removed ? (stop.anchor ?? null) : null;
    draw();
    if (chosenOnCanvas) {
      dispatchEvent(
        new CustomEvent("cawco:canvas-step", {
          detail: { chosen: chosenOnCanvas },
        })
      );
    }
    if (stop?.anchor) {
      seeChanges(artifact.doc(), [stop.anchor]);
    }
  };

  // The canvas host mounted after the last word: it is said again.
  addEventListener("cawco:canvas-ask", () => {
    told = "";
    draw();
  });
  // A changed element the person selected on a canvas is their look at it.
  addEventListener("cawco:canvas-looked", (event) => {
    const ids = (event as CustomEvent<{ ids?: unknown } | null>).detail?.ids;
    if (Array.isArray(ids)) {
      seeChanges(
        artifact.doc(),
        ids.filter((id): id is string => typeof id === "string")
      );
    }
  });

  let frame = 0;
  addEventListener(
    "scroll",
    () => {
      if (chosen && !frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          deps.choose(chosen);
        });
      }
    },
    { capture: true, passive: true }
  );

  /** How long a card's scroll may run before its outline's time starts anyway, ms. Our call: past a smooth scroll's length. */
  const SETTLE_MOST_MS = 1000;

  return {
    draw,
    card: (id) => {
      const el = find(`#decision-${CSS.escape(id)}`);
      if (!el) {
        return;
      }
      chosen = el;
      deps.choose(el);
      deps.pins().revealElement(el);
      let done = false;
      const hold = () => {
        if (done) {
          return;
        }
        done = true;
        removeEventListener("scrollend", hold, true);
        setTimeout(() => {
          if (chosen === el) {
            chosen = null;
            deps.choose(null);
          }
        }, chrome.ms("--dur-fade"));
      };
      addEventListener("scrollend", hold, { capture: true });
      setTimeout(hold, SETTLE_MOST_MS);
    },
    step: (key) => {
      const stop = key ? stops.find((one) => one.key === key) : undefined;
      if (onCanvas()) {
        stepOnCanvas(stop);
        return;
      }
      const el = stop?.anchor && !stop.removed ? find(stop.anchor) : null;
      chosen = stop && !stop.pin ? el : null;
      if (el && !stop?.pin) {
        deps.pins().revealElement(el);
      }
      deps.choose(chosen);
      if (stop?.anchor) {
        seeChanges(artifact.doc(), [stop.anchor]);
      }
    },
    pressed: (target) => {
      const looked = stops.flatMap((stop) =>
        stop.anchor && stop.el?.contains(target) ? [stop.anchor] : []
      );
      if (looked.length > 0) {
        seeChanges(artifact.doc(), looked);
      }
    },
  };
}
