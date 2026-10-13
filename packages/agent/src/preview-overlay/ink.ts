/// <reference lib="dom" />

/**
 * Ink on any artifact (Projects spec §5.10, D27; DESIGN.md, Artifact panel,
 * canvas and ink: "Ink on any artifact"). A pen inks at once; a finger and a
 * mouse never do (Comment is its own mode, and while it is on nothing inks).
 *
 * The ink is an `<svg>` in the page's own document, at its origin and as big
 * as its scroll, so it scrolls with the page and never shifts; it takes the
 * pointer only while a pen is down. Strokes are Pointer Events with
 * `pointerType === "pen"`: their coalesced events are the points (WebKit
 * hands UIKit's coalesced touches, WebKit PR 31329), their predicted events
 * the live tail, drawn and never kept, with the pen's pressure. Each is
 * drawn as perfect-freehand's outline (MIT, pinned at 1.2.3) in
 * `brand-solid`, 2.5px at middle pressure, thinner by less, never under 1px.
 *
 * A stroke group is the strokes made within two breaths of each other whose
 * boxes touch. It is anchored to the deepest element containing its box and
 * kept in the doc's `ink` (core ink.ts) as fractions of that element's box,
 * so it is drawn again from the element's box wherever the element stands
 * now: on load, on a resize, when the element itself resizes, after a
 * re-publish. The element is found as a pin's is (core comments.ts
 * `findAnchor`); a page's group whose element is gone goes to `moved`.
 * Its pins are pins.ts's.
 *
 * On a canvas the pen draws the canvas's own freedraw (Excalidraw), so this
 * layer stays off; the canvas's page tells the overlay where a stroke ended
 * (`cawco:stroke-end`) and the icon and its picks run on that element.
 */
import {
  changedAnchor,
  type PageAnchor,
  type Pin,
  type PinnedElement,
  pinUnsent,
} from "@cawco/core/comments";
import { INK_LIMITS, type InkGroup, type InkPoint } from "@cawco/core/ink";
import { getStroke } from "perfect-freehand";
import type { Map as YMap } from "yjs";
import { artifact } from "./artifact";
import { newId } from "./id";
import type { Pins } from "./pins";
import type { InkChrome, Pick } from "./radial";

const SVG = "http://www.w3.org/2000/svg";

/**
 * perfect-freehand's outline: `size` is the width at middle pressure
 * (DESIGN.md's 2.5px); `thinning` 0.6 makes it 1px at none and 4px at full.
 */
const STROKE = {
  size: 2.5,
  thinning: 0.6,
  smoothing: 0.5,
  streamline: 0.4,
  simulatePressure: false,
  last: true,
} as const;

/** Elements a pin names at most. Our call. */
const PINNED_MAX = 20;
/** A pen's pressure when it reports none (a pen that does not measure it). */
const NO_PRESSURE = 0.5;
/** The pen's eraser in Pointer Events: its `button`, and its bit in `buttons`. */
const ERASER_BUTTON = 5;
const ERASER_BUTTONS = 32;
/** How far round its point the eraser reaches, px: the point and four around it. Our call. */
const REACH = [
  [0, 0],
  [4, 0],
  [-4, 0],
  [0, 4],
  [0, -4],
] as const;
/** A stroke the eraser has crossed, until it lifts. Our call. */
const ERASING_OPACITY = "0.3";

/** A point in the page, px, with its pressure. */
type Point = [x: number, y: number, pressure: number];
interface Box {
  h: number;
  w: number;
  x: number;
  y: number;
}

/** What the overlay lends the ink: its own describers, the pins, the host's chrome, its word to the host. */
export interface InkDeps {
  /** What a page's mark stands on, read from `el` as it is now. */
  anchorOf: (el: Element) => PageAnchor;
  /** The page as a picture at `scale`, ink and all, the overlay's own UI left out. */
  capture: (scale?: number) => Promise<{ png: string | null; error?: string }>;
  chrome: InkChrome;
  /** Whether Comment mode is on: nothing inks while it is. */
  commenting: () => boolean;
  describe: (el: Element) => PinnedElement;
  elementAt: (x: number, y: number) => Element | null;
  /** Where a page's anchor stands now, and by what; null when nothing on the page matches it. */
  locate: (
    anchor: PageAnchor
  ) => { by: "source" | "selector" | "text"; el: Element } | null;
  /** The pins, drawn after the ink each time it is drawn. */
  pins: () => Pins;
  post: (type: string, payload?: object) => void;
}

export interface Ink {
  /** The doc's ink changed, or the doc was replaced: drawn again, and the host told. */
  changed: () => void;
  /** The page's pins and a picture with the ink on it, for the composer's Ink chip. */
  exported: () => Promise<{ md: string; png: string | null; canvas: boolean }>;
  /** A placed group's box in the page, px; null when it is not on the page. */
  groupBox: (id: string) => Box | null;
  /** The svg the ink is drawn in: a re-publish keeps it (overlay `kept`). */
  layer: SVGSVGElement;
  /** Draw every group again where its element stands now (after a morph). */
  replace: () => void;
  /** The person sent what was unsent: stamped `sentAt`. */
  sent: () => void;
}

const pageBox = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
};

const boxOf = (points: Point[]): Box => {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    w: Math.max(1, Math.max(...xs) - x),
    h: Math.max(1, Math.max(...ys) - y),
  };
};

const union = (a: Box, b: Box): Box => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
};

const touches = (a: Box, b: Box) =>
  a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;

const contains = (outer: Box, inner: Box, slack = 1) =>
  inner.x >= outer.x - slack &&
  inner.y >= outer.y - slack &&
  inner.x + inner.w <= outer.x + outer.w + slack &&
  inner.y + inner.h <= outer.y + outer.h + slack;

const round = (n: number) => Math.round(n * 10_000) / 10_000;

/** perfect-freehand's outline as a closed path of quadratic curves through its points' midpoints. */
const pathOf = (points: Point[]): string => {
  const outline = getStroke(points, STROKE);
  if (outline.length < 2) {
    return "";
  }
  const f = (n: number) => n.toFixed(2);
  let d = `M ${f(outline[0][0])} ${f(outline[0][1])} Q`;
  outline.forEach(([x0, y0], i) => {
    const [x1, y1] = outline[(i + 1) % outline.length];
    d += ` ${f(x0)} ${f(y0)} ${f((x0 + x1) / 2)} ${f((y0 + y1) / 2)}`;
  });
  return `${d} Z`;
};

/** An svg layer at the page's origin, as big as its scroll. */
export const fitToPage = (svg: SVGSVGElement) => {
  const root = document.documentElement;
  svg.setAttribute(
    "width",
    String(Math.max(root.scrollWidth, document.body?.scrollWidth ?? 0))
  );
  svg.setAttribute(
    "height",
    String(Math.max(root.scrollHeight, document.body?.scrollHeight ?? 0))
  );
};

/** A pen's pressure, or the middle one where it reports none. */
const pressureOf = (event: PointerEvent) =>
  event.pressure > 0 ? event.pressure : NO_PRESSURE;

export function startInk(deps: InkDeps): Ink {
  const { chrome } = deps;
  const layer = document.createElementNS(SVG, "svg");
  layer.setAttribute("data-cawco-ink", "");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText =
    "position:absolute;left:0;top:0;z-index:2147483646;overflow:visible;pointer-events:none;margin:0;padding:0;border:0";
  document.documentElement.append(layer);

  const onCanvas = () => artifact.kind() === "canvas";
  /** Whether a pen inks here now: a page with a doc to keep it, not in Comment mode. */
  const inks = () => !(onCanvas() || deps.commenting()) && artifact.keeps();
  const maps = () => {
    const doc = artifact.doc();
    return {
      doc,
      ink: doc.getMap("ink") as YMap<InkGroup>,
      moved: doc.getMap("moved") as YMap<InkGroup>,
      pins: doc.getMap("pins") as YMap<Pin>,
    };
  };

  /** Each placed group: its points in the page, its box, the element it stands on. */
  const placed = new Map<string, { box: Box; anchor: Element | null }>();
  const anchors = new ResizeObserver(() => later());

  // --- drawing --------------------------------------------------------------

  let drawing: { id: number; points: Point[]; path: SVGPathElement } | null =
    null;
  /** The group the last stroke joined, and when, for the next stroke's two breaths. */
  let last: { id: string; at: number } | null = null;

  const add = (event: PointerEvent) => {
    drawing?.points.push([
      event.clientX + scrollX,
      event.clientY + scrollY,
      pressureOf(event),
    ]);
  };
  const drawLive = (predicted: PointerEvent[] = []) => {
    if (!drawing) {
      return;
    }
    const tail: Point[] = predicted.map((event) => [
      event.clientX + scrollX,
      event.clientY + scrollY,
      pressureOf(event),
    ]);
    drawing.path.setAttribute("d", pathOf([...drawing.points, ...tail]));
  };

  const release = () => {
    layer.style.pointerEvents = "none";
    layer.style.touchAction = "";
  };

  /** The pen's eraser (Pointer Events: button 5, buttons bit 32): it removes the whole strokes it crosses. */
  const isEraser = (event: PointerEvent) =>
    event.button === ERASER_BUTTON ||
    // biome-ignore lint/suspicious/noBitwiseOperators: `buttons` is a bitmask
    (event.buttons & ERASER_BUTTONS) !== 0;
  /** The eraser down: the strokes it has crossed so far, by group. */
  let erasing: { id: number; hits: Map<string, Set<number>> } | null = null;
  /** The eraser at a point: each stroke whose outline lies within its reach is crossed, and drawn faint until it lifts. */
  const rub = (event: PointerEvent) => {
    if (!erasing) {
      return;
    }
    const x = event.clientX + scrollX;
    const y = event.clientY + scrollY;
    for (const path of layer.querySelectorAll<SVGPathElement>(
      "path[data-stroke]"
    )) {
      const crossed = REACH.some(([dx, dy]) =>
        path.isPointInFill(new DOMPoint(x + dx, y + dy))
      );
      const group = path.parentElement?.getAttribute("data-ink-group");
      if (!(crossed && group)) {
        continue;
      }
      const hit = erasing.hits.get(group) ?? new Set<number>();
      hit.add(Number(path.getAttribute("data-stroke")));
      erasing.hits.set(group, hit);
      path.style.opacity = ERASING_OPACITY;
    }
  };
  /** The eraser lifts: the strokes it crossed go; a group left with none goes with its pins. */
  const erase = (hits: Map<string, Set<number>>) => {
    const { doc, ink, pins } = maps();
    const at = new Date().toISOString();
    doc.transact(() => {
      for (const [id, crossed] of hits) {
        const group = ink.get(id);
        if (!group) {
          continue;
        }
        const left = strokesInPage(group).filter(
          (_, index) => !crossed.has(index)
        );
        if (left.length > 0) {
          const kept = regroup(group, left, at);
          ink.set(id, {
            ...kept,
            ...(group.sentAt ? { sentAt: group.sentAt } : {}),
          });
          continue;
        }
        ink.delete(id);
        for (const pin of [...pins.values()].filter((one) => one.ink === id)) {
          pins.delete(pin.id);
        }
      }
    });
    draw();
  };

  window.addEventListener(
    "pointerdown",
    (event) => {
      if (event.pointerType !== "pen") {
        return;
      }
      // The next stroke starts: the last one's icon leaves (on a canvas too).
      chrome.hideIcon();
      if (!inks()) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      layer.style.pointerEvents = "auto";
      layer.style.touchAction = "none";
      try {
        layer.setPointerCapture(event.pointerId);
      } catch {
        // A pointer the page has already let go of: its moves still reach the window.
      }
      if (isEraser(event)) {
        erasing = { id: event.pointerId, hits: new Map() };
        rub(event);
        return;
      }
      const path = document.createElementNS(SVG, "path");
      path.setAttribute("data-live", "");
      path.setAttribute("fill", chrome.token("--brand-solid"));
      layer.append(path);
      drawing = { id: event.pointerId, points: [], path };
      add(event);
      drawLive();
    },
    { capture: true }
  );
  /** A move's points: its coalesced ones, or the move itself where the browser gives none (an untrusted event). */
  const pointsOf = (event: PointerEvent) => {
    const coalesced = event.getCoalescedEvents?.() ?? [];
    return coalesced.length > 0 ? coalesced : [event];
  };
  window.addEventListener(
    "pointermove",
    (event) => {
      if (erasing?.id === event.pointerId) {
        event.preventDefault();
        event.stopImmediatePropagation();
        for (const one of pointsOf(event)) {
          rub(one);
        }
        return;
      }
      if (drawing?.id !== event.pointerId) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      for (const one of pointsOf(event)) {
        add(one);
      }
      drawLive(event.getPredictedEvents?.() ?? []);
    },
    { capture: true }
  );
  const lifted = (event: PointerEvent) => {
    if (erasing?.id === event.pointerId) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const { hits } = erasing;
      erasing = null;
      release();
      if (event.type === "pointerup") {
        erase(hits);
      } else {
        draw();
      }
      return;
    }
    if (drawing?.id !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const { points, path } = drawing;
    drawing = null;
    path.remove();
    release();
    if (event.type === "pointerup" && points.length > 0) {
      commit(points);
    }
  };
  window.addEventListener("pointerup", lifted, { capture: true });
  window.addEventListener("pointercancel", lifted, { capture: true });
  // WebKit pans the page under a stylus unless its touch is refused; a finger's stays the page's.
  const stylus = (event: TouchEvent) => {
    if (
      inks() &&
      [...event.changedTouches].some(
        (touch) =>
          (touch as Touch & { touchType?: string }).touchType === "stylus"
      )
    ) {
      event.preventDefault();
    }
  };
  document.addEventListener("touchstart", stylus, {
    capture: true,
    passive: false,
  });
  document.addEventListener("touchmove", stylus, {
    capture: true,
    passive: false,
  });

  /** The deepest element whose box holds `box` (the page's px). */
  const anchorFor = (box: Box): Element => {
    let el =
      deps.elementAt(
        box.x + box.w / 2 - scrollX,
        box.y + box.h / 2 - scrollY
      ) ?? document.body;
    while (
      el.parentElement &&
      el !== document.body &&
      !contains(pageBox(el), box)
    ) {
      el = el.parentElement;
    }
    return el;
  };

  /** Why a stroke may not be kept (WORDS.md's error formula), or null: the bounds the hub keeps. */
  const refusal = (
    points: Point[],
    open: InkGroup | undefined
  ): string | null => {
    if (points.length > INK_LIMITS.pointsPerStroke) {
      return `This stroke has more than ${INK_LIMITS.pointsPerStroke.toLocaleString()} points, so it wasn't kept. Draw it as two strokes.`;
    }
    const { ink, moved } = maps();
    if (!open && ink.size + moved.size >= INK_LIMITS.groups) {
      return `This artifact keeps ${INK_LIMITS.groups} stroke groups, so this stroke wasn't kept. Erase a group, then draw again.`;
    }
    if (open && open.strokes.length >= INK_LIMITS.strokesPerGroup) {
      return `This group keeps ${INK_LIMITS.strokesPerGroup} strokes, so this stroke wasn't kept. Start a new group away from it.`;
    }
    return null;
  };

  /** The group `open` with `points` added (a new one when there is none). */
  const groupOf = (
    open: InkGroup | undefined,
    points: Point[],
    at: string
  ): InkGroup =>
    // The group's strokes in the page: the open group's as it is drawn now, and this one.
    regroup(open, [...(open ? strokesInPage(open) : []), { points, at }], at);

  /** A group of `strokes` (the page's px), anchored and kept as fractions of its element's box; `open`'s id, time and mark kept. */
  const regroup = (
    open: InkGroup | undefined,
    strokes: { at: string; points: Point[] }[],
    at: string
  ): InkGroup => {
    const all = strokes.map((one) => one.points);
    const groupBox = all.map(boxOf).reduce(union);
    const anchor = anchorFor(groupBox);
    const ab = pageBox(anchor);
    const fraction = (p: Point): InkPoint => [
      round((p[0] - ab.x) / ab.w),
      round((p[1] - ab.y) / ab.h),
      round(p[2]),
    ];
    return {
      id: open?.id ?? newId(),
      anchor: deps.anchorOf(anchor),
      box: {
        x: round((groupBox.x - ab.x) / ab.w),
        y: round((groupBox.y - ab.y) / ab.h),
        w: round(groupBox.w / ab.w),
        h: round(groupBox.h / ab.h),
      },
      page: {
        x: Math.round(groupBox.x),
        y: Math.round(groupBox.y),
        w: Math.round(groupBox.w),
        h: Math.round(groupBox.h),
      },
      strokes: strokes.map((stroke) => ({
        points: stroke.points.map(fraction),
        at: stroke.at,
      })),
      at: open?.at ?? at,
      ...(open?.illustration ? { illustration: true as const } : {}),
    };
  };

  /** A finished stroke joins the group it touches within two breaths, or starts one; the icon comes to its end. */
  const commit = (points: Point[]) => {
    const end = points.at(-1) as Point;
    const now = Date.now();
    const { doc, ink } = maps();
    const recent =
      last && now - last.at <= 2 * chrome.ms("--breath")
        ? ink.get(last.id)
        : undefined;
    const recentBox = recent ? placed.get(recent.id)?.box : undefined;
    const open =
      recent && recentBox && touches(recentBox, boxOf(points))
        ? recent
        : undefined;
    const refused = refusal(points, open);
    if (refused) {
      chrome.say(refused, end[0] - scrollX, end[1] - scrollY);
      return;
    }
    const group = groupOf(open, points, new Date(now).toISOString());
    doc.transact(() => ink.set(group.id, group));
    last = { id: group.id, at: now };
    chrome.showIcon(end[0] - scrollX, end[1] - scrollY, (choice) =>
      act(group.id, choice)
    );
  };

  // --- placing --------------------------------------------------------------

  /** A group's element now (core `findAnchor`'s order); null when nothing matches. */
  const elementOf = (group: InkGroup): Element | null =>
    "selector" in group.anchor ? (deps.locate(group.anchor)?.el ?? null) : null;

  /** A group's strokes where its element stands now, in the page's px. */
  const strokesInPage = (group: InkGroup) => {
    const el = elementOf(group);
    const ab = el ? pageBox(el) : null;
    return group.strokes.map((stroke) => ({
      at: stroke.at,
      points: stroke.points.map(
        ([fx, fy, p]): Point =>
          ab ? [ab.x + fx * ab.w, ab.y + fy * ab.h, p] : [0, 0, p]
      ),
    }));
  };

  let frame = 0;
  /** Placed again on the next frame: whatever moved this frame, once. */
  function later() {
    if (!frame) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        draw();
      });
    }
  }

  /** Whether a group whose element is gone may be moved aside now: a page the agent wrote, laid out. */
  const settled = () =>
    artifact.kind() === "page" && document.readyState !== "loading";

  function draw() {
    for (const node of [...layer.children]) {
      if (!node.hasAttribute("data-live")) {
        node.remove();
      }
    }
    anchors.disconnect();
    placed.clear();
    if (onCanvas()) {
      return;
    }
    fitToPage(layer);
    const { ink } = maps();
    const gone: InkGroup[] = [];
    const found: InkGroup[] = [];
    const brand = chrome.token("--brand-solid");
    for (const group of ink.values()) {
      const at = "selector" in group.anchor ? deps.locate(group.anchor) : null;
      const el = at?.el;
      if (!el) {
        gone.push(group);
        continue;
      }
      const reread = rereadOn(group, el);
      if (reread) {
        found.push(reread);
      }
      drawGroup(group, el, brand);
    }
    if (settled()) {
      settleGroups(found, gone);
    }
    deps.pins().draw();
  }

  /**
   * The group anchored again on `el` when `el` now reads otherwise than its
   * anchor (moved, renamed, reworded); null when it reads as it was, since
   * a write draws the ink again.
   */
  function rereadOn(group: InkGroup, el: Element): InkGroup | null {
    const now = deps.anchorOf(el);
    return "selector" in group.anchor && changedAnchor(group.anchor, now)
      ? { ...group, anchor: now }
      : null;
  }

  /** One group's strokes over `el`, where `el` stands now. */
  function drawGroup(group: InkGroup, el: Element, brand: string) {
    anchors.observe(el);
    const strokes = strokesInPage(group);
    const g = document.createElementNS(SVG, "g");
    g.setAttribute("data-ink-group", group.id);
    for (const [index, stroke] of strokes.entries()) {
      const path = document.createElementNS(SVG, "path");
      path.setAttribute("data-stroke", String(index));
      path.setAttribute("d", pathOf(stroke.points));
      path.setAttribute("fill", brand);
      g.append(path);
    }
    layer.append(g);
    placed.set(group.id, {
      box: strokes.map((one) => boxOf(one.points)).reduce(union),
      anchor: el,
    });
  }

  /** Writes the groups found again by their source or text, and moves aside those no anchor finds. */
  function settleGroups(found: InkGroup[], gone: InkGroup[]) {
    if (found.length === 0 && gone.length === 0) {
      return;
    }
    const { doc, ink, moved } = maps();
    doc.transact(() => {
      for (const group of found) {
        ink.set(group.id, group);
      }
      for (const group of gone) {
        ink.delete(group.id);
        moved.set(group.id, group);
      }
    });
  }

  // --- picks ----------------------------------------------------------------

  /** The page's elements under a group's box: its element and those inside it the box crosses. */
  const elementsUnder = (id: string): PinnedElement[] => {
    const at = placed.get(id);
    if (!at?.anchor) {
      return [];
    }
    const crossed = [at.anchor, ...at.anchor.querySelectorAll("*")].filter(
      (el) => touches(pageBox(el), at.box)
    );
    return crossed.slice(0, PINNED_MAX).map(deps.describe);
  };

  /** What a pick does to the group `id`. */
  function act(id: string, choice: Pick, under?: string[]) {
    const { doc, ink, pins } = maps();
    const group = ink.get(id);
    if (!group) {
      return;
    }
    const pinAs = (kind: Pin["kind"]) =>
      deps.pins().pinInk(group, kind, under ?? elementsUnder(id));
    const picks: Record<Pick, () => void> = {
      annotate: () => pinAs("annotation"),
      comment: () => pinAs("comment"),
      illustrate: () => ink.set(id, { ...group, illustration: true }),
      erase: () => {
        ink.delete(id);
        for (const pin of [...pins.values()].filter((one) => one.ink === id)) {
          pins.delete(pin.id);
        }
      },
    };
    doc.transact(picks[choice]);
    if (choice === "erase" && under) {
      // A canvas's ink is its own element: the canvas's page removes it.
      window.dispatchEvent(new CustomEvent("cawco:erase", { detail: { id } }));
    }
  }

  // A canvas's freedraw ended under a pen: the icon at its end, its picks on that element.
  window.addEventListener("cawco:stroke-end", (event) => {
    const detail = (event as CustomEvent).detail as {
      id: string;
      x: number;
      y: number;
      box: Box;
      under: string[];
    } | null;
    if (!(onCanvas() && artifact.keeps() && detail?.id)) {
      return;
    }
    const { doc, ink, moved } = maps();
    if (!ink.has(detail.id) && ink.size + moved.size >= INK_LIMITS.groups) {
      chrome.say(
        `This canvas keeps ${INK_LIMITS.groups} stroke groups, so this stroke has no options. Erase a group, then draw again.`,
        detail.x,
        detail.y
      );
      return;
    }
    const at = new Date().toISOString();
    doc.transact(() =>
      ink.set(detail.id, {
        id: detail.id,
        anchor: { element: detail.id },
        box: { x: 0, y: 0, w: 1, h: 1 },
        page: detail.box,
        strokes: [],
        at,
      })
    );
    chrome.showIcon(detail.x, detail.y, (choice) =>
      act(detail.id, choice, detail.under)
    );
  });

  // --- what Send takes ------------------------------------------------------

  let thumbTimer: ReturnType<typeof setTimeout> | undefined;
  /** The host hears how much ink is unsent, and a small picture of it once the pen rests. */
  const tell = () => {
    const { ink, pins } = maps();
    const unsent = [...ink.values()].filter((group) => !group.sentAt).length;
    const unsentPins = [...pins.values()].filter((pin) => !pin.sentAt).length;
    deps.post("cawco:ink", { unsent, pins: unsentPins });
    clearTimeout(thumbTimer);
    if (unsent > 0 && !onCanvas()) {
      thumbTimer = setTimeout(async () => {
        const { png } = await deps.capture(0.25);
        if (png) {
          deps.post("cawco:ink", { unsent, pins: unsentPins, thumb: png });
        }
      }, chrome.ms("--breath") / 2);
    }
  };

  /** The doc's ink changed (here, elsewhere, or a new doc): drawn again, and the host told. */
  const changed = () => {
    draw();
    tell();
  };
  // The window resizes or the page grows: every group stands where its element is now.
  addEventListener("resize", later);
  new ResizeObserver(() => later()).observe(document.documentElement);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", changed, { once: true });
  } else {
    queueMicrotask(changed);
  }

  return {
    layer,
    replace: () => draw(),
    groupBox: (id) => placed.get(id)?.box ?? null,
    exported: async () => {
      const md = deps.pins().markdown();
      if (onCanvas()) {
        return { md, png: null, canvas: true };
      }
      const { png } = await deps.capture();
      return { md, png, canvas: false };
    },
    sent: () => {
      const { doc, ink, pins } = maps();
      const at = new Date().toISOString();
      doc.transact(() => {
        for (const group of [...ink.values()]) {
          if (!group.sentAt) {
            ink.set(group.id, { ...group, sentAt: at });
          }
        }
        for (const pin of [...pins.values()].filter(pinUnsent)) {
          pins.set(pin.id, {
            ...pin,
            sentAt: pin.sentAt ?? at,
            thread: pin.thread.map((entry) =>
              entry.by === "person" && !entry.sentAt
                ? { ...entry, sentAt: at }
                : entry
            ),
          });
        }
      });
    },
    changed,
  };
}
