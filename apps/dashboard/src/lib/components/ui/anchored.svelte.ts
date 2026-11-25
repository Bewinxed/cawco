/**
 * Where a kit floating layer stands (a popover, a dropdown or context menu
 * and their submenus, a select's list, a tooltip, a hanging card): on the
 * element it opens from, by CSS anchor positioning (core anchor-names.ts).
 * No script places it, so a scroll, a resize or a font arriving moves it
 * with its anchor and runs nothing here. bits-ui draws each layer through
 * its static part (`ContentStatic`), which keeps its focus, Escape, a press
 * outside, nesting and ARIA, and places nothing.
 *
 * The layer is a fixed box round the surface (`data-kit-layer`), its anchor
 * the element named for it: the site's (`customAnchor`), the pointer's
 * point for a context menu (`atPointer`), else the control bits-ui points
 * at the surface while it is open (`aria-controls`, a tooltip's
 * `aria-describedby`). It stands on its preferred side
 * (`position-area`), `sideOffset` off its anchor and `collisionPadding`
 * clear of the viewport's edges, as margins; where that does not hold it,
 * it turns to the other side or the other end, the side with more room
 * first (`position-try-fallbacks`, `position-try-order`, design.css's
 * `@position-try` rules), and where neither holds it whole it stands on
 * that side centred on its anchor and kept inside the viewport, its height
 * capped there and what it holds scrolling (`--kit-span-block`). A submenu
 * that fits on neither side of its row hangs from the row's foot
 * (`below`).
 *
 * Once at each open, after the browser has placed it, the side it took is
 * read and written on the surface as `data-side` (with `data-align`, its
 * `transform-origin` at its anchor as `--kit-origin`, and where an arrow
 * meets the anchor's centre as `--kit-arrow-at`), so the pop motion rises
 * from the side it opened on: the surface stands in its closed look while
 * it is placed (`data-placing`, popover-content.svelte's `popMotion`) and
 * opens from there with the side known. In a browser whose anchors stand
 * where their element is laid out rather than where its transforms draw it
 * (core `anchorsFollowTransforms`: Firefox, Safari 26), the layer is moved
 * by the anchor's transform then too, never on a frame of its own.
 */

import {
  type Anchorable,
  anchorable,
  anchorName,
  nameOff,
  nameOn,
  shiftTranslate,
  transformShifts,
} from "@cawco/core/anchor-names";
import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";
import { createAttachmentKey } from "svelte/attachments";
import type { HTMLAttributes } from "svelte/elements";
import { frameObserver } from "#lib/platform/frame-observer.js";
import { PLACED, type Placed } from "#lib/platform/layer-placed.js";
import { dur, ease, motionOk } from "#lib/platform/motion/curves.svelte.js";
import { browser } from "$app/env";

type LayerSide = "top" | "right" | "bottom" | "left";
type LayerAlign = "start" | "center" | "end";

/** A box whose left and width are one element's, its top and height another's. */
export interface AnchorPair {
  x: Element | string;
  y: Element | string;
}

/**
 * A box inside an element that is no element of its own (a caret in a
 * field): where it stands now (`rect`), kept at that offset from the
 * element's corner as the element moves.
 */
export interface AnchorSpot {
  rect: () => DOMRect;
  within: Element;
}

/** How a layer stands on its anchor. */
export interface Placement {
  /** Hanging so, it stands over its anchor's top first: its anchor stands in the screen's lower half (read at the open). */
  above?: boolean;
  /** Its end on the anchor's side: the start, the centre or the end. */
  align?: LayerAlign;
  /** Along that side, off its aligned end. */
  alignOffset?: number;
  /** It opens at the pointer's point (a context menu). */
  atPointer?: boolean;
  /** Where neither side holds it, it hangs from its anchor's foot (a submenu on a phone). */
  below?: boolean;
  /** How far it keeps clear of the viewport's edges. */
  collisionPadding?: number;
  /**
   * What it stands on, when not the control that opens it: an element, a
   * selector (none, or null, for its trigger); or a box across one element
   * and along another
   * (`x` its left and width, `y` its top and height: a usage cell's row).
   */
  customAnchor?: Element | string | AnchorPair | AnchorSpot | null;
  /** It never turns to its anchor's other side (a card that hangs from its anchor), only along it, capped where it runs past the screen. */
  fixedSide?: boolean;
  /** The side of its anchor it would stand on. */
  side?: LayerSide;
  /** How far off its anchor it stands. */
  sideOffset?: number;
}

/** What a kit content takes from its site of where its layer stands. */
export type LayerPlacement = Pick<
  Placement,
  | "align"
  | "alignOffset"
  | "collisionPadding"
  | "customAnchor"
  | "fixedSide"
  | "side"
  | "sideOffset"
>;

/** Every layer's anchor names are its own kind's (core anchor-names `anchorName`). */
const KIND = "kit-anchor";

/** A surface's `data-state` while it is open (a tooltip's says how it opened). */
const OPEN_STATES = new Set(["open", "delayed-open", "instant-open"]);

const isOpen = (el: Element | null): boolean =>
  !!el && OPEN_STATES.has(el.getAttribute("data-state") ?? "");

/** The surface a layer holds: bits-ui's element, which says its state. */
const surfaceOf = (layer: HTMLElement): HTMLElement | null =>
  layer.querySelector<HTMLElement>(":scope > [data-state]");

/**
 * The control bits-ui points at an open surface: a popover's, a menu's, a
 * submenu's and a select's trigger name it (`aria-controls`), a tooltip's
 * trigger is described by it (`aria-describedby`).
 */
function triggerOf(surface: HTMLElement): Element | null {
  if (!surface.id) {
    return null;
  }
  const id = CSS.escape(surface.id);
  return surface.ownerDocument.querySelector(
    `[aria-controls~="${id}"], [aria-describedby~="${id}"]`
  );
}

/* ----------------------------------------------------- the pointer's point */

/** Where the last context menu was asked for: a right press, or a finger's long press. */
let pointer: { x: number; y: number } | null = null;
/** Every open-at-the-pointer layer's point, moved with each new ask. */
const points = new Set<HTMLElement>();
let heard = false;

function hearPointer(): void {
  if (heard) {
    return;
  }
  heard = true;
  const at = (event: MouseEvent) => {
    pointer = { x: event.clientX, y: event.clientY };
    for (const point of points) {
      setPoint(point);
    }
  };
  const options = { capture: true, passive: true } as const;
  document.addEventListener("contextmenu", at, options);
  document.addEventListener(
    "pointerdown",
    (event) => {
      // bits-ui opens a finger's context menu at its long press's start.
      if (event.pointerType === "touch") {
        at(event);
      }
    },
    options
  );
}

function setPoint(point: HTMLElement): void {
  point.style.left = `${pointer?.x ?? 0}px`;
  point.style.top = `${pointer?.y ?? 0}px`;
}

/**
 * A 0×0 box at the pointer's point, for a context menu to stand on: just
 * before the layer, so it is laid out before it (a fixed anchor of a fixed
 * box comes first in tree order).
 */
function makePoint(layer: HTMLElement): HTMLElement {
  hearPointer();
  const point = document.createElement("div");
  point.dataset.kitPoint = "";
  point.style.cssText =
    "position:fixed;width:0;height:0;pointer-events:none;visibility:hidden";
  setPoint(point);
  layer.before(point);
  points.add(point);
  return point;
}

/**
 * A box at `spot`'s place inside its element, standing on the element by
 * anchor positioning at that offset from its corner, for a layer to stand
 * on: just before the layer, as a point is. `move` sets it where the spot
 * is now.
 */
function makeSpot(
  layer: HTMLElement,
  within: Anchorable
): { box: HTMLElement; drop: () => void; move: (spot: AnchorSpot) => void } {
  const name = anchorName(KIND);
  nameOn(within, name);
  const box = document.createElement("div");
  box.dataset.kitPoint = "";
  layer.before(box);
  return {
    box,
    move: (spot) => {
      const at = spot.rect();
      const of = within.getBoundingClientRect();
      box.style.cssText = `position:fixed;pointer-events:none;visibility:hidden;margin:0;left:calc(anchor(${name} left) + ${at.left - of.left}px);top:calc(anchor(${name} top) + ${at.top - of.top}px);width:${at.width}px;height:${at.height}px`;
    },
    drop: () => {
      box.remove();
      nameOff(within, name);
    },
  };
}

/**
 * A box across `x` and along `y` (an `AnchorPair`), standing on both by
 * anchor positioning, for a layer to stand on: just before the layer, as a
 * point is.
 */
function makeProxy(
  layer: HTMLElement,
  x: Anchorable,
  y: Anchorable
): { box: HTMLElement; drop: () => void } {
  const across = anchorName(KIND);
  const along = anchorName(KIND);
  nameOn(x, across);
  nameOn(y, along);
  const box = document.createElement("div");
  box.dataset.kitPoint = "";
  box.style.cssText = `position:fixed;pointer-events:none;visibility:hidden;margin:0;left:anchor(${across} left);right:anchor(${across} right);top:anchor(${along} top);bottom:anchor(${along} bottom)`;
  layer.before(box);
  return {
    box,
    drop: () => {
      box.remove();
      nameOff(x, across);
      nameOff(y, along);
    },
  };
}

/* ----------------------------------------------------------- the CSS side */

const BLOCK = new Set<LayerSide>(["top", "bottom"]);
const OPPOSITE: Record<LayerSide, LayerSide> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

/** Its margins: `sideOffset` toward the anchor, `collisionPadding` toward the viewport, `alignOffset` along its aligned end. */
function marginsOf(place: Placement): Record<LayerSide, number> {
  const side = place.side ?? "bottom";
  const align = place.align ?? "center";
  const gutter = place.collisionPadding ?? 0;
  const shift = place.alignOffset ?? 0;
  const margin: Record<LayerSide, number> = {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  };
  margin[OPPOSITE[side]] = place.sideOffset ?? 0;
  margin[side] = gutter;
  const [crossStart, crossEnd]: LayerSide[] = BLOCK.has(side)
    ? ["left", "right"]
    : ["top", "bottom"];
  margin[crossStart] = align === "start" ? shift : gutter;
  margin[crossEnd] = align === "end" ? shift : gutter;
  return margin;
}

/**
 * Where it may stand when its own place does not hold it, at most five
 * (Chromium tries no more: a sixth never stood). Beside the anchor: its
 * other side and its other end; then spanning the viewport across, centred
 * on the anchor and kept inside it, its height capped (the rule's bottom,
 * flipped for the top), `most-block-size` trying the side with more room
 * first.
 */
function blockFallbacks(place: Placement, side: LayerSide): string[] {
  const near = side === "bottom" ? "" : "flip-block ";
  const far = side === "bottom" ? "flip-block " : "";
  const centred = (place.align ?? "center") === "center";
  if (place.fixedSide) {
    return [...(centred ? [] : ["flip-inline"]), `${near}--kit-span-block`];
  }
  return [
    "flip-block",
    ...(centred ? [] : ["flip-inline", "flip-block flip-inline"]),
    `${near}--kit-span-block`,
    `${far}--kit-span-block`,
  ];
}

/**
 * Beside the anchor across (a submenu, a tooltip at its side): its other
 * side; then centred along the anchor and kept inside the viewport, its
 * height capped, on either side; where neither side holds it, below its
 * anchor or above it (`above`), spanning the viewport across.
 */
function inlineFallbacks(place: Placement, side: LayerSide): string[] {
  const near = side === "right" ? "" : "flip-inline ";
  const far = side === "right" ? "flip-inline " : "";
  const below = ["--kit-below", "flip-block --kit-below"];
  return [
    ...(place.fixedSide ? [] : ["flip-inline"]),
    `${near}--kit-span-inline`,
    ...(place.fixedSide ? [] : [`${far}--kit-span-inline`]),
    ...(place.below && place.above ? below.reverse() : []),
    ...(place.below && !place.above ? below : []),
  ];
}

/**
 * The layer's own placement, as inline style: its area beside the anchor,
 * its margins and the fallbacks it tries, in order. The `@position-try`
 * rules are design.css's; they read `--kit-offset` and `--kit-gutter`.
 */
function placeStyle(place: Placement): Record<string, string> {
  const side = place.side ?? "bottom";
  const align = place.align ?? "center";
  const block = BLOCK.has(side);
  // The other axis: a start-aligned layer spans from the anchor's start on
  // (its start on the anchor's), an end-aligned one to its end.
  const span = block
    ? { start: "span-right", center: "span-all", end: "span-left" }[align]
    : { start: "span-bottom", center: "span-all", end: "span-top" }[align];
  const margin = marginsOf(place);
  const fallbacks = block
    ? blockFallbacks(place, side)
    : inlineFallbacks(place, side);
  return {
    "position-area": `${side} ${span}`,
    "margin-top": `${margin.top}px`,
    "margin-right": `${margin.right}px`,
    "margin-bottom": `${margin.bottom}px`,
    "margin-left": `${margin.left}px`,
    "position-try-fallbacks": fallbacks.join(", "),
    "position-try-order":
      block && !place.fixedSide ? "most-block-size" : "normal",
    "--kit-offset": `${place.sideOffset ?? 0}px`,
    "--kit-gutter": `${place.collisionPadding ?? 0}px`,
  };
}

/* ------------------------------------------------------- read at an open */

/**
 * The side the drawn layer stands on of its drawn anchor, the axis of the
 * one it would take looked at first (a 0×0 point is clear of a layer on
 * two sides at once); its preferred one where it overlaps.
 */
function sideOf(layer: DOMRect, anchor: DOMRect, wanted: LayerSide): LayerSide {
  const near = 1;
  const clear: Record<LayerSide, boolean> = {
    bottom: layer.top >= anchor.bottom - near,
    top: layer.bottom <= anchor.top + near,
    right: layer.left >= anchor.right - near,
    left: layer.right <= anchor.left + near,
  };
  const order: LayerSide[] = BLOCK.has(wanted)
    ? ["bottom", "top", "right", "left"]
    : ["right", "left", "bottom", "top"];
  return order.find((one) => clear[one]) ?? wanted;
}

/** Which of its ends the drawn layer lines up with its anchor's, along the side it stands on. */
function alignOf(layer: DOMRect, anchor: DOMRect, side: LayerSide): LayerAlign {
  const near = 1;
  const block = BLOCK.has(side);
  const [ls, le, as, ae] = block
    ? [layer.left, layer.right, anchor.left, anchor.right]
    : [layer.top, layer.bottom, anchor.top, anchor.bottom];
  if (Math.abs(ls - as) <= near) {
    return "start";
  }
  if (Math.abs(le - ae) <= near) {
    return "end";
  }
  return "center";
}

/** The anchor's centre, on the layer's edge that faces it, in the layer's own box (px), within it. */
function meetOf(layer: DOMRect, anchor: DOMRect, side: LayerSide) {
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);
  const x = clamp(anchor.left + anchor.width / 2 - layer.left, layer.width);
  const y = clamp(anchor.top + anchor.height / 2 - layer.top, layer.height);
  switch (side) {
    case "bottom":
      return { x, y: 0, along: x };
    case "top":
      return { x, y: layer.height, along: x };
    case "right":
      return { x: 0, y, along: y };
    case "left":
      return { x: layer.width, y, along: y };
  }
}

/** Where it meets its anchor, written on the surface: its transform-origin and its arrow's place. */
function meetAt(
  surface: HTMLElement,
  meet: { along: number; x: number; y: number }
): void {
  surface.style.setProperty("--kit-origin", `${meet.x}px ${meet.y}px`);
  surface.style.setProperty("--kit-arrow-at", `${meet.along}px`);
}

/** The point of the anchor its layer stands on: the middle of the side it faces. */
const facing: Record<LayerSide, { x: number; y: number }> = {
  bottom: { x: 0.5, y: 1 },
  top: { x: 0.5, y: 0 },
  right: { x: 1, y: 0.5 },
  left: { x: 0, y: 0.5 },
};

/** The box moved to a new anchor, gliding there from where it was drawn, on the compositor. */
function glideFrom(layer: HTMLElement, from: DOMRect): void {
  const to = layer.getBoundingClientRect();
  const x = from.left - to.left;
  const y = from.top - to.top;
  if (Math.abs(x) >= 0.5 || Math.abs(y) >= 0.5) {
    layer.animate(
      [{ transform: `translate(${x}px, ${y}px)` }, { transform: "none" }],
      { duration: dur("--duration-slow"), easing: ease("--ease-drawer") }
    );
  }
}

/** The name moved from one anchor to the next. */
function rename(
  from: Anchorable | null,
  to: Anchorable | null,
  name: string
): void {
  if (from) {
    nameOff(from, name);
  }
  if (to) {
    nameOn(to, name);
  }
}

/** An element a site names: a selector is looked up. */
const found = (at: Element | string): Element | null =>
  typeof at === "string" ? document.querySelector(at) : at;

/**
 * The layer's attachment, on its fixed box round the surface: names its
 * anchor, writes where it stands, and reads the side it took at each open.
 * A layer that glides between anchors while open (`data-anchor-glide` on
 * the box, the session card between tabs) moves to the new one from where
 * it was drawn, on the compositor.
 */
function anchored(placement: () => Placement): Attachment<HTMLElement> {
  return (layer) => {
    const name = anchorName(KIND);
    layer.style.setProperty("position-anchor", name);
    let anchor: Anchorable | null = null;
    let point: HTMLElement | null = null;
    let proxy: {
      box: HTMLElement;
      drop: () => void;
      x: Element;
      y: Element;
    } | null = null;
    let spot: {
      box: HTMLElement;
      drop: () => void;
      move: (at: AnchorSpot) => void;
      within: Element;
    } | null = null;
    let frame = 0;
    let wasOpen = false;
    /** The side it took at its last placing. */
    let took: LayerSide | null = null;

    const hold = (next: Element | null, glide = false) => {
      const el = next && anchorable(next) ? next : null;
      if (el === anchor) {
        return;
      }
      const from =
        glide && anchor && motionOk.current
          ? layer.getBoundingClientRect()
          : null;
      rename(anchor, el, name);
      anchor = el;
      if (from && el) {
        glideFrom(layer, from);
      }
    };

    /** The box on a spot inside an element, moved to where the spot is now. */
    const onSpot = (at: AnchorSpot): Element | null => {
      if (!anchorable(at.within)) {
        return null;
      }
      if (spot?.within !== at.within) {
        spot?.drop();
        spot = { ...makeSpot(layer, at.within), within: at.within };
      }
      spot.move(at);
      return spot.box;
    };

    /** The box across one element and along another. */
    const onPair = (at: AnchorPair): Element | null => {
      const x = found(at.x);
      const y = found(at.y);
      if (!(x && y && anchorable(x) && anchorable(y))) {
        return null;
      }
      if (proxy?.x !== x || proxy.y !== y) {
        proxy?.drop();
        proxy = { ...makeProxy(layer, x, y), x, y };
      }
      return proxy.box;
    };

    /**
     * The anchor a site names, as an element: a selector is looked up, and
     * a spot or a pair stands a box of its own (`makeSpot`, `makeProxy`).
     * None named (or none yet): its trigger, as bits-ui stood it.
     */
    const given = (place: Placement): Element | null | undefined => {
      const at = place.customAnchor;
      if (at === undefined || at === null) {
        return undefined;
      }
      if (typeof at === "string" || at instanceof Element) {
        return found(at);
      }
      return "within" in at ? onSpot(at) : onPair(at);
    };

    /** Its anchor named, now: the pointer's point, the site's element, or its trigger. */
    const seek = () => {
      const place = untrack(placement);
      const surface = surfaceOf(layer);
      const named = given(place);
      if (place.atPointer) {
        point ??= makePoint(layer);
        hold(point);
      } else if (named === undefined) {
        hold(surface ? triggerOf(surface) : null);
      } else {
        hold(named);
      }
    };

    /**
     * Read once the browser has placed it: where it stands of its anchor,
     * written on the surface; and, entering, the surface let go of its
     * closed look into its open one from there.
     */
    const measure = (entering: boolean) => {
      frame = 0;
      const place = untrack(placement);
      const surface = surfaceOf(layer);
      // Its trigger may name it only once the open has flushed.
      seek();
      if (!(anchor && surface)) {
        delete layer.dataset.placing;
        return;
      }
      const wanted = place.side ?? "bottom";
      const at = anchor.getBoundingClientRect();
      if (place.below) {
        // Where neither side holds it, it hangs on the anchor's side of the
        // screen with more room: read here, at the open.
        const above = at.top + at.height / 2 > innerHeight / 2;
        layer.style.setProperty(
          "position-try-fallbacks",
          placeStyle({ ...place, above })["position-try-fallbacks"]
        );
      }
      layer.style.setProperty("--kit-anchor-width", `${at.width}px`);
      layer.style.setProperty("--kit-anchor-height", `${at.height}px`);
      // Where anchors stand as laid out, the layer moves by its anchor's
      // transform: measured here, at the open, never on a frame of its own.
      const [shift] = transformShifts(
        [{ anchor, name, point: facing[wanted] }],
        () => document.body
      );
      const by = shiftTranslate(shift);
      if (layer.style.translate !== by) {
        layer.style.translate = by;
      }
      const box = layer.getBoundingClientRect();
      const side = sideOf(box, at, wanted);
      took = side;
      surface.dataset.side = side;
      surface.dataset.align = alignOf(box, at, side);
      meetAt(surface, meetOf(box, at, side));
      if (entering) {
        // Its closed look takes the side before it opens from it.
        getComputedStyle(surface).getPropertyValue("translate");
        delete layer.dataset.placing;
      }
      layer.dispatchEvent(
        new CustomEvent<Placed>(PLACED, { detail: { box, side } })
      );
    };

    const ask = (entering: boolean) => {
      if (entering) {
        layer.dataset.placing = "";
        // Named as it opens, so it stands on its anchor from its first
        // frame, never where a fixed box with no anchor falls (under the
        // pointer that opened it, which then pressed outside it).
        seek();
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => measure(entering));
    };

    // Its place and its margins, as the site says them now.
    $effect(() => {
      const style = placeStyle(placement());
      for (const [property, value] of Object.entries(style)) {
        layer.style.setProperty(property, value);
      }
    });

    // The anchor the site names, again whenever it names another: a layer
    // standing open moves to it (gliding where its box asks) and reads its
    // side there.
    $effect(() => {
      const at = given(placement());
      if (at === undefined) {
        return;
      }
      untrack(() => {
        const was = anchor;
        hold(at, layer.hasAttribute("data-anchor-glide"));
        if (was && anchor && was !== anchor && wasOpen) {
          ask(false);
        }
      });
    });

    // Each open: placed, then its side read.
    const sync = () => {
      const open = isOpen(surfaceOf(layer));
      if (open && !wasOpen) {
        ask(true);
      }
      wasOpen = open;
    };
    // Its size changing while it stands open (a tooltip's words gliding to
    // the next item's, a list filtering): where it meets its anchor is read
    // again, on the layout that frame has just done; its side stays.
    const sized = frameObserver(null, {
      inside: () => {
        const surface = surfaceOf(layer);
        if (!(wasOpen && took && anchor && surface)) {
          return;
        }
        const side = took;
        const meet = meetOf(
          layer.getBoundingClientRect(),
          anchor.getBoundingClientRect(),
          side
        );
        return () => meetAt(surface, meet);
      },
    });
    sized.observe(layer);
    const states = new MutationObserver(sync);
    states.observe(layer, {
      attributes: true,
      attributeFilter: ["data-state"],
      childList: true,
      subtree: true,
    });
    sync();
    if (!wasOpen) {
      delete layer.dataset.placing;
    }

    return () => {
      cancelAnimationFrame(frame);
      sized.disconnect();
      states.disconnect();
      if (anchor) {
        nameOff(anchor, name);
      }
      anchor = null;
      if (point) {
        points.delete(point);
        point.remove();
      }
      proxy?.drop();
      spot?.drop();
    };
  };
}

/**
 * The props of a layer's fixed box (`data-kit-layer`), its anchoring
 * attached: spread on the element round the surface, as bits-ui's own
 * wrapper's were. It stands in its surface's closed look until it is placed
 * (`data-placing`).
 */
export function layerProps(
  placement: () => Placement
): HTMLAttributes<HTMLDivElement> {
  // Where the pointer asks for a menu is heard before its first ask.
  if (browser && untrack(placement).atPointer) {
    hearPointer();
  }
  return {
    "data-kit-layer": "",
    "data-placing": "",
    [createAttachmentKey()]: anchored(placement),
  };
}
