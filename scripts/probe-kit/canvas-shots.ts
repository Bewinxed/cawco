/**
 * Captures of a component canvas's frames, for a reviewer who reads them
 * and never the page: each one exactly the frame it is named for, in the
 * scheme it is named for, drawn and settled. Nothing else in the kit
 * proves a picture shows what its name says, and the canvas makes that
 * easy to get wrong: its world is one transformed, clipped layer, so a
 * frame scrolled "into view" can stand outside the canvas's box, and a
 * shot of its rect then holds the page's chrome, another frame, or one
 * colour (approval-card's first captures: dark files byte-identical to
 * light ones, whole groups of stories one picture, 18 uniform files).
 *
 * Each shot, in the page that holds its frame:
 *  1. posed, settled and pictured by agent frame-picture.ts, the one path
 *     every picture of a frame takes (the daemon's render too): the window
 *     grown by the room the canvas lacks, the frame at its own size whatever
 *     the window's width, its fonts and animations settled, its body's own
 *     rect shot, refused unless whole in the canvas and its CSS size times
 *     the device's scale (a refusal is this shot's fault);
 *  2. read from the DOM before shooting: the frame's story, file, width and
 *     scheme are the ones named, every part of it (shadow roots too) draws
 *     in its scheme, it holds what the shot asks, its images loaded, and
 *     every point of a grid over it hits its own body, so nothing (the
 *     chrome, a label, another frame) covers it;
 *  3. its pixels read back: not one colour, and at the grid's points the
 *     colour its DOM paints there.
 * Over the set: no two files are byte-identical unless their frames drew
 * the same DOM (a light file the same as its dark twin, or one story's the
 * same as another's that says other words, is a picture of the wrong
 * frame). A shot that fails any of these fails the leg `checkShots` names.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ElementHandle, Page } from "playwright-core";
import { PNG } from "pngjs";
import {
  FramePictureRefusal,
  framePicture,
  poseFrame,
} from "../../packages/agent/src/frame-picture";
import type { Kit, Theme } from "./kit";

/** One frame to capture, and where its png goes. */
export interface Shot {
  /** The states file, as the canvas names it (`?file=`). */
  file: string;
  /** What the frame's body must hold when shot (a state with a window of time: an Undo that leaves). */
  holds?: string;
  /** Absolute path of the png. */
  path: string;
  scheme: Theme;
  story: string;
  /** The column's width: the frame's `data-cawco-width` (`own` where the story takes its own form, as an embed's frames do). */
  width: number | "own";
}

/** What one capture showed, and what was wrong with it. */
export interface ShotRead extends Shot {
  /**
   * What the frame drew, as its DOM says: the md5 of its scheme, its own
   * size and its markup with each mount's own ids left out. Two frames that
   * share it draw the same picture; two that don't, can't.
   */
  drawn: string;
  faults: string[];
  /** The png's md5. */
  hash: string;
  /** The frame's label words, as the page drew them over the frame. */
  label: string;
  /** Pixels, the share of the commonest colour, and how many grid points matched their DOM's paint. */
  stats: { height: number; matched: string; top: number; width: number };
}

/** How long a frame may take to have its room and settle. */
const POSE_MS = 10_000;
/** Points per side of the grid each shot is hit-tested and colour-read on. */
const GRID = 5;
/** A pixel matches its DOM's paint within this much per channel (antialiasing, a shadow's edge). */
const TOLERANCE = 10;
/** At least this share of grid points show the colour their DOM paints. */
const MATCH_SHARE = 0.6;
/** A capture is one colour when its commonest covers this share of it. */
const UNIFORM = 0.99;

/** The rest frame of `shot`, by its own data attributes. */
const frameSelector = (shot: Omit<Shot, "path">) =>
  `.cawco-frame[data-cawco-file="${shot.file}"][data-cawco-story="${shot.story}"][data-cawco-width="${shot.width}"][data-cawco-scheme="${shot.scheme}"][data-cawco-interaction="rest"]`;

/** The frame's key, in the page. */
const keyOf = (selector: string): string | null =>
  document.querySelector<HTMLElement>(selector)?.dataset.cawcoKey ?? null;

interface Painted {
  /** Where it stands on the page, CSS px: what the picture's clip is measured on. */
  page: { x: number; y: number };
  /** The colour the DOM paints at the point, 0–255 sRGB, a pseudo-element's surface included, or null where it can't be told (an image, a gradient, text on it, a colour seen through, a pseudo-element whose box or paint order no read gives). */
  rgb: [number, number, number] | null;
  /** Where it stands in the frame's body, CSS px, for the fault's words. */
  x: number;
  y: number;
}

/** What `identityOf` read. */
type Seen = NonNullable<ReturnType<typeof identityOf>>;

/** What the DOM says of the posed frame before it is shot: whose it is, its scheme, what it holds, whether its images loaded. In the page. */
function identityOf(args: { selector: string; holds: string | null }) {
  const frame = document.querySelector<HTMLElement>(args.selector);
  const body = frame?.querySelector<HTMLElement>(":scope > .cawco-frame-body");
  if (!(frame && body)) {
    return null;
  }
  // The markup without what differs per mount alone: ids and the
  // references to them, and comments (the framework's anchors).
  const copy = body.cloneNode(true) as HTMLElement;
  for (const el of copy.querySelectorAll("*")) {
    for (const name of [
      "id",
      "for",
      "aria-labelledby",
      "aria-describedby",
      "aria-controls",
      "aria-owns",
    ]) {
      el.removeAttribute(name);
    }
  }
  const comments = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
  const dropped: Node[] = [];
  for (let node = comments.nextNode(); node; node = comments.nextNode()) {
    dropped.push(node);
  }
  for (const node of dropped) {
    node.parentNode?.removeChild(node);
  }
  return {
    drawn: `${getComputedStyle(body).colorScheme}|${body.offsetWidth}x${body.offsetHeight}|${copy.innerHTML}`,
    story: frame.dataset.cawcoStory ?? "",
    file: frame.dataset.cawcoFile ?? "",
    width: frame.dataset.cawcoWidth ?? "",
    scheme: frame.dataset.cawcoScheme ?? "",
    colorScheme: getComputedStyle(body).colorScheme,
    label: frame.querySelector(".cawco-frame-words")?.textContent?.trim() ?? "",
    held: args.holds === null || body.querySelector(args.holds) !== null,
    unloaded: [...body.querySelectorAll("img")]
      .filter((img) => !(img.complete && img.naturalWidth > 0))
      .map((img) => img.src.slice(0, 120)),
  };
}

/**
 * A grid of points over the frame's body: any where something else is on
 * top (the canvas's chrome, a label, another frame), and at each of the
 * rest the flat colour the DOM paints there. In the page.
 */
function gridOf(args: { selector: string; grid: number }) {
  const body = document.querySelector<HTMLElement>(
    `${args.selector} > .cawco-frame-body`
  );
  if (!body) {
    return { covered: ["no body"], points: [] as Painted[] };
  }
  const rect = body.getBoundingClientRect();
  const paint = document
    .createElement("canvas")
    .getContext("2d", { willReadFrequently: true });
  /** A CSS colour as 0–255 sRGB with its alpha, through the 2D context. */
  const rgba = (color: string): number[] => {
    if (!paint) {
      return [0, 0, 0, 0];
    }
    paint.clearRect(0, 0, 1, 1);
    paint.fillStyle = color;
    paint.fillRect(0, 0, 1, 1);
    return [...paint.getImageData(0, 0, 1, 1).data];
  };
  // A text node's glyphs cover part of its box: a point on words is not read.
  const onText = (hit: Element) =>
    [...hit.childNodes].some(
      (node) =>
        node.nodeType === Node.TEXT_NODE &&
        (node.textContent ?? "").trim() !== ""
    );
  /**
   * Whether a box's mask draws the point at page (x, y) through: never
   * where it has none; under the house edge fade (edge-fade.css) within its
   * fades alone, each as long as its own `--fade-start` and `--fade-end` (a
   * cap only shortens one): `kit-edge-fade` (a wide embed's frame:
   * runtime.ts `fitToEmbed`) at its left and right, `kit-edge-fade-block`
   * at its top and its foot, whose fade ends `--fade-inset-end` short of
   * the box and leaves that band clear; everywhere under any other mask.
   */
  const maskedAt = (
    at: Element,
    style: CSSStyleDeclaration,
    x: number,
    y: number
  ) => {
    if (style.maskImage === "none") {
      return false;
    }
    const fadeOf = (property: string) =>
      Number.parseFloat(style.getPropertyValue(property));
    const start = fadeOf("--fade-start");
    const end = fadeOf("--fade-end");
    const inline = at.classList.contains("kit-edge-fade");
    const block = at.classList.contains("kit-edge-fade-block");
    if (!(
      (inline || block) &&
      Number.isFinite(start) &&
      Number.isFinite(end)
    )) {
      return true;
    }
    const box = at.getBoundingClientRect();
    const zoom = (at as HTMLElement).currentCSSZoom;
    if (inline) {
      return x < box.left + start * zoom || x >= box.right - end * zoom;
    }
    const inset = fadeOf("--fade-inset-end") || 0;
    return y < box.top + start * zoom || y >= box.bottom - (inset + end) * zoom;
  };
  /** Drawn through, or mixed with what is under it: a box not at full opacity, filtered, blended or masked at page (x, y), here or out to the page. */
  const mixed = (hit: Element, x: number, y: number) => {
    for (let at: Element | null = hit; at; at = at.parentElement) {
      const style = getComputedStyle(at);
      if (
        Number(style.opacity) < 1 ||
        style.filter !== "none" ||
        style.mixBlendMode !== "normal" ||
        maskedAt(at, style, x, y)
      ) {
        return true;
      }
    }
    return false;
  };
  /** Draws anything where it stands: a background, a border, a shadow, an image or words, and is neither hidden nor transparent, here or in what holds it. */
  const paints = (el: Element) => {
    if (
      !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    ) {
      return false;
    }
    const style = getComputedStyle(el);
    return (
      rgba(style.backgroundColor)[3] !== 0 ||
      style.backgroundImage !== "none" ||
      style.borderStyle !== "none" ||
      style.boxShadow !== "none" ||
      el instanceof SVGElement ||
      el instanceof HTMLImageElement ||
      el instanceof HTMLCanvasElement ||
      onText(el)
    );
  };
  /** The painting boxes of `els`, each with where it stands on the page. */
  const boxesOf = (els: Element[]) =>
    els.filter(paints).map((el) => ({ el, box: el.getBoundingClientRect() }));
  const boxAt = (
    boxes: { el: Element; box: DOMRect }[],
    x: number,
    y: number
  ) =>
    boxes.find(
      ({ box }) =>
        x >= box.left && x < box.right && y >= box.top && y < box.bottom
    )?.el ?? null;
  /**
   * What the body paints that hit-testing passes through: `pointer-events:
   * none` and inert boxes (HTML's inert is hit-tested as if it had none). A
   * point on one is not read: the hit is under it.
   */
  const unhit = boxesOf(
    [...body.querySelectorAll("*")].filter(
      (el) =>
        el.closest("[inert]") !== null ||
        getComputedStyle(el).pointerEvents === "none"
    )
  );
  /**
   * What the canvas's chrome paints (stage-host canvas chrome.ts: one shadow
   * host over the whole page, above everything, that hit-testing passes
   * where its parts don't take the pointer). A point under one is covered.
   */
  const chrome = document.getElementById("cawco-chrome")?.shadowRoot;
  const over = chrome ? boxesOf([...chrome.querySelectorAll("*")]) : [];
  /** Whether a contain value makes a box its absolute children's containing block and a stacking context (paint, layout, strict, content). */
  const contains = (value: string) =>
    ["paint", "layout", "strict", "content"].some((one) => value.includes(one));
  /** A length in CSS px, NaN where it isn't one ("auto", a percentage). */
  const lengthOf = (value: string) =>
    value.endsWith("px") ? Number.parseFloat(value) : Number.NaN;
  /** The sum of some lengths in CSS px. */
  const sumOf = (...values: string[]) =>
    values.reduce((all, one) => all + lengthOf(one), 0);
  /** A box's border-box width and height in its own CSS px, from its used size (a positioned or block box's computed width is its used one). */
  const sizeOf = (style: CSSStyleDeclaration) => {
    const border = style.boxSizing === "border-box";
    return {
      w:
        lengthOf(style.width) +
        (border
          ? 0
          : sumOf(
              style.paddingLeft,
              style.paddingRight,
              style.borderLeftWidth,
              style.borderRightWidth
            )),
      h:
        lengthOf(style.height) +
        (border
          ? 0
          : sumOf(
              style.paddingTop,
              style.paddingBottom,
              style.borderTopWidth,
              style.borderBottomWidth
            )),
    };
  };
  /** Whether a box starts a stacking context (CSS 2.1 Appendix E, CSS Positioned Layout): what a child's negative z-index paints above. */
  const stacks = (style: CSSStyleDeclaration) =>
    (style.position !== "static" && style.zIndex !== "auto") ||
    Number(style.opacity) < 1 ||
    style.transform !== "none" ||
    style.filter !== "none" ||
    style.isolation === "isolate" ||
    style.mixBlendMode !== "normal" ||
    contains(style.contain);
  /** Drawn through or moved: what leaves a box's own fill unreadable at a point. */
  const throughOf = (style: CSSStyleDeclaration) =>
    Number(style.opacity) < 1 ||
    style.filter !== "none" ||
    style.backdropFilter !== "none" ||
    style.mixBlendMode !== "normal" ||
    style.transform !== "none" ||
    style.clipPath !== "none" ||
    style.maskImage !== "none" ||
    style.backgroundImage !== "none" ||
    style.boxShadow.includes("inset");
  const SIDES = ["top", "right", "bottom", "left"] as const;
  /** A side's border width in CSS px, 0 where it draws none. */
  const borderOf = (
    style: CSSStyleDeclaration,
    side: (typeof SIDES)[number]
  ) =>
    style.getPropertyValue(`border-${side}-style`) === "none"
      ? 0
      : lengthOf(style.getPropertyValue(`border-${side}-width`)) || 0;
  /** A box drawn in the page: its corner and size, page px. */
  interface Drawn {
    h: number;
    left: number;
    top: number;
    w: number;
  }
  /**
   * An absolute pseudo-element's box in the page, null where it can't be
   * told: `el` must be its containing block (positioned, transformed,
   * filtered or contained), and its place is its used insets and margins
   * from `el`'s padding box, its size its used width and height, in `el`'s
   * own CSS px, scaled by how wide `el` is drawn (CSS zoom, the canvas's
   * own scale).
   */
  const pseudoBoxOf = (
    own: CSSStyleDeclaration,
    edge: DOMRect,
    style: CSSStyleDeclaration
  ): Drawn | null => {
    const held =
      own.position !== "static" ||
      own.transform !== "none" ||
      own.filter !== "none" ||
      contains(own.contain);
    const ownSize = sizeOf(own);
    const scale = ownSize.w > 0 ? edge.width / ownSize.w : Number.NaN;
    const size = sizeOf(style);
    const dx = lengthOf(style.left) + lengthOf(style.marginLeft);
    const dy = lengthOf(style.top) + lengthOf(style.marginTop);
    if (!(
      held &&
      style.position === "absolute" &&
      [scale, size.w, size.h, dx, dy].every(Number.isFinite)
    )) {
      return null;
    }
    return {
      left: edge.left + (lengthOf(own.borderLeftWidth) + dx) * scale,
      top: edge.top + (lengthOf(own.borderTopWidth) + dy) * scale,
      w: size.w * scale,
      h: size.h * scale,
    };
  };
  /** Whether a point (dx, dy) inside a drawn box lies outside one of its rounded corners' curves, where the box paints nothing. */
  const cutAt = (
    style: CSSStyleDeclaration,
    box: Drawn,
    scale: number,
    dx: number,
    dy: number
  ) =>
    (
      [
        [style.borderTopLeftRadius, dx, dy],
        [style.borderTopRightRadius, box.w - dx, dy],
        [style.borderBottomRightRadius, box.w - dx, box.h - dy],
        [style.borderBottomLeftRadius, dx, box.h - dy],
      ] as const
    ).some(([value, across, down]) => {
      const [x0 = "0px", y0 = x0] = value.split(" ");
      const radius = (part: string, side: number) =>
        part.endsWith("%")
          ? (Number.parseFloat(part) / 100) * side
          : Number.parseFloat(part) * scale;
      const rx = radius(x0, box.w);
      const ry = radius(y0, box.h);
      return (
        rx > 0 &&
        ry > 0 &&
        across < rx &&
        down < ry &&
        ((rx - across) / rx) ** 2 + ((ry - down) / ry) ** 2 >= 1
      );
    });
  /** A pseudo-element's own fill where its box holds the point: its flat colour, "none" where it has none, null where it is seen through or may lie under `own`'s background (a negative z-index with no stacking context of `own`'s, CSS 2.1 Appendix E). */
  const fillOf = (
    style: CSSStyleDeclaration,
    own: CSSStyleDeclaration
  ): [number, number, number] | "none" | null => {
    const [r = 0, g = 0, b = 0, a = 0] = rgba(style.backgroundColor);
    if (a === 0) {
      return "none";
    }
    if (Number.parseInt(style.zIndex, 10) < 0 && !stacks(own)) {
      return null;
    }
    return a === 255 ? [r, g, b] : null;
  };
  /** Whether a pseudo-element is drawn and paints anything over its box: a fill, an image, a border or a shadow. */
  const paintsAny = (style: CSSStyleDeclaration) =>
    !(["none", "normal"].includes(style.content) || style.display === "none") &&
    (rgba(style.backgroundColor)[3] !== 0 ||
      style.backgroundImage !== "none" ||
      style.boxShadow !== "none" ||
      SIDES.some((side) => borderOf(style, side) > 0));
  /** Whether a point (dx, dy) inside a drawn box stands on its border. */
  const onBorderAt = (
    style: CSSStyleDeclaration,
    box: Drawn,
    scale: number,
    dx: number,
    dy: number
  ) => {
    const band = (side: (typeof SIDES)[number]) =>
      borderOf(style, side) * scale;
    return (
      dx < band("left") ||
      dy < band("top") ||
      box.w - dx <= band("right") ||
      box.h - dy <= band("bottom")
    );
  };
  /**
   * What one pseudo-element of `el` paints at (x, y): its flat colour,
   * "none" where it paints nothing there, null where that can't be told
   * (its box unknown, a shadow that could reach the point, its border,
   * seen through or moved, or under a negative z-index `el`'s own
   * background may cover, CSS 2.1 Appendix E).
   */
  const onePseudoAt = (
    el: Element,
    pseudo: "::after" | "::before",
    x: number,
    y: number
  ): [number, number, number] | "none" | null => {
    const style = getComputedStyle(el, pseudo);
    if (!paintsAny(style)) {
      return "none";
    }
    const own = getComputedStyle(el);
    const box = pseudoBoxOf(own, el.getBoundingClientRect(), style);
    if (!box) {
      return null;
    }
    const scale = box.w / sizeOf(style).w;
    const dx = x - box.left;
    const dy = y - box.top;
    const inside = dx >= 0 && dy >= 0 && dx < box.w && dy < box.h;
    if (!inside || cutAt(style, box, scale, dx, dy)) {
      // Where its box paints nothing only its shadow could reach.
      return style.boxShadow === "none" ? "none" : null;
    }
    return onBorderAt(style, box, scale, dx, dy) || throughOf(style)
      ? null
      : fillOf(style, own);
  };
  /**
   * What a box's ::after or ::before paints at (x, y) in the page, the one
   * drawn last first: its flat colour, "none" where neither paints there,
   * null where that can't be told. A surface drawn on a pseudo-element (the
   * kit's sheets: drawer-content.svelte) stands over its box's own
   * background.
   */
  const pseudoAt = (
    el: Element,
    x: number,
    y: number
  ): [number, number, number] | "none" | null => {
    const after = onePseudoAt(el, "::after", x, y);
    return after === "none" ? onePseudoAt(el, "::before", x, y) : after;
  };
  /** `value` split at `sep` outside any parentheses, each part trimmed: a computed shadow's layers at ",", a layer's words at " ". */
  const partsOf = (value: string, sep: string) => {
    const parts: string[] = [];
    let depth = 0;
    let from = 0;
    for (let i = 0; i <= value.length; i += 1) {
      const c = value[i];
      depth += Number(c === "(") - Number(c === ")");
      if (i === value.length || (c === sep && depth === 0)) {
        parts.push(value.slice(from, i).trim());
        from = i + 1;
      }
    }
    return parts.filter((one) => one !== "");
  };
  /** A box's outer shadows: each layer's offsets, blur and spread in its own CSS px (the computed value: colour, then lengths, then inset if inner). */
  const outerShadowsOf = (style: CSSStyleDeclaration) =>
    style.boxShadow === "none"
      ? []
      : partsOf(style.boxShadow, ",")
          .map((layer) => partsOf(layer, " "))
          .filter((words) => !words.includes("inset"))
          .map((words) => {
            const [x = 0, y = 0, blur = 0, spread = 0] = words
              .filter((word) => word.endsWith("px"))
              .map(Number.parseFloat);
            return { blur, spread, x, y };
          });
  /**
   * Where one box's outer shadows reach on the page, outside the box: the
   * box (`drawn`, page px, its lengths `scale` page px each) moved by each
   * layer's offset, grown by its spread and its blur's reach. The blur is a
   * Gaussian of σ half its radius (CSS Backgrounds 3, box-shadow); at 3σ,
   * 1.5 radii, what is left of it is under one level of eight bits.
   */
  const castOf = (style: CSSStyleDeclaration, drawn: Drawn, scale: number) =>
    outerShadowsOf(style).map((one) => {
      const grow = (one.spread + 1.5 * one.blur) * scale;
      return {
        left: drawn.left + one.x * scale - grow,
        right: drawn.left + drawn.w + one.x * scale + grow,
        top: drawn.top + one.y * scale - grow,
        bottom: drawn.top + drawn.h + one.y * scale + grow,
      };
    });
  /** A box drawn in the page, from its rect. */
  const drawnOf = (box: DOMRect): Drawn => ({
    h: box.height,
    left: box.left,
    top: box.top,
    w: box.width,
  });
  /**
   * What the body's boxes and their pseudo-elements cast past their own
   * edges: each outer shadow's reach, outside the box's painted shape (its
   * rounded corners' curves included, where the shadow shows). A point
   * there is mixed with what is under it, so it is not read: a card's tile
   * shadow darkens the gap beside it, which no box there paints. A
   * pseudo-element whose box can't be told casts from its host's box out,
   * its reach its own.
   */
  const casts = [...body.querySelectorAll("*")].flatMap((el) => {
    if (
      !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    ) {
      return [];
    }
    const own = getComputedStyle(el);
    const edge = el.getBoundingClientRect();
    const ownWide = sizeOf(own).w;
    const ownScale =
      ownWide > 0 ? edge.width / ownWide : (el as HTMLElement).currentCSSZoom;
    const all = [{ drawn: drawnOf(edge), scale: ownScale, style: own }];
    for (const pseudo of ["::before", "::after"] as const) {
      const style = getComputedStyle(el, pseudo);
      if (paintsAny(style) && style.boxShadow !== "none") {
        const box = pseudoBoxOf(own, edge, style);
        all.push({
          drawn: box ?? drawnOf(edge),
          scale: box ? box.w / sizeOf(style).w : ownScale,
          style,
        });
      }
    }
    return all.flatMap(({ drawn, scale, style }) =>
      castOf(style, drawn, scale).map((reach) => ({
        drawn,
        reach,
        scale,
        style,
      }))
    );
  });
  const castAt = (x: number, y: number) =>
    casts.some(({ drawn, reach, scale, style }) => {
      const dx = x - drawn.left;
      const dy = y - drawn.top;
      const inside =
        dx >= 0 &&
        dy >= 0 &&
        dx < drawn.w &&
        dy < drawn.h &&
        !cutAt(style, drawn, scale, dx, dy);
      return (
        !inside &&
        x >= reach.left &&
        x < reach.right &&
        y >= reach.top &&
        y < reach.bottom
      );
    });
  /** The flat colour under a hit at (x, y): the nearest box out from it with an opaque background, its own or a pseudo-element's, and no image; null where that can't be told. */
  const paintedAt = (
    hit: Element,
    x: number,
    y: number
  ): [number, number, number] | null => {
    if (mixed(hit, x, y)) {
      return null;
    }
    for (
      let at: Element | null = hit;
      at && body.contains(at);
      at = at.parentElement
    ) {
      const pseudo = pseudoAt(at, x, y);
      if (pseudo !== "none") {
        return pseudo;
      }
      const style = getComputedStyle(at);
      const [r = 0, g = 0, b = 0, a = 0] = rgba(style.backgroundColor);
      if (style.backgroundImage !== "none" || (a > 0 && a < 255)) {
        return null;
      }
      if (a === 255) {
        return [r, g, b];
      }
    }
    return null;
  };
  const name = (el: Element | null) =>
    el
      ? `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`
      : "nothing";
  const covered: string[] = [];
  const points: Painted[] = [];
  // A frame that scrolls its story sideways (an embed's story too wide to fit at 10px words) shows what its scrollport holds: the grid reads that part.
  const holder = body.parentElement;
  const port =
    holder && getComputedStyle(holder).overflowX !== "visible"
      ? holder.getBoundingClientRect()
      : null;
  const left = port ? Math.max(rect.left, port.left) : rect.left;
  const wide = (port ? Math.min(rect.right, port.right) : rect.right) - left;
  for (let at = 0; at < args.grid * args.grid; at += 1) {
    const x =
      left -
      rect.left +
      ((wide - 4) * ((at % args.grid) + 0.5)) / args.grid +
      2;
    const y =
      ((rect.height - 4) * (Math.floor(at / args.grid) + 0.5)) / args.grid + 2;
    const chromed = boxAt(over, rect.left + x, rect.top + y);
    if (chromed) {
      covered.push(
        `(${Math.round(x)},${Math.round(y)}) is the canvas chrome's ${name(chromed)}`
      );
      continue;
    }
    const hit = document.elementFromPoint(rect.left + x, rect.top + y);
    if (hit && body.contains(hit)) {
      const page = { x: rect.left + x, y: rect.top + y };
      points.push({
        page,
        rgb:
          onText(hit) || boxAt(unhit, page.x, page.y) || castAt(page.x, page.y)
            ? null
            : paintedAt(hit, page.x, page.y),
        x,
        y,
      });
    } else {
      covered.push(`(${Math.round(x)},${Math.round(y)}) is ${name(hit)}`);
    }
  }
  return { covered, points };
}

/**
 * The parts of the frame drawn in another scheme than its own: an element,
 * a shadow root's included, whose `color-scheme` names another, or both
 * (which follows the OS), draws its light-dark() colours in that one,
 * whatever its frame says. In the page.
 */
function astrayOf(selector: string): string[] {
  const frame = document.querySelector<HTMLElement>(selector);
  const body = frame?.querySelector(":scope > .cawco-frame-body");
  if (!(frame && body)) {
    return [];
  }
  const os = matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
  const drawnIn = (named: string[]) => {
    if (named.includes("dark") && named.includes("light")) {
      return os;
    }
    return named.includes("dark") ? "dark" : "light";
  };
  const astray: string[] = [];
  const roots: (Element | ShadowRoot)[] = [body];
  for (let root = roots.pop(); root; root = roots.pop()) {
    for (const el of root.querySelectorAll("*")) {
      const named = getComputedStyle(el).colorScheme.split(" ");
      if (drawnIn(named) !== frame.dataset.cawcoScheme) {
        astray.push(
          `${el.tagName.toLowerCase()}.${[...el.classList].join(".")} (color-scheme ${named.join(" ")})`
        );
      }
      if (el.shadowRoot) {
        roots.push(el.shadowRoot);
      }
    }
  }
  return astray.slice(0, 3);
}

/** The share of a png's commonest colour. */
function topShareOf(png: PNG): number {
  const counts = new Map<string, number>();
  const { data } = png;
  for (let at = 0; at < data.length; at += 4) {
    const key = `${data[at]},${data[at + 1]},${data[at + 2]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Math.max(...counts.values()) / (data.length / 4);
}

/**
 * How many of the DOM's painted points the png shows in their colour, of
 * those read: each found in the png from the clip's own corner, which stands
 * on a whole device pixel at or before the body's (agent frame-picture.ts).
 */
function matchedOf(
  png: PNG,
  clip: { x: number; y: number },
  scale: number,
  points: Painted[]
): { hit: number; read: number; misses: string[] } {
  const read = points.filter((one) => one.rgb !== null);
  const misses: string[] = [];
  let hit = 0;
  for (const point of read) {
    const px = Math.floor((point.page.x - clip.x) * scale);
    const py = Math.floor((point.page.y - clip.y) * scale);
    const inside = px >= 0 && py >= 0 && px < png.width && py < png.height;
    const at = (py * png.width + px) * 4;
    const got = inside
      ? [png.data[at] ?? 0, png.data[at + 1] ?? 0, png.data[at + 2] ?? 0]
      : null;
    const want = point.rgb as [number, number, number];
    if (
      got?.every((value, c) => Math.abs(value - (want[c] ?? 0)) <= TOLERANCE)
    ) {
      hit += 1;
    } else if (misses.length < 3) {
      misses.push(
        `(${Math.round(point.x)},${Math.round(point.y)}) ${got ? `rgb(${got.join(",")})` : "outside the picture"} for rgb(${want.join(",")})`
      );
    }
  }
  return { hit, read: read.length, misses };
}

/** What the DOM, read before the shot, says is wrong with it. */
function faultsOf(
  shot: Shot,
  seen: Seen,
  grid: { covered: string[] },
  astray: string[]
): string[] {
  const named = `${shot.story}@${shot.width}/${shot.scheme} of ${shot.file}`;
  const on = `${seen.story}@${seen.width}/${seen.scheme} of ${seen.file}`;
  const rules: [boolean, string][] = [
    [on !== named, `on screen ${on}`],
    [
      seen.colorScheme !== shot.scheme,
      `its body draws in color-scheme ${seen.colorScheme}`,
    ],
    [astray.length > 0, `parts drawn in another scheme: ${astray.join("; ")}`],
    [
      grid.covered.length > 0,
      `covered: ${grid.covered.slice(0, 3).join("; ")}`,
    ],
    [!seen.held, `holds no ${shot.holds} when shot`],
    [
      seen.unloaded.length > 0,
      `images not loaded: ${seen.unloaded.join(", ")}`,
    ],
  ];
  return rules.filter(([broken]) => broken).map(([, words]) => words);
}

/** A refusal's words, for a shot's faults; anything else is no refusal and goes on up. */
const refused = (error: unknown): string => {
  if (error instanceof FramePictureRefusal) {
    return error.message;
  }
  throw error;
};

/**
 * One frame shot: posed and settled and pictured by agent frame-picture.ts
 * (every picture of a frame's one path, its refusals this shot's faults),
 * read from the DOM before, its pixels read back after.
 */
async function shootOne(page: Page, shot: Shot): Promise<ShotRead> {
  const selector = frameSelector(shot);
  const blank: ShotRead = {
    ...shot,
    drawn: "",
    faults: [],
    hash: "",
    label: "",
    stats: { width: 0, height: 0, top: 0, matched: "0/0" },
  };
  const key = await page.evaluate(keyOf, selector);
  if (!key) {
    return { ...blank, faults: ["no such frame on the canvas"] };
  }
  const posed = await poseFrame(page, key, POSE_MS).then(
    () => null,
    (error: unknown) => refused(error)
  );
  if (posed) {
    return { ...blank, faults: [posed] };
  }
  const seen = await page.evaluate(identityOf, {
    selector,
    holds: shot.holds ?? null,
  });
  if (!seen) {
    return { ...blank, faults: ["the frame left the page"] };
  }
  const grid = await page.evaluate(gridOf, { selector, grid: GRID });
  const faults = faultsOf(
    shot,
    seen,
    grid,
    await page.evaluate(astrayOf, selector)
  );
  const picture = await framePicture(page, key).catch((error: unknown) =>
    refused(error)
  );
  if (typeof picture === "string") {
    return { ...blank, label: seen.label, faults: [...faults, picture] };
  }
  await mkdir(dirname(shot.path), { recursive: true });
  await writeFile(shot.path, picture.png);
  const png = PNG.sync.read(picture.png);
  const top = topShareOf(png);
  if (top >= UNIFORM) {
    faults.push(`one colour: ${(top * 100).toFixed(2)}% of it`);
  }
  const match = matchedOf(png, picture.clip, picture.read.scale, grid.points);
  if (match.read === 0 || match.hit < match.read * MATCH_SHARE) {
    faults.push(
      `the picture is not its DOM's paint: ${match.hit} of ${match.read} points match (${match.misses.join("; ")})`
    );
  }
  return {
    ...shot,
    faults,
    drawn: createHash("md5").update(seen.drawn).digest("hex"),
    hash: createHash("md5").update(picture.png).digest("hex"),
    label: seen.label,
    stats: {
      width: png.width,
      height: png.height,
      top: Math.round(top * 1000) / 1000,
      matched: `${match.hit}/${match.read}`,
    },
  };
}

/**
 * Each frame an embedded canvas shows (a decision page's Preview: the canvas
 * page by=embed, in a frame of `page`), shot where the person sees it: its
 * body scrolled into the window, settled (the canvas's own `settled`), read
 * from the DOM in its own frame as a posed frame is (whose it is, its
 * scheme, nothing over it, every point its body's), its part in the window
 * shot from the page, and its pixels read back (not one colour, its DOM's
 * paint). Each png goes to `dir`, named for its story and `scheme`.
 */
export async function shootEmbedded(
  page: Page,
  embed: ElementHandle,
  scheme: Theme,
  dir: string
): Promise<ShotRead[]> {
  const frame = await embed.contentFrame();
  if (!frame) {
    return [];
  }
  const shown = await frame.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '.cawco-frame[data-cawco-interaction="rest"]'
      ),
    ].map((one) => ({
      file: one.dataset.cawcoFile ?? "",
      story: one.dataset.cawcoStory ?? "",
      width: one.dataset.cawcoWidth ?? "",
      key: one.dataset.cawcoKey ?? "",
    }))
  );
  const reads: ShotRead[] = [];
  for (const one of shown) {
    const shot: Shot = {
      file: one.file,
      story: one.story,
      scheme,
      width: one.width === "own" ? "own" : Number(one.width),
      path: `${dir}/${one.file.split("/").at(-1)?.replace(".stories.ts", "")}-${one.story}-${scheme}.png`,
    };
    const selector = frameSelector(shot);
    const blank: ShotRead = {
      ...shot,
      drawn: "",
      faults: [],
      hash: "",
      label: "",
      stats: { width: 0, height: 0, top: 0, matched: "0/0" },
    };
    // biome-ignore lint/performance/noAwaitInLoops: one frame in the window at a time
    await frame.evaluate(
      (sel) =>
        document
          .querySelector(`${sel} > .cawco-frame-body`)
          ?.scrollIntoView({ block: "start" }),
      selector
    );
    const settled = await frame
      .waitForFunction(
        (key) =>
          (
            globalThis as unknown as {
              __cawcoCanvas?: { settled?: (one: string) => boolean };
            }
          ).__cawcoCanvas?.settled?.(key) === true,
        one.key,
        { timeout: POSE_MS, polling: 100 }
      )
      .then(
        () => true,
        () => false
      );
    const seen = await frame.evaluate(identityOf, {
      selector,
      holds: null,
    });
    if (!seen) {
      reads.push({ ...blank, faults: ["the frame left the page"] });
      continue;
    }
    const grid = await frame.evaluate(gridOf, { selector, grid: GRID });
    const faults = [
      ...faultsOf(shot, seen, grid, await frame.evaluate(astrayOf, selector)),
      ...(settled ? [] : [`not settled in ${POSE_MS / 1000} s`]),
    ];
    const at = await embed.boundingBox();
    const body = await frame.evaluate((sel) => {
      const r = document
        .querySelector(`${sel} > .cawco-frame-body`)
        ?.getBoundingClientRect();
      return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
    }, selector);
    const view = page.viewportSize() ?? { width: 0, height: 0 };
    if (!(at && body)) {
      reads.push({
        ...blank,
        label: seen.label,
        faults: [...faults, "no box"],
      });
      continue;
    }
    // Its part in the window, on whole CSS px (as Playwright takes a clip).
    const left = Math.ceil(Math.max(0, at.x, at.x + body.x));
    const top = Math.ceil(Math.max(0, at.y, at.y + body.y));
    const right = Math.floor(
      Math.min(view.width, at.x + at.width, at.x + body.x + body.w)
    );
    const bottom = Math.floor(
      Math.min(view.height, at.y + at.height, at.y + body.y + body.h)
    );
    if (right - left < 8 || bottom - top < 8) {
      reads.push({
        ...blank,
        label: seen.label,
        faults: [...faults, "not in the window once scrolled to"],
      });
      continue;
    }
    const clip = { x: left, y: top, width: right - left, height: bottom - top };
    const bytes = await page.screenshot({ clip, animations: "allow" });
    await mkdir(dirname(shot.path), { recursive: true });
    await writeFile(shot.path, bytes);
    const png = PNG.sync.read(bytes);
    const share = topShareOf(png);
    if (share >= UNIFORM) {
      faults.push(`one colour: ${(share * 100).toFixed(2)}% of it`);
    }
    // The grid's points, from the embed's own window to the page's, those in the shot alone.
    const points = grid.points
      .map((point) => ({
        ...point,
        page: { x: at.x + point.page.x, y: at.y + point.page.y },
      }))
      .filter(
        (point) =>
          point.page.x >= left &&
          point.page.x < right &&
          point.page.y >= top &&
          point.page.y < bottom
      );
    const match = matchedOf(png, clip, png.width / clip.width, points);
    if (match.read === 0 || match.hit < match.read * MATCH_SHARE) {
      faults.push(
        `the picture is not its DOM's paint: ${match.hit} of ${match.read} points match (${match.misses.join("; ")})`
      );
    }
    reads.push({
      ...shot,
      faults,
      drawn: createHash("md5").update(seen.drawn).digest("hex"),
      hash: createHash("md5").update(bytes).digest("hex"),
      label: seen.label,
      stats: {
        width: png.width,
        height: png.height,
        top: Math.round(share * 1000) / 1000,
        matched: `${match.hit}/${match.read}`,
      },
    });
  }
  return reads;
}

/**
 * Captures each shot from `page`, the canvas that draws its frames (one
 * states file or several, at the shots' widths and schemes), in order: a
 * shot whose window of time matters goes first. Each png is written to its
 * `path`; each read says what was wrong with it, if anything.
 */
export async function shootFrames(
  page: Page,
  shots: Shot[]
): Promise<ShotRead[]> {
  const reads: ShotRead[] = [];
  for (const shot of shots) {
    // biome-ignore lint/performance/noAwaitInLoops: one frame on screen at a time
    reads.push(await shootOne(page, shot));
  }
  return reads;
}

/**
 * Holds a set of captures to their invariant in one leg named `leg`: every
 * shot without a fault, and no two files byte-identical unless their frames
 * drew the same DOM (`drawn`): a light file the same bytes as its dark twin,
 * or one story's the same as another's that says other words, is a picture
 * of the wrong frame. Two frames drawing one DOM (one story in two states
 * files) rightly share their picture; they are named in the leg's detail.
 * Returns whether it passed.
 */
export function checkShots(kit: Kit, leg: string, reads: ShotRead[]): boolean {
  const faults = reads.flatMap((one) =>
    one.faults.map(
      (fault) =>
        `${one.story}@${one.width}/${one.scheme} (${one.file}): ${fault}`
    )
  );
  const byHash = new Map<string, ShotRead[]>();
  for (const one of reads.filter((read) => read.hash)) {
    byHash.set(one.hash, [...(byHash.get(one.hash) ?? []), one]);
  }
  const wrong: string[] = [];
  const alike: string[] = [];
  for (const group of byHash.values()) {
    if (group.length < 2) {
      continue;
    }
    const names = group
      .map((one) => `${one.file}:${one.story}@${one.width}/${one.scheme}`)
      .join(" = ");
    (new Set(group.map((one) => one.drawn)).size === 1 ? alike : wrong).push(
      names
    );
  }
  const ok = reads.length > 0 && faults.length === 0 && wrong.length === 0;
  const twice =
    alike.length > 0
      ? `; one DOM drawn twice, one picture: ${alike.join(" | ")}`
      : "";
  return kit.check(
    leg,
    ok,
    ok
      ? `${reads.length} captures, each its own frame, none one colour, ${byHash.size} distinct files${twice}`
      : `${faults.length} faults: ${faults.slice(0, 8).join(" | ")}; the same bytes for frames that drew different DOM: ${wrong.slice(0, 4).join(" | ") || "none"}${twice}`
  );
}
