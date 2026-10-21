/**
 * The person's pins on a page (Projects spec §5.7, §5.10; core comments.ts;
 * DESIGN.md, Artifact panel, canvas and ink). A pin is tsk-3's numbered pin,
 * a 20px coral disc (`action-solid`) with its number in `on-action`, drawn in
 * an `<svg>` in the page's own document like the ink, so it scrolls with the
 * page. A comment's pin stands where the person tapped its element in Comment
 * mode; an ink's pin at its group's top-right. A resolved pin leaves the
 * page (Figma: resolving "will hide the comment from both the right sidebar
 * and the canvas"), drawn again, at 40%, only while the host has its card
 * open. Resting on a pin chooses its element (the overlay's one target) and
 * peeks its first line beside it; the host focusing it (J and K) chooses it; a press on it
 * opens its card in the host. ⇧C hides every pin, and shows them again.
 *
 * A pin on an element inside a same-origin frame (frames.ts) is drawn here
 * too, in the top document, at the element's box mapped through its frames;
 * so is one inside a scroll container of the page's own (a transcript),
 * drawn again as it scrolls. While a frame or a container has scrolled the
 * point out of view, its disc is not drawn.
 *
 * Every pin is placed again from its anchor whenever the page changes (core
 * `findAnchor`: source file:line, then selector, then text). A page's pin
 * whose element none of them finds goes to the moved tray (`movedAt`) until
 * the person places it again. A pin on the page as a whole stands on its
 * body (core `wholePage`), whatever the page says now, and never goes there;
 * nor does one kept on a page-sized container (core `findAnchor`'s `page`),
 * which stands on the body again, out of the tray if it was put there.
 *
 * The host (the dashboard's pane) draws the card and the list; this tells it
 * where the card's pin stands as the page scrolls, and where each pin's
 * picture is cropped (`cropOf`): its ink's box, or its element's round the
 * point it was made at, with room round either.
 */
import {
  type AnchorFound,
  changedAnchor,
  type PageAnchor,
  type Pin,
  type PinnedElement,
  pinUnread,
} from "@cawco/core/comments";
import type { InkGroup } from "@cawco/core/ink";
import type { Map as YMap } from "yjs";
import { artifact } from "./artifact";
import { clipOf, rectOf } from "./frames";
import { newId } from "./id";
import { fitToPage } from "./ink";
import { motionOk } from "./motion";
import type { InkChrome } from "./radial";
import {
  bandsAt,
  bringInto,
  discMeets,
  inBands,
  scrollersOf,
  scrollMoves,
} from "./scrollers";

const SVG = "http://www.w3.org/2000/svg";

/** A pin's disc: 20px. */
const PIN_R = 10;
/** A resolved pin's opacity: DESIGN.md's 40%. */
const RESOLVED_OPACITY = "0.4";
/** How many loops the unread dot echoes before it stands still: DESIGN.md's status dot, as the working indicator. */
const ECHOES = 3;
/** The echo's first opacity: DESIGN.md's working indicator, "fades from 45%". */
const ECHO_FROM = 0.45;
/** Room round a mark's crop, px. Our call. */
export const CROP_PAD = 24;
/** How far a pin's crop reaches from the point it was made at, each way, px: a big element is cropped round the point. Our call. */
const PIN_REACH = { x: 960, y: 640 } as const;

export interface Box {
  h: number;
  w: number;
  x: number;
  y: number;
}

export interface PinsDeps {
  /** What a page's mark stands on, read from `el` as it is now. */
  anchorOf: (el: Element) => PageAnchor;
  chrome: InkChrome;
  /** The overlay's description of `el`, its markup left out. */
  describe: (el: Element) => PinnedElement;
  /** The pins were drawn again: what stands with them (the change marks, changes.ts) is drawn again too. */
  drawn: () => void;
  /** A placed ink group's box in the page, px; null when it is not on the page. */
  groupBox: (id: string) => Box | null;
  /** Where a page's anchor stands now, and by what; null when nothing on the page matches it. */
  locate: (anchor: PageAnchor) => AnchorFound<Element> | null;
  /**
   * Pin `el`'s element chosen in the overlay (The One Target Rule), or none;
   * `lead`, whether it leads the pointer's in Comment mode (a disc rested
   * on, a pin stepped to), left out to keep the lead as it was.
   */
  outline: (el: Element | null, lead?: boolean) => void;
  /** Pin `pin`'s first line beside its disc, at the viewport's `x`, `y`, radius `r`; none hides it. */
  peek: (pin: Pin | null, x?: number, y?: number, r?: number) => void;
  post: (type: string, payload?: object) => void;
  /** Whether an anchor's frames lead to one still loading: not found yet, and not gone. */
  waiting: (anchor: PageAnchor) => boolean;
}

export interface Pins {
  /** The person tapped `el` at the viewport's `x`, `y` in Comment mode: a comment pin there, and its card opened; its id. */
  commentAt: (el: Element, x: number, y: number) => string;
  /** What of the page's viewport the host's chrome covers now (`cawco:covered`, the viewport's px); none when nothing does. */
  cover: (boxes: Box[]) => void;
  /**
   * Where pin `id`'s picture is cropped, the page's px, and what it shows
   * (its look: a new one is drawn again); null when it is not on the page.
   */
  cropOf: (id: string) => { box: Box; look: string } | null;
  /** Pins drawn again where their elements stand now. */
  draw: () => void;
  /** The pin the host focused (J, K, its row), outlined and brought into view out from under the host's chrome; or none. */
  focus: (id: string | null, scroll: boolean) => void;
  /** After a re-publish or an HMR update: the open card's pin, if it now stands under the host's chrome, brought out again. */
  keepClear: () => void;
  layer: SVGSVGElement;
  /** Pin `id`'s card opened in the host (`cawco:pin-open`), the pin as this page holds it with it; `made`, for one just made. */
  open: (id: string, made?: boolean) => void;
  /** A pin on an ink group (Annotate, Comment); a comment's card opened. */
  pinInk: (
    group: InkGroup,
    kind: Pin["kind"],
    elements: PinnedElement[] | string[]
  ) => void;
  /** Pin `id` placed again on `el` at the viewport's `x`, `y`: out of the moved tray. */
  placeAgain: (id: string, el: Element, x: number, y: number) => void;
  /** Where pin `id` stands as last drawn: its element and its disc's centre in the page; null when it is not on the page. */
  placedAt: (id: string) => { at: [number, number]; el: Element | null } | null;
  /** `el` brought where the person sees it, out from under the host's chrome, as a pin's card brings its pin. */
  revealElement: (el: Element) => void;
  /** Every pin shown on the page, or hidden (⇧C). */
  show: (shown: boolean) => void;
  /** The pin whose card the host shows, whose place it hears as the page scrolls; or none. */
  track: (id: string | null) => void;
}

/** `el`'s box in the top page, px, through any frames it stands in. */
const pageBox = (el: Element): Box => {
  const r = rectOf(el);
  return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
};

/** Whether the page's point `at` lies where `el`'s frames and scroll containers show it; always, where nothing clips it. */
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
  /** What the pin stands on, in the page's coordinates: its element's box, or its ink's. */
  box: Box;
  el: Element | null;
  shown: boolean;
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;

/** `box` with {@link CROP_PAD} round it. */
export const padded = (box: Box): Box => ({
  x: box.x - CROP_PAD,
  y: box.y - CROP_PAD,
  w: box.w + 2 * CROP_PAD,
  h: box.h + 2 * CROP_PAD,
});

export function startPins(deps: PinsDeps): Pins {
  const { chrome } = deps;
  const layer = document.createElementNS(SVG, "svg");
  layer.setAttribute("data-cawco-pins", "");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText =
    "position:absolute;left:0;top:0;z-index:2147483646;overflow:visible;pointer-events:none;margin:0;padding:0;border:0";
  document.documentElement.append(layer);

  const pinsMap = () => artifact.doc().getMap("pins") as YMap<Pin>;
  /** The person's last Send (the doc's `meta.sentAt`): it clears every unread mark before it. */
  const sentAt = () =>
    (artifact.doc().getMap("meta").get("sentAt") as string | undefined) ?? null;
  /**
   * Pin `id`'s card opened in the host, carrying the pin as this page holds
   * it: a host whose own doc doesn't hold it yet (it reaches the host's only
   * through the hub, and the page's link is down) draws the card from that,
   * and writes its words through the page (`cawco:reply`).
   */
  const open = (id: string, made = false) => {
    const pin = pinsMap().get(id);
    deps.post("cawco:pin-open", {
      id,
      ...(made ? { made: true } : {}),
      ...(pin ? { pin } : {}),
    });
  };
  const onPage = () => artifact.kind() !== "canvas";
  /**
   * A pin whose element is gone may be moved aside, and an anchor that reads
   * otherwise now is written again, only on a page the agent wrote or a sheet
   * of its components (re-read after each HMR update), once it has laid out.
   */
  const settled = () =>
    (artifact.kind() === "page" || artifact.kind() === "component") &&
    document.readyState !== "loading" &&
    !(hostDrawing && document.getElementById("cawco-program"));
  /**
   * A decision page draws itself from its program (its host, `#cawco-program`)
   * after the document has loaded, and says so with its first `cawco:hmr`:
   * until then its cards are not on the page, and a pin on one is not gone.
   */
  let hostDrawing = true;
  addEventListener("cawco:hmr", () => {
    hostDrawing = false;
  });

  /** Each placed pin: where it stands; a disc is drawn for it while its frames show it. */
  const placed = new Map<string, Standing>();
  let focused: string | null = null;
  let tracked: string | null = null;
  /** What of the page's viewport the host's chrome covers (`cawco:covered`): its Comments list, a phone's card. */
  let covered: Box[] = [];
  /** Pins no scroll brought out from under the host's chrome when they were last revealed. */
  const stuck = new Set<string>();

  const anchoredEl = (pin: Pin): Element | null =>
    "selector" in pin.anchor ? (deps.locate(pin.anchor)?.el ?? null) : null;

  /** Where pin `pin` stands in the page now, or null when it is not on it. */
  const standing = (pin: Pin): Standing | null => {
    if (pin.ink) {
      const box = deps.groupBox(pin.ink);
      return box
        ? { at: [box.x + box.w, box.y], box, el: anchoredEl(pin), shown: true }
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
    return { at, box, el: found.el, shown: showsAt(found.el, at) };
  };

  /**
   * The anchors whose element is found under another selector or text now
   * (a revision moved or reworded it), written back so the next look finds
   * it by its selector. One that still reads as it was is left alone: a
   * write here draws the pins again. A moved pin its anchor now reads as on
   * the page as a whole (core `findAnchor`'s `page`: one kept on the
   * page-sized container a press in the page's padding named) stands on the
   * page again, out of the moved tray: the page is always there.
   */
  const reanchor = (pins: Pin[]) => {
    const moves: Pin[] = [];
    for (const pin of pins) {
      if (!("selector" in pin.anchor) || (pin.movedAt && pin.ink)) {
        continue;
      }
      const found = deps.locate(pin.anchor);
      if (pin.movedAt && found?.by !== "page") {
        continue;
      }
      const now = found && deps.anchorOf(found.el);
      if (now && (pin.movedAt || changedAnchor(pin.anchor, now))) {
        const { movedAt: _moved, ...rest } = pin;
        moves.push({ ...rest, anchor: now });
      }
    }
    return moves;
  };

  /**
   * When each pin's unread dot began to echo (`performance.now()`): a disc
   * drawn again picks its echo up where it was, and one past its loops
   * stands still.
   */
  const echoes = new Map<string, number>();

  /**
   * The needs-you dot on a disc whose pin holds an answer the person has not
   * looked at (core `pinUnread`): DESIGN.md's status dot, a 6px circle in
   * `status-attn-glyph` on the disc's top-right, the disc cut away 1.5px
   * round it (a hole in its mask, so the page shows round the dot), echoing
   * three loops as the working indicator's echo does, then still. Drawn in
   * a group of its own beside the disc's (`data-pin-dot`), at the disc's
   * place, taking no press: the disc's group holds the disc and its number.
   */
  const unreadDot = (
    pin: Pin,
    face: SVGCircleElement,
    pinned: SVGGElement
  ): SVGGElement => {
    const g = document.createElementNS(SVG, "g");
    g.setAttribute("data-pin-dot", String(pin.number));
    g.setAttribute("transform", pinned.getAttribute("transform") ?? "");
    g.setAttribute("opacity", pinned.getAttribute("opacity") ?? "1");
    g.style.pointerEvents = "none";
    const size = Number.parseFloat(chrome.token("--status-dot-size", "width"));
    const cut = Number.parseFloat(chrome.token("--status-dot-cut", "width"));
    const r = size / 2;
    // Centred on the disc's rim at its top-right, as the status dot is on a tile's corner.
    const at = PIN_R / Math.SQRT2;
    const mask = document.createElementNS(SVG, "mask");
    mask.id = `cawco-pin-cut-${pin.id}`;
    const whole = document.createElementNS(SVG, "circle");
    whole.setAttribute("r", String(PIN_R));
    whole.setAttribute("fill", "white");
    const hole = document.createElementNS(SVG, "circle");
    hole.setAttribute("cx", String(at));
    hole.setAttribute("cy", String(-at));
    hole.setAttribute("r", String(r + cut));
    hole.setAttribute("fill", "black");
    mask.append(whole, hole);
    face.setAttribute("mask", `url(#${mask.id})`);
    const ink = chrome.token("--status-attn-glyph");
    const dot = () => {
      const one = document.createElementNS(SVG, "circle");
      one.setAttribute("cx", String(at));
      one.setAttribute("cy", String(-at));
      one.setAttribute("r", String(r));
      one.setAttribute("fill", ink);
      return one;
    };
    const still = dot();
    still.setAttribute("data-unread", "");
    g.append(mask, still);
    if (!motionOk()) {
      return g;
    }
    const loop = chrome.ms("--dur-loop");
    const began = echoes.get(pin.id) ?? performance.now();
    echoes.set(pin.id, began);
    const past = performance.now() - began;
    if (past >= ECHOES * loop) {
      return g;
    }
    const echo = dot();
    echo.setAttribute("data-echo", "");
    echo.style.transformBox = "fill-box";
    echo.style.transformOrigin = "center";
    g.insertBefore(echo, still);
    const beat = echo.animate(
      [
        { transform: "scale(1)", opacity: ECHO_FROM },
        { transform: `scale(${chrome.number("--echo-scale")})`, opacity: 0 },
      ],
      {
        duration: loop,
        iterations: ECHOES,
        easing: chrome.token("--ease-out", "transition-timing-function"),
        fill: "forwards",
      }
    );
    beat.currentTime = past;
    return g;
  };

  /** tsk-3's numbered pin at `where`: a 20px coral disc with its number, at 40% once resolved, and the needs-you dot beside it while it holds an unread answer. */
  const disc = (
    pin: Pin,
    where: Standing,
    paint: { fill: string; font: string; ink: string }
  ): SVGGElement[] => {
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
    const unread = pinUnread(pin, sentAt());
    if (!unread) {
      echoes.delete(pin.id);
    }
    g.addEventListener("pointerenter", () => {
      deps.outline(where.el, true);
      deps.peek(pin, where.at[0] - scrollX, where.at[1] - scrollY, PIN_R);
    });
    g.addEventListener("pointerleave", () => {
      deps.outline(focused ? (placed.get(focused)?.el ?? null) : null, false);
      deps.peek(null);
    });
    g.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      open(pin.id);
    });
    return unread ? [g, unreadDot(pin, circle, g)] : [g];
  };

  /** Writes the pins found again by their source, text or the page, and moves aside those no anchor finds. */
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
    // Read for the first disc drawn: a token is the page's style, read there and then.
    let painted: { fill: string; font: string; ink: string } | null = null;
    const paintNow = () => {
      painted ??= {
        fill: chrome.token("--action-solid"),
        ink: chrome.token("--on-action"),
        font: chrome.token("--type-label", "font"),
      };
      return painted;
    };
    // A resolved pin stands on the page only while the host has its card open.
    const onIt = (pin: Pin) => !pin.resolvedAt || pin.id === tracked;
    for (const pin of all.filter((one) => !one.movedAt && onIt(one))) {
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
        layer.append(...disc(pin, where, paintNow()));
      }
    }
    return gone;
  };

  function draw() {
    // The change marks' group (changes.ts) stands under the discs and keeps its own.
    for (const node of [...layer.children]) {
      if (!node.hasAttribute("data-cawco-changes")) {
        node.remove();
      }
    }
    placed.clear();
    if (!(onPage() && artifact.keeps())) {
      fitToPage(layer, false);
      deps.drawn();
      return;
    }
    const all = [...pinsMap().values()].sort((a, b) => a.number - b.number);
    fitToPage(layer, all.length > 0);
    const gone = placeAll(all);
    if (settled()) {
      settle(reanchor(all), gone);
    }
    if (focused) {
      deps.outline(placed.get(focused)?.el ?? null);
    }
    tell();
    deps.drawn();
  }

  /**
   * The tracked pin's disc in the viewport, and the box of what it stands
   * on, for the host's card, which stands beside that box where it has room;
   * `stuck` while no scroll brings it out from under the host's chrome.
   */
  const tell = () => {
    if (!tracked) {
      return;
    }
    const where = placed.get(tracked);
    const shown = where?.shown ? where : undefined;
    deps.post("cawco:pin-at", {
      id: tracked,
      ...(shown
        ? {
            x: shown.at[0] - scrollX,
            y: shown.at[1] - scrollY,
            r: PIN_R,
            box: {
              x: shown.box.x - scrollX,
              y: shown.box.y - scrollY,
              w: shown.box.w,
              h: shown.box.h,
            },
          }
        : {}),
      ...(stuck.has(tracked) ? { stuck: true } : {}),
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

  /**
   * Pin `id` brought where the person sees it: inside the viewport and out
   * from under every box the host's chrome covers the page with (its
   * Comments list, a phone's card), each scroller round it moved as little
   * as lands it there (scrollers.ts `bringInto`). A pin already standing
   * there stays where the person is looking. One no scroll can bring out
   * from under the host's chrome (the page's top under the list) is
   * `stuck`: the host makes room for it.
   */
  const reveal = (id: string) => {
    stuck.delete(id);
    const where = placed.get(id);
    if (
      where &&
      !bringOut(
        where.el,
        where.at[0] - scrollX,
        where.at[1] - scrollY,
        where.shown
      )
    ) {
      stuck.add(id);
    }
  };

  /**
   * The viewport's point `x`, `y` on `el` brought where the person sees it,
   * out from under the host's chrome (one already there stays); false when
   * no scroll brings it out from under the chrome, though it is brought into
   * the viewport at least.
   */
  const bringOut = (
    el: Element | null,
    x: number,
    y: number,
    shown: boolean
  ): boolean => {
    const clear = bandsAt(x, covered, PIN_R);
    if (shown && inBands(y, clear)) {
      return true;
    }
    const chain = scrollersOf(el);
    const landed = bringInto(chain, y, clear);
    if (landed) {
      scrollMoves(landed, motionOk() ? "smooth" : "auto");
      return true;
    }
    // Out from under nothing: at least in the viewport.
    const inView = bringInto(chain, y, bandsAt(x, [], PIN_R));
    if (inView) {
      scrollMoves(inView, motionOk() ? "smooth" : "auto");
    }
    return covered.length === 0;
  };

  /** The open card's pin, when it stands under what the host's chrome covers, brought out again. */
  const keepClear = () => {
    const where = tracked ? placed.get(tracked) : undefined;
    if (
      tracked &&
      where &&
      covered.some((box) =>
        discMeets(where.at[0] - scrollX, where.at[1] - scrollY, box)
      )
    ) {
      reveal(tracked);
    }
  };

  const nextNumber = () =>
    Math.max(0, ...[...pinsMap().values()].map((pin) => pin.number)) + 1;

  const write = (pin: Pin) => {
    const doc = artifact.doc();
    doc.transact(() => pinsMap().set(pin.id, pin));
  };

  /** Where the viewport's `x`, `y` is on `el`'s box, as fractions; 0 along an extent it has none of (a body whose content is all fixed). */
  const pointOn = (el: Element, x: number, y: number) => {
    const box = pageBox(el);
    const along = (at: number, from: number, extent: number) =>
      extent > 0 ? round(Math.min(1, Math.max(0, (at - from) / extent))) : 0;
    return {
      x: along(x + scrollX, box.x, box.w),
      y: along(y + scrollY, box.y, box.h),
    };
  };

  /** A pin's element's box, within {@link PIN_REACH} of the point it stands at. */
  const roundPoint = (box: Box, at: [number, number]): Box => {
    const x = Math.max(box.x, at[0] - PIN_REACH.x);
    const y = Math.max(box.y, at[1] - PIN_REACH.y);
    return {
      x,
      y,
      w: Math.max(1, Math.min(box.x + box.w, at[0] + PIN_REACH.x) - x),
      h: Math.max(1, Math.min(box.y + box.h, at[1] + PIN_REACH.y) - y),
    };
  };

  return {
    layer,
    draw,
    open,
    placedAt: (id) => {
      const where = placed.get(id);
      if (where) {
        return { at: where.at, el: where.el };
      }
      // Not drawn (resolved, its card shut): where its element stands, at the element's top-right.
      const pin = pinsMap().get(id);
      const el = pin && !pin.movedAt ? anchoredEl(pin) : null;
      if (!el) {
        return null;
      }
      const box = pageBox(el);
      return { at: [box.x + box.w, box.y], el };
    },
    revealElement: (el) => {
      const r = rectOf(el);
      // A point on its top band, where a card's head or a line's words stand.
      const x = r.left + r.width / 2;
      const y = r.top + Math.min(r.height / 2, 2 * PIN_R);
      bringOut(el, x, y, y >= 0 && y <= innerHeight);
    },
    cropOf: (id) => {
      const pin = pinsMap().get(id);
      const where = placed.get(id);
      if (!(pin && where)) {
        return null;
      }
      if (pin.ink) {
        const box = deps.groupBox(pin.ink);
        return box
          ? { box: padded(box), look: `ink:${pin.ink}:${JSON.stringify(box)}` }
          : null;
      }
      if (!where.el) {
        return null;
      }
      const box = roundPoint(pageBox(where.el), where.at);
      return {
        box: padded(box),
        look: `pin:${JSON.stringify(box)}`,
      };
    },
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
      open(pin.id, true);
      return pin.id;
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
        open(pin.id, true);
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
      open(id);
    },
    focus: (id, scroll) => {
      focused = id;
      const el: Element | null = id ? (placed.get(id)?.el ?? null) : null;
      if (scroll && id) {
        reveal(id);
      }
      deps.outline(el, true);
    },
    cover: (boxes) => {
      covered = boxes;
      // What covers the page changed under an open card (its card came to a
      // phone's foot, the panel opened or grew): its pin is brought out again.
      keepClear();
      tell();
    },
    keepClear,
    track: (id) => {
      const before = tracked;
      tracked = id;
      // Only a resolved pin stands or goes with its card (`onIt`): the page is
      // drawn again for that alone. Drawn again for an open pin, every disc
      // is put back new under the tap that closed the card, and iOS WebKit,
      // seeing new content as that tap lands, takes it for a hover and sends
      // no click (the iOS probe: "dismissed by=page" and no new document).
      const resolved = (pin: string | null) =>
        pin !== null && !!pinsMap().get(pin)?.resolvedAt;
      if (before !== id && (resolved(before) || resolved(id))) {
        // Drawn again, which tells the host.
        draw();
      } else {
        tell();
      }
    },
    show: (shown) => {
      layer.style.display = shown ? "" : "none";
      if (!shown) {
        deps.peek(null);
      }
    },
  };
}
