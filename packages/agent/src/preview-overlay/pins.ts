/// <reference lib="dom" />

/**
 * The person's pins on a page (Projects spec §5.7, §5.10; core comments.ts;
 * DESIGN.md, Artifact panel, canvas and ink). A pin is tsk-3's numbered pin,
 * a 20px coral disc (`action-solid`) with its number in `on-action`, drawn in
 * an `<svg>` in the page's own document like the ink, so it scrolls with the
 * page. A comment's pin stands where the person tapped its element in Comment
 * mode; an ink's pin at its group's top-right. A resolved pin is drawn at
 * 40%. Resting on a pin, or the host focusing it (J and K), outlines its
 * element; a press on it opens its card in the host.
 *
 * A pin on an element inside a same-origin frame (frames.ts) is drawn here
 * too, in the top document, at the element's box mapped through its frames;
 * while its frame has scrolled the point out of view, its disc is not drawn.
 *
 * Every pin is placed again from its anchor whenever the page changes (core
 * `findAnchor`: source file:line, then selector, then text). A page's pin
 * whose element none of them finds goes to the moved tray (`movedAt`) until
 * the person places it again.
 *
 * The host (the dashboard's pane) draws the card and the list; this tells it
 * where the card's pin stands as the page scrolls, and draws the pictures a
 * send and a card's thumbnail carry.
 */
import {
  changedAnchor,
  type PageAnchor,
  type Pin,
  type PinnedElement,
  pinSection,
} from "@cawco/core/comments";
import type { InkGroup } from "@cawco/core/ink";
import type { Map as YMap } from "yjs";
import { artifact } from "./artifact";
import { clipOf, framesOf, rectOf } from "./frames";
import { newId } from "./id";
import { fitToPage } from "./ink";
import type { InkChrome } from "./radial";

const SVG = "http://www.w3.org/2000/svg";

/** A pin's disc: 20px. */
const PIN_R = 10;
/** A resolved pin's opacity: DESIGN.md's 40%. */
const RESOLVED_OPACITY = "0.4";
/** The pixels a picture may hold, so its PNG stays inside a send's bound. Our call. */
const PICTURE_AREA = 1_200_000;
/** A card's thumbnail: 56px, drawn at 2× for a dense screen. */
const THUMB_SIDE = 112;
/** Room round an ink pin's crop, px. Our call. */
const CROP_PAD = 24;
const PNG_PREFIX = /^data:image\/png;base64,/;

interface Box {
  h: number;
  w: number;
  x: number;
  y: number;
}

export interface PinsDeps {
  /** What a page's mark stands on, read from `el` as it is now. */
  anchorOf: (el: Element) => PageAnchor;
  /** `el` drawn as a picture at `scale`; the whole page when `el` is the root. */
  capture: (
    el: Element,
    scale: number
  ) => Promise<{ png: string | null; error?: string }>;
  chrome: InkChrome;
  /** The overlay's description of `el`, its markup left out. */
  describe: (el: Element) => PinnedElement;
  /** A placed ink group's box in the page, px; null when it is not on the page. */
  groupBox: (id: string) => Box | null;
  /** Where a page's anchor stands now, and by what; null when nothing on the page matches it. */
  locate: (
    anchor: PageAnchor
  ) => { by: "source" | "selector" | "text"; el: Element } | null;
  /** The overlay's highlight round `el` (its box in the viewport), or none. */
  outline: (el: Element | null) => void;
  post: (type: string, payload?: object) => void;
  /** Whether an anchor's frames lead to one still loading: not found yet, and not gone. */
  waiting: (anchor: PageAnchor) => boolean;
}

export interface Pins {
  /** The person tapped `el` at the viewport's `x`, `y` in Comment mode: a comment pin there, and its card opened. */
  commentAt: (el: Element, x: number, y: number) => void;
  /** Pins drawn again where their elements stand now. */
  draw: () => void;
  /** The pin the host focused (J, K, its row), outlined and scrolled into view; or none. */
  focus: (id: string | null, scroll: boolean) => void;
  layer: SVGSVGElement;
  /** Unsent pins as the send's sections (core `pinSection`), for the composer's Ink chip. */
  markdown: () => string;
  /** The page with the person's ink on it, as a send carries it. */
  pagePicture: () => Promise<string | null>;
  /** A pin's picture: its element, or its ink with the page under it; small for a card's thumbnail. */
  picture: (id: string, thumb: boolean) => Promise<string | null>;
  /** A pin on an ink group (Annotate, Comment); a comment's card opened. */
  pinInk: (
    group: InkGroup,
    kind: Pin["kind"],
    elements: PinnedElement[] | string[]
  ) => void;
  /** Pin `id` placed again on `el` at the viewport's `x`, `y`: out of the moved tray. */
  placeAgain: (id: string, el: Element, x: number, y: number) => void;
  /** The pin whose card the host shows, whose place it hears as the page scrolls; or none. */
  track: (id: string | null) => void;
}

/** `el`'s box in the top page, px, through any frames it stands in. */
const pageBox = (el: Element): Box => {
  const r = rectOf(el);
  return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
};

/** Whether the page's point `at` lies where `el`'s frames show it; always, for the top document's own. */
const showsAt = (el: Element | null, at: [number, number]): boolean => {
  const clip = el ? clipOf(el) : null;
  if (!clip) {
    return true;
  }
  const x = at[0] - scrollX;
  const y = at[1] - scrollY;
  return x >= clip.left && x <= clip.right && y >= clip.top && y <= clip.bottom;
};

/** Where a pin stands: its disc's centre in the page, its element, and whether its frames show that point now. */
interface Standing {
  at: [number, number];
  el: Element | null;
  shown: boolean;
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;

/** The largest scale at or under `most` that keeps a `w` × `h` box inside {@link PICTURE_AREA}. */
const fitScale = (w: number, h: number, most: number) =>
  Math.min(most, Math.sqrt(PICTURE_AREA / Math.max(1, w * h)));

export function startPins(deps: PinsDeps): Pins {
  const { chrome } = deps;
  const layer = document.createElementNS(SVG, "svg");
  layer.setAttribute("data-cawco-pins", "");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText =
    "position:absolute;left:0;top:0;z-index:2147483646;overflow:visible;pointer-events:none;margin:0;padding:0;border:0";
  document.documentElement.append(layer);

  const pinsMap = () => artifact.doc().getMap("pins") as YMap<Pin>;
  const onPage = () => artifact.kind() !== "canvas";
  /** A pin whose element is gone may be moved aside only on a page the agent wrote, once it has laid out. */
  const settled = () =>
    artifact.kind() === "page" && document.readyState !== "loading";

  /** Each placed pin: where it stands; a disc is drawn for it while its frames show it. */
  const placed = new Map<string, Standing>();
  let focused: string | null = null;
  let tracked: string | null = null;

  const anchoredEl = (pin: Pin): Element | null =>
    "selector" in pin.anchor ? (deps.locate(pin.anchor)?.el ?? null) : null;

  /** Where pin `pin` stands in the page now, or null when it is not on it. */
  const standing = (pin: Pin): Standing | null => {
    if (pin.ink) {
      const box = deps.groupBox(pin.ink);
      return box
        ? { at: [box.x + box.w, box.y], el: anchoredEl(pin), shown: true }
        : null;
    }
    if (!("selector" in pin.anchor)) {
      return null;
    }
    const found = deps.locate(pin.anchor);
    if (!found) {
      return null;
    }
    const box = pageBox(found.el);
    const point = pin.point ?? { x: 1, y: 0 };
    const at: [number, number] = [
      box.x + point.x * box.w,
      box.y + point.y * box.h,
    ];
    return { at, el: found.el, shown: showsAt(found.el, at) };
  };

  /**
   * The anchors whose element is found under another selector or text now
   * (a revision moved or reworded it), written back so the next look finds
   * it by its selector. One that still reads as it was is left alone: a
   * write here draws the pins again.
   */
  const reanchor = (pins: Pin[]) => {
    const moves: Pin[] = [];
    for (const pin of pins) {
      if (!("selector" in pin.anchor) || pin.movedAt) {
        continue;
      }
      const found = deps.locate(pin.anchor);
      const now = found && deps.anchorOf(found.el);
      if (now && changedAnchor(pin.anchor, now)) {
        moves.push({ ...pin, anchor: now });
      }
    }
    return moves;
  };

  /** tsk-3's numbered pin at `where`: a 20px coral disc with its number, at 40% once resolved. */
  const disc = (
    pin: Pin,
    where: Standing,
    paint: { fill: string; font: string; ink: string }
  ) => {
    const g = document.createElementNS(SVG, "g");
    g.setAttribute("data-pin", String(pin.number));
    g.setAttribute("data-pin-id", pin.id);
    g.setAttribute(
      "transform",
      `translate(${where.at[0].toFixed(1)} ${where.at[1].toFixed(1)})`
    );
    g.style.pointerEvents = "auto";
    g.style.cursor = "pointer";
    if (pin.resolvedAt) {
      g.setAttribute("opacity", RESOLVED_OPACITY);
    }
    const circle = document.createElementNS(SVG, "circle");
    circle.setAttribute("r", String(PIN_R));
    circle.setAttribute("fill", paint.fill);
    const number = document.createElementNS(SVG, "text");
    number.setAttribute("text-anchor", "middle");
    number.setAttribute("dominant-baseline", "central");
    number.setAttribute("fill", paint.ink);
    number.style.font = paint.font;
    number.style.userSelect = "none";
    number.textContent = String(pin.number);
    g.append(circle, number);
    g.addEventListener("pointerenter", () => deps.outline(where.el));
    g.addEventListener("pointerleave", () =>
      deps.outline(focused ? (placed.get(focused)?.el ?? null) : null)
    );
    g.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      deps.post("cawco:pin-open", { id: pin.id });
    });
    return g;
  };

  /** Writes the pins found again by their source or text, and moves aside those no anchor finds. */
  const settle = (moves: Pin[], gone: Pin[]) => {
    if (moves.length === 0 && gone.length === 0) {
      return;
    }
    const pins = pinsMap();
    const at = new Date().toISOString();
    artifact.doc().transact(() => {
      for (const pin of moves) {
        pins.set(pin.id, pin);
      }
      for (const pin of gone) {
        pins.set(pin.id, { ...pin, movedAt: at });
      }
    });
  };

  /** Whether a pin no anchor finds is gone, not waiting on a frame still loading. */
  const goneFrom = (pin: Pin) =>
    !("selector" in pin.anchor && deps.waiting(pin.anchor));

  /** Places each pin on the page, drawing a disc for each its frames show; answers those that are gone. */
  const placeAll = (all: Pin[]): Pin[] => {
    const gone: Pin[] = [];
    const paint = {
      fill: chrome.token("--action-solid"),
      ink: chrome.token("--on-action"),
      font: chrome.token("--type-label", "font"),
    };
    for (const pin of all.filter((one) => !one.movedAt)) {
      const where = standing(pin);
      if (!where) {
        if (goneFrom(pin)) {
          gone.push(pin);
        }
        continue;
      }
      placed.set(pin.id, where);
      // A pin in a frame scrolled away from it stands hidden until the frame shows it again.
      if (where.shown) {
        layer.append(disc(pin, where, paint));
      }
    }
    return gone;
  };

  function draw() {
    for (const node of [...layer.children]) {
      node.remove();
    }
    placed.clear();
    if (!(onPage() && artifact.keeps())) {
      return;
    }
    fitToPage(layer);
    const all = [...pinsMap().values()].sort((a, b) => a.number - b.number);
    const gone = placeAll(all);
    if (settled()) {
      settle(reanchor(all), gone);
    }
    if (focused) {
      deps.outline(placed.get(focused)?.el ?? null);
    }
    tell();
  }

  /** The tracked pin's disc in the viewport, for the host's card. */
  const tell = () => {
    if (!tracked) {
      return;
    }
    const where = placed.get(tracked);
    const at = where?.shown ? where.at : undefined;
    deps.post("cawco:pin-at", {
      id: tracked,
      ...(at ? { x: at[0] - scrollX, y: at[1] - scrollY, r: PIN_R } : {}),
    });
  };
  let frame = 0;
  const onScroll = () => {
    if (!frame) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        tell();
        if (focused) {
          deps.outline(placed.get(focused)?.el ?? null);
        }
      });
    }
  };
  addEventListener("scroll", onScroll, { capture: true, passive: true });

  const nextNumber = () =>
    Math.max(0, ...[...pinsMap().values()].map((pin) => pin.number)) + 1;

  const write = (pin: Pin) => {
    const doc = artifact.doc();
    doc.transact(() => pinsMap().set(pin.id, pin));
  };

  const pointOn = (el: Element, x: number, y: number) => {
    const box = pageBox(el);
    return {
      x: round(Math.min(1, Math.max(0, (x + scrollX - box.x) / box.w))),
      y: round(Math.min(1, Math.max(0, (y + scrollY - box.y) / box.h))),
    };
  };

  const md = () => {
    const doc = artifact.doc();
    const groups = {
      ...(doc.getMap("moved").toJSON() as Record<string, InkGroup>),
      ...(doc.getMap("ink").toJSON() as Record<string, InkGroup>),
    };
    return [...pinsMap().values()]
      .filter((pin) => !pin.sentAt)
      .sort((a, b) => a.number - b.number)
      .map((pin) =>
        pinSection(pin, {
          url: location.href,
          ...(pin.ink && groups[pin.ink] ? { ink: groups[pin.ink].page } : {}),
        })
      )
      .join("\n\n");
  };

  /** The page cropped to `box` (the page's px), ink and all. */
  const crop = async (box: Box, thumb: boolean): Promise<string | null> => {
    const side = Math.max(box.w, box.h);
    const scale = thumb
      ? Math.min(2, THUMB_SIDE / side)
      : fitScale(box.w, box.h, Math.min(2, devicePixelRatio));
    const root = document.documentElement;
    const whole = await deps.capture(root, scale);
    if (!whole.png) {
      return null;
    }
    const image = new Image();
    image.src = `data:image/png;base64,${whole.png}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(box.w * scale));
    canvas.height = Math.max(1, Math.round(box.h * scale));
    canvas
      .getContext("2d")
      ?.drawImage(
        image,
        box.x * scale,
        box.y * scale,
        box.w * scale,
        box.h * scale,
        0,
        0,
        canvas.width,
        canvas.height
      );
    return canvas.toDataURL("image/png").replace(PNG_PREFIX, "");
  };

  return {
    layer,
    draw,
    markdown: md,
    commentAt: (el, x, y) => {
      const pin: Pin = {
        id: newId(),
        number: nextNumber(),
        kind: "comment",
        anchor: deps.anchorOf(el),
        at: new Date().toISOString(),
        by: "person",
        elements: [deps.describe(el)],
        point: pointOn(el, x, y),
        thread: [],
      };
      write(pin);
      deps.post("cawco:pin-open", { id: pin.id, made: true });
    },
    pinInk: (group, kind, elements) => {
      const pin: Pin = {
        id: newId(),
        number: nextNumber(),
        kind,
        anchor: group.anchor,
        at: new Date().toISOString(),
        by: "person",
        elements,
        ink: group.id,
        thread: [],
      };
      write(pin);
      if (kind === "comment") {
        deps.post("cawco:pin-open", { id: pin.id, made: true });
      }
    },
    placeAgain: (id, el, x, y) => {
      const pin = pinsMap().get(id);
      if (!pin) {
        return;
      }
      const { movedAt: _moved, ink: _ink, ...rest } = pin;
      write({
        ...rest,
        anchor: deps.anchorOf(el),
        elements: [deps.describe(el)],
        point: pointOn(el, x, y),
      });
      deps.post("cawco:pin-open", { id });
    },
    focus: (id, scroll) => {
      focused = id;
      const el: Element | null = id ? (placed.get(id)?.el ?? null) : null;
      if (scroll && id) {
        const where = placed.get(id);
        const at = where?.at;
        // A pin already in view stays where the person is looking: the page moves only to bring one in.
        const inView =
          !!where?.shown &&
          !!at &&
          at[1] - scrollY >= PIN_R &&
          at[1] - scrollY <= innerHeight - PIN_R &&
          at[0] - scrollX >= 0 &&
          at[0] - scrollX <= innerWidth;
        const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth";
        if (at && !inView && el && framesOf(el).length > 0) {
          // Inside a frame: the frame scrolls to it, and every frame and page round it.
          el.scrollIntoView({ block: "center", inline: "nearest", behavior });
        } else if (at && !inView) {
          scrollTo({ top: Math.max(0, at[1] - innerHeight / 3), behavior });
        }
      }
      deps.outline(el);
    },
    track: (id) => {
      tracked = id;
      tell();
    },
    picture: async (id, thumb) => {
      const pin = pinsMap().get(id);
      const where = placed.get(id);
      if (!(pin && where)) {
        return null;
      }
      if (pin.ink) {
        const box = deps.groupBox(pin.ink);
        return box
          ? await crop(
              {
                x: Math.max(0, box.x - CROP_PAD),
                y: Math.max(0, box.y - CROP_PAD),
                w: box.w + 2 * CROP_PAD,
                h: box.h + 2 * CROP_PAD,
              },
              thumb
            )
          : null;
      }
      if (!where.el) {
        return null;
      }
      const box = pageBox(where.el);
      const scale = thumb
        ? Math.min(2, THUMB_SIDE / Math.max(1, box.w, box.h))
        : fitScale(box.w, box.h, Math.min(2, devicePixelRatio));
      return (await deps.capture(where.el, scale)).png;
    },
    pagePicture: async () => {
      const root = document.documentElement;
      const w = Math.max(root.scrollWidth, innerWidth);
      const h = Math.max(root.scrollHeight, innerHeight);
      return (await deps.capture(root, fitScale(w, h, 1))).png;
    },
  };
}
