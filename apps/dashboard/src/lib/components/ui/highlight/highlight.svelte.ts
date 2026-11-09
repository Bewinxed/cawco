/**
 * One hover ghost and one selection pill for a list, the finish the
 * new-session dialog set (its follow-hover ghost, PORT-SPEC §2.4), as an
 * attachment on the list's container:
 *
 *   <nav {@attach highlight({ rows: "a", selected: '[aria-current="page"]' })}>
 *
 * - The ghost slides to the row the pointer is on, or between rows the
 *   nearest one (80ms, --ease-in-out), and fades in place when the pointer
 *   leaves, or, with
 *   `hovered`, follows the row carrying that attribute (a menu's
 *   `data-highlighted`, set by pointer and arrow keys alike). Keyboard focus
 *   on a row is the focus ring's (app.css), never the ghost's. Where
 *   nothing hovers (touch), it never shows (app.css) and a touch never
 *   aims it.
 * - The pill sits under the selected row and glides to the next one
 *   (120ms, --ease-drawer). A row picked with the pointer is already under
 *   the ghost: there the pill takes the ghost's place at once and the old
 *   selection fades where it was, so hover becomes selection with no frame
 *   of both and none of neither.
 *
 * All three layers are drawn under the rows (the container isolates, they
 * sit at z-index -1), measured from the rows' own rects and radii, and each
 * is drawn in parts (`BANDS`, `EDGES`, `CORNERS`) that move by `transform` alone and show by
 * the layer's `opacity`: a glide and a fade run on the compositor, however
 * busy the page's main thread is. They stand in the
 * container's shadow root, beside a `<slot>` that draws its own children as
 * they were: the list's children are its own still, so no child walk of a
 * consumer's (`firstElementChild`, `children`, a `> *` rule) ever meets them,
 * and they take no part in the list's layout. A container is a shadow host
 * (a `div`, `nav`, `section`, …; a `ul` stands inside one). Nothing observes
 * the list's own box for size (its frame line), so a list whose height is written
 * from inside a ResizeObserver loops none.
 *
 * Rows can move under a pointer that stays still — one closes and the rest
 * slide over. The browser says so with a `pointerover` on whatever is under
 * the pointer now, a scroll the reader did not make (a list that got shorter
 * at its scroll end) says so too, and a list that measures its own rows
 * (`laidOut`) says so every time it re-measures. The ghost never travels to
 * a row that is still on its way: it steps aside while the rows move, and
 * once they stand still it shows, in place, on the row the pointer is on
 * (`settle`).
 */

import { untrack } from "svelte";
import { frameObserver } from "#lib/platform/frame-observer.js";
import { dur, ease } from "#lib/platform/motion/curves.svelte.js";
import { watchRendered } from "#lib/platform/rendered.js";

/**
 * A layer's parts, in the order they are drawn: four bands that fill it,
 * the card's four edges (`look: "card"` only) and its four corners over
 * them. A band is never rounded, so no scale stretches what it draws; an
 * edge is scaled along its length only; a corner holds the one rounded
 * corner of the layer at its own size, and only ever moves. So a glide's
 * every frame is the row's contour at that frame's size, its corners as
 * round as the row's. At rest every part is laid out at the size it is
 * drawn, unscaled (`draw`).
 */
const BANDS = ["band-top", "band-bottom", "band-start", "band-end"] as const;
const EDGES = ["edge-top", "edge-bottom", "edge-left", "edge-right"] as const;
const CORNERS = ["corner-tl", "corner-tr", "corner-br", "corner-bl"] as const;
/**
 * How far (px) a part reaches past the line it meets another along, under
 * that one's own fill: two parts that met edge to edge on a fractional
 * pixel mid-glide each covered part of it, and the seam drew lighter.
 */
const OVERLAP = 1;

/**
 * The layers' recipe, the sheet every container's shadow root adopts (one
 * sheet, shared). Every layer is drawn under the rows (the list isolates, the
 * layers sit at -1, so a row's text and icons are always above them) and
 * placed from measured client rects, which are physical: each anchors to the
 * physical top-left corner the measurements are taken from. A layer is drawn
 * by its parts (`BANDS`, `EDGES`, `CORNERS`, placed by `draw`), each moved by its `transform`
 * only, and shown by its own `opacity`. Written as CSS over the
 * tokens: the page's utilities do not reach into a shadow root, and the
 * tokens' custom properties do.
 *
 * Each layer is on the compositor from the moment it mounts
 * (`will-change`), and so is every part that glides: an element lifted onto
 * a layer of its own as its transition or animation starts is drawn once
 * before that layer is painted, and the rows over it went missing for that
 * frame (6ecede8b5). Held there, the page's layers are the same at rest,
 * mid-glide and after: the parts each on their own, the list's rows on one
 * layer over them.
 *
 * - The ghost is the one hover fill: `surface-hover`, or the container's
 *   `--ghost` where its ground is that colour (a segmented groove). Where nothing hovers (a touch screen:
 *   a tap fires a synthetic mousemove and no mouseleave, so a ghost would
 *   park on the last tap as a second selection) there is none, unless the
 *   rows' own highlight drives it (`data-follow`). It fades in place over
 *   --duration-control; gliding (`GLIDES.ghost`), it moves 80ms on --ease-in-out.
 *   Unseen (`data-unseen`), it still marks the row it is on (`data-ghosted`)
 *   and is not drawn: folder tabs draw their own hover.
 * - The pill is the selection, the apricot wash its row's selected ink
 *   stands on; gliding, it moves 120ms on --ease-drawer. The trail is the
 *   old selection fading where it was (`data-fade`), and never glides: its
 *   parts stay off the compositor. With less motion a selection that moves
 *   cross-fades (`data-swap`) over --duration-fade.
 * - `card` (the host's `data-highlight`): a grid of icon cards (updates/ChannelCards.svelte), whose pill is the channel card's selection frame, 1px
 *   brand-solid over the recess at the card's own radius, drawn over the
 *   card's border and fill and under its face (CardFace): its edges are
 *   parts of their own, a border's width thick, so no scale ever thickens
 *   them.
 */
const LAYERS = `
[data-slot^="highlight-"] {
  pointer-events: none;
  position: absolute;
  top: 0;
  left: 0;
  z-index: -1;
  opacity: 0;
  will-change: opacity;
  background-color: var(--color-selected-bg);
}
[data-slot="highlight-ghost"] {
  display: none;
  background-color: var(--ghost, var(--color-surface-hover));
  transition: opacity var(--duration-control) var(--ease-out);
}
@media (hover: hover) {
  [data-slot="highlight-ghost"] {
    display: block;
  }
}
[data-slot="highlight-ghost"][data-follow] {
  display: block;
}
[data-slot="highlight-ghost"][data-unseen] {
  display: none;
}
[data-slot="highlight-pill"][data-swap] {
  transition: opacity var(--duration-fade) var(--ease-out);
}
[data-slot="highlight-trail"][data-fade] {
  transition: opacity var(--duration-control) var(--ease-out);
}
[data-slot="highlight-trail"][data-fade][data-swap] {
  transition: opacity var(--duration-fade) var(--ease-out);
}
[data-part] {
  position: absolute;
  top: 0;
  left: 0;
  box-sizing: border-box;
  transform-origin: 0 0;
  background-color: inherit;
}
:is([data-slot="highlight-ghost"], [data-slot="highlight-pill"]) [data-part] {
  will-change: transform;
}
[data-part^="edge-"] {
  background-color: var(--color-brand-solid);
}
:is([data-part="edge-top"], [data-part="edge-bottom"]) {
  height: var(--border-width);
}
:is([data-part="edge-left"], [data-part="edge-right"]) {
  width: var(--border-width);
}
[data-part="edge-bottom"] {
  top: calc(-1 * var(--border-width));
}
[data-part="edge-right"] {
  left: calc(-1 * var(--border-width));
}
[data-highlight-frame] {
  pointer-events: none;
  position: absolute;
  top: 0;
  inset-inline: 0;
  height: 1px;
}
:host([data-highlight="card"]) :is([data-slot="highlight-pill"], [data-slot="highlight-trail"]) {
  z-index: 1;
  background-color: var(--color-surface-recess);
}
:host([data-highlight="card"]) :is([data-part="corner-tl"], [data-part="corner-tr"]) {
  border-top: var(--border-width) solid var(--color-brand-solid);
}
:host([data-highlight="card"]) :is([data-part="corner-bl"], [data-part="corner-br"]) {
  border-bottom: var(--border-width) solid var(--color-brand-solid);
}
:host([data-highlight="card"]) :is([data-part="corner-tl"], [data-part="corner-bl"]) {
  border-left: var(--border-width) solid var(--color-brand-solid);
}
:host([data-highlight="card"]) :is([data-part="corner-tr"], [data-part="corner-br"]) {
  border-right: var(--border-width) solid var(--color-brand-solid);
}
`;

/** The layers' one sheet, made the first time a list asks for it. */
let layersSheet: CSSStyleSheet | null = null;
const sheetOfLayers = (): CSSStyleSheet => {
  if (!layersSheet) {
    layersSheet = new CSSStyleSheet();
    layersSheet.replaceSync(LAYERS);
  }
  return layersSheet;
};

/**
 * The container's shadow root, holding the layers and the `<slot>` that
 * draws its children. A shadow root stays once made: a list attached again
 * (its options changed) finds its own.
 */
const rootOf = (container: HTMLElement): ShadowRoot => {
  const root = container.shadowRoot ?? container.attachShadow({ mode: "open" });
  if (!root.adoptedStyleSheets.includes(sheetOfLayers())) {
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheetOfLayers()];
  }
  if (!root.querySelector("slot")) {
    root.append(document.createElement("slot"));
  }
  return root;
};

type Axis = "x" | "y" | "xy";

/** How far past a row's edge, along the list's axis, the pointer still counts as on it. */
const REACH = 8;
/** How far a row is drawn from where it lands before it counts as on its way. */
const CARRIED = 0.5;
/** How near (device pixels) an edge is to a grid line to count as on it. */
const ON_GRID = 0.01;
/** Frames the rows stand still before a pointer that never moved is aimed again. */
const STILL = 3;
/** A scroll this soon (ms) after a wheel, a key or a touch is the reader's own. */
const OWN_SCROLL = 200;
/** How long (ms) a scroll stands still before the ghost is aimed in full again. */
const SCROLL_END = 100;
/** An ancestor's move ending, on a transition or an animation (a sheet's `sheet-in`). */
const SETTLES = [
  "transitionend",
  "transitioncancel",
  "animationend",
  "animationcancel",
];

/** A row's box in the container's own coordinates. */
interface LaidOut {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface HighlightOptions {
  /** How nearness to the pointer is measured: `xy` for a grid. */
  axis?: Axis;
  /**
   * Rows whose own surface covers the ghost — a chosen tab's sheet. The
   * ghost glides beneath one and fades there, instead of showing through
   * its anti-aliased edge, and glides back out from under it.
   */
  covered?: string;
  /**
   * `false` for a pill alone, under a list that an outer ghost covers;
   * `"unseen"` for a ghost that marks its row (`data-ghosted`) and is not
   * drawn, under rows that draw their own hover (folder tabs).
   */
  ghost?: boolean | "unseen";
  /** A row attribute that says which row is hovered, instead of the pointer. */
  hovered?: string;
  /**
   * Where each row is laid out, for a list that measures its rows itself
   * (the tabs' TabRects), read reactively. The layers are placed from these
   * boxes rather than from what is drawn, so a row a FLIP is still carrying
   * is aimed at where it lands, and they follow the rows each time the list
   * re-measures. Only rows with a box here are rows.
   */
  laidOut?: () => ReadonlyMap<Element, LaidOut>;
  /** `card`: a grid of icon cards, its pill the channel card's frame. */
  look?: "card";
  /** The rows the ghost and the pill stand under. */
  rows: string;
  /** The selected row. */
  selected?: string;
}

/** One corner's radii, across and down (px). */
type Radius = readonly [number, number];
/** A row's four corners, top-left, top-right, bottom-right, bottom-left, as drawn (`cornersOf`). */
type Radii = readonly [Radius, Radius, Radius, Radius];

interface Box {
  h: number;
  r: Radii;
  w: number;
  x: number;
  y: number;
}

/** How far `at` is from the middle of `box`, along `axis`. */
function distanceTo(
  axis: Axis,
  at: { x: number; y: number },
  box: Omit<Box, "r">
): number {
  const dx = at.x - (box.x + box.w / 2);
  const dy = at.y - (box.y + box.h / 2);
  return { x: Math.abs(dx), y: Math.abs(dy), xy: Math.hypot(dx, dy) }[axis];
}

/** A computed radius length, `8px` or `50%` of `of`. */
const lengthOf = (value: string, of: number): number =>
  value.endsWith("%")
    ? (Number.parseFloat(value) / 100) * of
    : Number.parseFloat(value) || 0;

/**
 * A row's four corners, each its own (The Concentric Rule): a row
 * concentric in its container (design.css `concentric-in`) takes the
 * container's radius less its inset at each corner, and a row opened at an
 * edge is square there, so the ghost and the pill drawn from it take the
 * row's contour. Read corner by corner, never from the shorthand, which an
 * engine may serialise as one value; resolved against the row's size and
 * scaled down where they overlap, as the engine draws them (CSS Backgrounds
 * 3 §5.5: a capsule's 999px is half its height).
 */
const cornersOf = (style: CSSStyleDeclaration, w: number, h: number): Radii => {
  const [tl, tr, br, bl] = [
    style.borderTopLeftRadius,
    style.borderTopRightRadius,
    style.borderBottomRightRadius,
    style.borderBottomLeftRadius,
  ].map((corner): Radius => {
    const [x = "0px", y = x] = corner.split(" ");
    return [lengthOf(x, w), lengthOf(y, h)];
  }) as [Radius, Radius, Radius, Radius];
  const fit = (size: number, a: number, b: number) =>
    a + b > size ? size / (a + b) : 1;
  const f = Math.min(
    fit(w, tl[0], tr[0]),
    fit(w, bl[0], br[0]),
    fit(h, tl[1], bl[1]),
    fit(h, tr[1], br[1])
  );
  return [tl, tr, br, bl].map(([x, y]): Radius => [
    x * f,
    y * f,
  ]) as unknown as Radii;
};

/** A layer and its parts, and the glide it is on (`draw`). */
interface Layer {
  /** Where its parts stand now: the box last drawn. */
  drawn: Box | null;
  el: HTMLElement;
  parts: HTMLElement[];
  run: Run | null;
}
/** A glide under way: its animations, one a part, on one clock. */
interface Run {
  anims: Animation[];
  /** The reversing shortening factor this run began with (CSS Transitions 1 §3.1). */
  factor: number;
  from: Box;
  /** The box a glide back to undoes this one (its reversing-adjusted start value). */
  start: Box;
  to: Box;
}
/** How a layer glides to its next box: the motion tokens' names. */
interface Glide {
  duration: `--duration-${string}`;
  easing: `--ease-${string}`;
}
/** The ghost's glide and the pill's (the sheet's head says which is which). */
const GLIDES = {
  ghost: { duration: "--duration-ghost", easing: "--ease-in-out" },
  pill: { duration: "--duration-control", easing: "--ease-drawer" },
} as const satisfies Record<string, Glide>;

const layerOf = (slot: string, card: boolean): Layer => {
  const span = document.createElement("span");
  span.dataset.slot = slot;
  span.setAttribute("aria-hidden", "true");
  const parts = [...BANDS, ...(card ? EDGES : []), ...CORNERS].map((name) => {
    const part = document.createElement("span");
    part.dataset.part = name;
    return part;
  });
  span.append(...parts);
  return { el: span, parts, drawn: null, run: null };
};

const SIDES = {
  "corner-tl": "borderTopLeftRadius",
  "corner-tr": "borderTopRightRadius",
  "corner-br": "borderBottomRightRadius",
  "corner-bl": "borderBottomLeftRadius",
} as const;

/**
 * One part of a layer at a box: its top-left corner and its size along
 * each axis it is sized on (null: the sheet's own, an edge's thickness). A
 * part that is `scaled` takes a glide's change of size by its scale; a
 * corner never does. Every part is laid out at its own origin and placed by
 * its `transform` alone: an element held on the compositor
 * (`will-change: transform`) has its laid-out offset rounded to a whole
 * pixel, and a band laid out at `right: 0`, 106.5px wide, was drawn half a
 * pixel past its row's end.
 */
interface Part {
  h: number | null;
  scaled: boolean;
  w: number | null;
  x: number;
  y: number;
}

/**
 * Each part of a layer at `box`, in the parts' order. The box's middle is
 * split (`midX`, `midY`) where no corner reaches across it, on the
 * device-pixel grid as the box's own edges are (`placeOf`), and each band
 * covers one side of a split and `OVERLAP` past it: every point of the box
 * that is no corner's is some band's, and no band enters a corner.
 */
const partsAt = (box: Box, card: boolean): Part[] => {
  const { x, y, w, h } = box;
  const [tl, tr, br, bl] = box.r;
  const ratio = window.devicePixelRatio;
  const between = (v: number, lo: number, hi: number) =>
    Math.round((lo > hi ? v : Math.min(hi, Math.max(lo, v))) * ratio) / ratio;
  const midX = between(
    w / 2,
    Math.max(tl[0], bl[0]),
    w - Math.max(tr[0], br[0])
  );
  const midY = between(
    h / 2,
    Math.max(tl[1], tr[1]),
    h - Math.max(bl[1], br[1])
  );
  const part = (
    left: number,
    top: number,
    pw: number | null,
    ph: number | null,
    scaled = true
  ): Part => ({
    x: x + left,
    y: y + top,
    w: pw === null ? null : Math.max(0, pw),
    h: ph === null ? null : Math.max(0, ph),
    scaled,
  });
  const lower = Math.max(0, midY - OVERLAP);
  const after = Math.max(0, midX - OVERLAP);
  const bands = [
    part(tl[0], 0, w - tl[0] - tr[0], Math.min(h, midY + OVERLAP)),
    part(bl[0], lower, w - bl[0] - br[0], h - lower),
    part(0, tl[1], Math.min(w, midX + OVERLAP), h - tl[1] - bl[1]),
    part(after, tr[1], w - after, h - tr[1] - br[1]),
  ];
  // The bottom and right edges are laid out a border's width up and left
  // of their origin (the sheet's), so each is placed by the box's edge.
  const edges = card
    ? [
        part(tl[0], 0, w - tl[0] - tr[0], null),
        part(bl[0], h, w - bl[0] - br[0], null),
        part(0, tl[1], null, h - tl[1] - bl[1]),
        part(w, tr[1], null, h - tr[1] - br[1]),
      ]
    : [];
  // Each corner reaches OVERLAP past its curve along both edges, under
  // the bands' and edges' own ends.
  // Laid out at whole pixels, as every part is (`draw`).
  const corner = (right: boolean, bottom: boolean, [rx, ry]: Radius) => {
    const cw = Math.ceil(Math.min(w, rx + OVERLAP));
    const ch = Math.ceil(Math.min(h, ry + OVERLAP));
    return part(right ? w - cw : 0, bottom ? h - ch : 0, cw, ch, false);
  };
  return [
    ...bands,
    ...edges,
    corner(false, false, tl),
    corner(true, false, tr),
    corner(true, true, br),
    corner(false, true, bl),
  ];
};

/**
 * A part's `transform` at `at`, laid out at `laid`: its place, and its
 * scale from the size it is laid out at to the size it is drawn.
 */
const transformOf = (at: Part, laid: Part) => {
  const scale = (drawn: number | null, size: number | null) =>
    at.scaled && drawn !== null && size !== null && size > 0 ? drawn / size : 1;
  return `translate(${at.x}px, ${at.y}px) scale(${scale(at.w, laid.w)}, ${scale(at.h, laid.h)})`;
};

/** A box `p` of the way from `a` to `b`, `b`'s corners kept. */
const between = (a: Box, b: Box, p: number): Box => ({
  x: a.x + (b.x - a.x) * p,
  y: a.y + (b.y - a.y) * p,
  w: a.w + (b.w - a.w) * p,
  h: a.h + (b.h - a.h) * p,
  r: b.r,
});

/** Where a glide's parts stand now: its eased progress on the box it moves (no style is read). */
const nowOf = (run: Run): { box: Box; p: number } => {
  const p = run.anims[0]?.effect?.getComputedTiming().progress;
  return p === null || p === undefined
    ? { box: run.to, p: 1 }
    : { box: between(run.from, run.to, p), p };
};

/**
 * A layer onto `box`: at once, or gliding there on `glide` from wherever it
 * stands now (mid-glide, where that glide has taken it). Every part is laid
 * out at once at the size it is drawn at `box`, so at rest nothing is
 * scaled; its corners take the new box's radii, as a row's `border-radius`
 * changes. A glide then moves each part by its `transform` alone, from the
 * box it leaves, drawn with those corners, to identity: its bands scaled
 * from the size they leave at (FLIP), its corners only moved. One Web
 * Animation a part, on one clock, run on the compositor; the final place is
 * the inline style, so nothing holds once the glide ends. A glide back to
 * where a glide caught mid-way began is as much shorter as that glide had
 * gone (CSS Transitions 1 §3.1, the reversing shortening factor), as the
 * CSS transitions it replaced were. It reads nothing from the page: the
 * motion tokens are read with each box (`boxOf`), before any write.
 */
const draw = (
  layer: Layer,
  box: Box,
  card: boolean,
  glide: Glide | null = null
) => {
  const was = layer.run;
  const now = was ? nowOf(was) : null;
  const from = now?.box ?? layer.drawn;
  for (const run of was?.anims ?? []) {
    run.cancel();
  }
  layer.run = null;
  const drawn = partsAt(box, card);
  // A part is laid out at whole pixels and scaled to its size: the engine
  // draws a box's own size snapped to whole pixels before its transform,
  // and a band laid out 106.5px wide was drawn 107px, half a pixel past its
  // row's end. One drawn at no size (a capsule's straight side, between its
  // round ends) is laid out a pixel long and scaled to nothing, so a glide
  // from a box where it has a size scales it from there.
  const whole = (size: number | null) =>
    size === null ? null : Math.max(1, Math.ceil(size - ON_GRID));
  const laid = drawn.map((at) =>
    at.scaled ? { ...at, w: whole(at.w), h: whole(at.h) } : at
  );
  for (const [i, el] of layer.parts.entries()) {
    const at = laid[i] as Part;
    if (at.w !== null) {
      el.style.width = `${at.w}px`;
    }
    if (at.h !== null) {
      el.style.height = `${at.h}px`;
    }
    el.style.transform = transformOf(drawn[i] as Part, at);
  }
  for (const [i, name] of CORNERS.entries()) {
    const [rx, ry] = box.r[i] as Radius;
    const el = layer.parts.at(i - CORNERS.length) as HTMLElement;
    el.style[SIDES[name]] = `${rx}px ${ry}px`;
  }
  layer.drawn = box;
  if (!(glide && from && moved(from, box))) {
    return;
  }
  // Back to where the glide it cuts short set out from: as much shorter
  // as that glide had come.
  const back = was && now && same(box, was.start);
  const factor = back
    ? Math.min(1, Math.max(0, now.p * was.factor + (1 - was.factor)))
    : 1;
  const leaving = partsAt({ ...from, r: box.r }, card);
  const timing = {
    duration: dur(glide.duration) * factor,
    easing: ease(glide.easing),
  };
  layer.run = {
    anims: layer.parts.map((el, i) =>
      el.animate(
        [
          { transform: transformOf(leaving[i] as Part, laid[i] as Part) },
          { transform: transformOf(drawn[i] as Part, laid[i] as Part) },
        ],
        timing
      )
    ),
    factor,
    from,
    start: back ? was.to : from,
    to: box,
  };
};

const show = (layer: Layer, on: boolean) => {
  layer.el.style.opacity = on ? "1" : "0";
};

/**
 * How far a row is drawn from where it is laid out: the translation its own
 * and its ancestors' transforms carry, up to the container (a FLIP sliding
 * it, on `transform` or `translate`). Taken off its drawn rect, what is left
 * is where it lands, to the subpixel.
 */
const slideOf = (
  row: HTMLElement,
  container: HTMLElement,
  /**
   * Each ancestor's own share, kept across the rows of one pass: rows share
   * their ancestors, and read again for every row, a list of sixty rows read
   * five hundred styles each time the pointer was re-aimed.
   */
  shares = new Map<HTMLElement, { x: number; y: number }>()
) => {
  let x = 0;
  let y = 0;
  for (
    let at: HTMLElement | null = row;
    at && at !== container;
    at = at.parentElement
  ) {
    let share = shares.get(at);
    if (!share) {
      share = { x: 0, y: 0 };
      const styles = getComputedStyle(at);
      if (styles.transform !== "none") {
        const matrix = new DOMMatrixReadOnly(styles.transform);
        share.x += matrix.e;
        share.y += matrix.f;
      }
      if (styles.translate !== "none") {
        const [tx = "0", ty = "0"] = styles.translate.split(" ");
        share.x += Number.parseFloat(tx);
        share.y += Number.parseFloat(ty);
      }
      shares.set(at, share);
    }
    x += share.x;
    y += share.y;
  }
  return { x, y };
};

/** Whether a box is anywhere else at all: a follow places the layer exactly. */
const moved = (a: Box, b: Box) =>
  Math.abs(a.x - b.x) > 0.001 ||
  Math.abs(a.y - b.y) > 0.001 ||
  Math.abs(a.w - b.w) > 0.001 ||
  Math.abs(a.h - b.h) > 0.001;

const same = (a: Box | null, b: Box | null) =>
  a !== null &&
  b !== null &&
  Math.abs(a.x - b.x) < 0.5 &&
  Math.abs(a.y - b.y) < 0.5 &&
  Math.abs(a.w - b.w) < 0.5 &&
  Math.abs(a.h - b.h) < 0.5;

export function highlight(options: HighlightOptions) {
  return (container: HTMLElement) => {
    const {
      rows,
      hovered,
      selected,
      covered,
      laidOut,
      axis = "y",
      ghost: withGhost = true,
      look,
    } = options;
    // The list isolates, so the layers at -1 stand under its rows and over
    // nothing outside it. Unpositioned, it is the layers' containing block
    // by the sheet's own default for `[data-highlight]` (design.css), which a
    // list's own position outranks: read here as it mounted, its computed
    // style restyled the page between the writes of the flush that mounted it.
    container.dataset.highlight = look ?? "";
    const ownIsolate = !container.classList.contains("isolate");
    container.classList.add("isolate");
    const card = look === "card";
    const ghost = layerOf("highlight-ghost", card);
    const trail = layerOf("highlight-trail", card);
    const pill = layerOf("highlight-pill", card);
    // A ghost the rows' own highlight drives (a menu's arrow keys) shows on
    // a touch screen too; a ghost the pointer drives does not.
    if (hovered) {
      ghost.el.dataset.follow = "";
    }
    if (withGhost === "unseen") {
      ghost.el.dataset.unseen = "";
    }
    /** Less motion asked for: nothing glides, and a selection cross-fades (`swap`). */
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    /**
     * The ghost onto its box: gliding there, or at once (`glide` false). An
     * unseen ghost is drawn by nobody, and never glides.
     */
    const drawGhost = (box: Box, glide: boolean) =>
      draw(
        ghost,
        box,
        card,
        glide && withGhost === true && !reduced.matches ? GLIDES.ghost : null
      );
    /**
     * What the highlight hears the list's size and rendering by: a line as
     * wide as the list and 1px tall, in its shadow root. Never the list's
     * own box: a list whose height is written from inside a ResizeObserver
     * (virtua writes the transcript's from its own) resizes an observed
     * ancestor after its depth was delivered, and WebKit reports a
     * "ResizeObserver loop". The line's size moves only with the list's
     * width, or as the list is rendered or skipped.
     */
    const line = document.createElement("span");
    line.dataset.highlightFrame = "";
    line.setAttribute("aria-hidden", "true");
    // First in the shadow root, before the slot: drawn under the children.
    rootOf(container).prepend(
      line,
      ...(withGhost ? [ghost.el] : []),
      trail.el,
      pill.el
    );

    /**
     * A point on screen in the container's padding box, scroll included, in
     * the container's own untransformed pixels: a list inside a popover that
     * is still scaling in is measured at its real size, not its drawn one.
     */
    const frameOf = () => {
      const frame = container.getBoundingClientRect();
      // Drawn size over laid-out size; the laid-out size is the resolved
      // one, fractional, so an untransformed list is exactly 1.
      const styles = getComputedStyle(container);
      const across = (drawn: number, laid: string) => {
        const size = Number.parseFloat(laid);
        return size > 0 && Math.abs(drawn - size) > 0.01 ? drawn / size : 1;
      };
      return {
        left: frame.left,
        top: frame.top,
        borderLeft: container.clientLeft,
        borderTop: container.clientTop,
        sx: across(frame.width, styles.width),
        sy: across(frame.height, styles.height),
      };
    };
    /** A point in the frame `frameOf` measured, at the list's scroll now. */
    const inFrame = (
      frame: ReturnType<typeof frameOf>,
      clientX: number,
      clientY: number
    ) => ({
      x:
        (clientX - frame.left) / frame.sx -
        frame.borderLeft +
        container.scrollLeft,
      y:
        (clientY - frame.top) / frame.sy -
        frame.borderTop +
        container.scrollTop,
      sx: frame.sx,
      sy: frame.sy,
    });
    const toLocal = (clientX: number, clientY: number) =>
      inFrame(frameOf(), clientX, clientY);
    /**
     * A row's box in the same space: where the list laid it out, when it
     * says, or else where the page laid it out, transforms ignored. A row a
     * FLIP is still carrying (reflow sliding the rows under a list that just
     * opened) is aimed at where it lands, not where it is drawn mid-slide:
     * measured there, the pill stayed a row off once the slide ended, with
     * nothing left to move it. Undefined for a row not laid out.
     */
    const placeOf = (
      row: HTMLElement,
      shares?: Map<HTMLElement, { x: number; y: number }>
    ): Omit<Box, "r"> | undefined => {
      if (laidOut) {
        const at = laidOut().get(row);
        return at && { x: at.left, y: at.top, w: at.width, h: at.height };
      }
      const rect = row.getBoundingClientRect();
      const slid = slideOf(row, container, shares);
      // On the device-pixel grid, as the row's own box is painted: a layer
      // placed by a fractional translate draws its 1px edge across two
      // pixels, a soft line beside the row's crisp one (a card at x 1026.3
      // drew the frame's brand edge at 73%). Each edge goes outward, the
      // start down and the end up, so the layer covers the whole row:
      // rounded each to the nearest, a row on a half pixel (a message well,
      // 0.5px in) had both edges taken inward and its ghost drew a pixel
      // narrower. An edge already on the grid, give or take a float's
      // residue (`ON_GRID`), stays where it is.
      const ratio = window.devicePixelRatio;
      const start = (v: number) => Math.floor(v * ratio + ON_GRID) / ratio;
      const end = (v: number) => Math.ceil(v * ratio - ON_GRID) / ratio;
      const left = start(rect.left - slid.x);
      const top = start(rect.top - slid.y);
      const at = toLocal(left, top);
      return {
        x: at.x,
        y: at.y,
        w: (end(rect.right - slid.x) - left) / at.sx,
        h: (end(rect.bottom - slid.y) - top) / at.sy,
      };
    };
    /**
     * A row's box and corners. The glides' motion tokens are read here too
     * (`dur`, `ease`: off the root once, and again after a theme change),
     * so a layer drawn from the box reads nothing between its writes.
     */
    const boxOf = (row: HTMLElement): Box | undefined => {
      const at = placeOf(row);
      if (!at) {
        return;
      }
      for (const glide of Object.values(GLIDES)) {
        dur(glide.duration);
        ease(glide.easing);
      }
      return { ...at, r: cornersOf(getComputedStyle(row), at.w, at.h) };
    };
    /** A row's box, if it is shown at all. */
    const shownBoxOf = (row: HTMLElement) =>
      row.offsetParent === null ? undefined : boxOf(row);
    const rowsNow = () =>
      [...container.querySelectorAll<HTMLElement>(rows)].filter(isRow);
    /** The list is not rendered (`watchRendered`): nothing measures it. */
    let skipped = false;
    let ghostBox: Box | null = null;
    let ghostRow: HTMLElement | null = null;
    let pendingHide = 0;
    let pillBox: Box | null = null;
    let pillRow: HTMLElement | null = null;
    /** The rows the layers stand on, watched for their own size (set below, with its observer). */
    let watchRows: () => void = () => undefined;

    /**
     * The ghost stands shown, or not: on its layer, and on the container as
     * `data-ghost-shown` for what dims beside it (a fluid track's segment,
     * `beside-ghost`). Said by the container, not found by what it holds:
     * as a `:has()` over its rows, each row chosen scheduled the container's
     * children to restyle. Written only when it changes: a `reflow` around
     * the list hears each attribute write as a change to re-place every row.
     */
    const showGhostLayer = (on: boolean) => {
      show(ghost, on);
      if (container.hasAttribute("data-ghost-shown") !== on) {
        container.toggleAttribute("data-ghost-shown", on);
      }
    };
    const showOrCover = () => {
      showGhostLayer(!(covered && ghostRow?.matches(covered)));
    };
    /**
     * What the layers read next, by what asked (`readSoon`): each read runs
     * in the next frame's delivery, on the layout that frame has just done,
     * and answers its write, which runs once every site there has read. Read
     * where it was asked instead (a pointer crossing rows as a wheel moves
     * them, in the wheel's own task after the list's writes), each hit test
     * and each box laid the page out there. Asked again before then under
     * the same name, a read runs once, as last asked.
     */
    const reads = new Map<string, () => (() => void) | undefined>();
    const readSite = frameObserver(null, {
      inside: () => {
        const due = [...reads.values()];
        reads.clear();
        if (skipped) {
          return;
        }
        const writes = due.map((read) => read());
        return () => {
          for (const write of writes) {
            write?.();
          }
        };
      },
    });
    const readSoon = (name: string, read: () => (() => void) | undefined) => {
      reads.set(name, read);
      readSite.readNext();
    };
    /**
     * The ghost onto `row` at `box` (read with it), or off the list with
     * none. Every read is the caller's: this only writes.
     */
    const placeGhost = (row: HTMLElement | null, box: Box | undefined) => {
      if (!withGhost || skipped) {
        return;
      }
      // The row under the ghost says so, for a pill in a nested list (a
      // sidebar's) that has no ghost of its own to take over from.
      if (ghostRow !== row) {
        ghostRow?.removeAttribute("data-ghosted");
        row?.setAttribute("data-ghosted", "");
      }
      if (!(row && box)) {
        followed += 1;
        row?.removeAttribute("data-ghosted");
        showGhostLayer(false);
        // A ghost that has faded holds no place: it fades where it is, and
        // its next showing lands without a glide (`ghostRow` is null).
        ghostBox = null;
        ghostRow = null;
        watchRows();
        return;
      }
      // Out of view, the ghost lands where it is going without a glide;
      // from under a covering row it glides out as it would from view.
      drawGhost(box, ghostRow !== null);
      ghostBox = box;
      ghostRow = row;
      watchRows();
      showOrCover();
      follow();
      afterMoves();
    };
    /** The ghost onto `row`, measured where it is asked: a list resized, a pointer leaving. */
    const showGhost = (row: HTMLElement | null) =>
      placeGhost(row, row ? boxOf(row) : undefined);
    /**
     * A placement taken while the list was moving (its content shifting
     * under a still pointer, a panel above it folding) is the list's place
     * at that moment, and a list that moves on without resizing sets nothing
     * measuring it again: the ghost stood off its row by however far the
     * list went on (the spawn sheet's model list, 0.45px). So the ghost
     * follows its row, without a glide, until the row has stood still for
     * `STILL` frames. On a list that is not moving the first check finds the
     * box the ghost already has. A scroll is `aimScrolling`'s: the rows do
     * not move in the list's own space while it scrolls.
     */
    /** Which following is current: a later one, or the ghost let go, ends the one before. */
    let followed = 0;
    const follow = () => {
      followed += 1;
      const mine = followed;
      // Each check read in a frame's delivery, a frame apart.
      const check = (still: number) =>
        readSoon("follow", () => {
          const row = ghostRow;
          if (
            mine !== followed ||
            !(row?.isConnected && ghostBox) ||
            scrolling ||
            skipped
          ) {
            return;
          }
          const box = boxOf(row);
          return () => {
            if (mine !== followed || ghostRow !== row || !ghostBox) {
              return;
            }
            let next = still + 1;
            if (box && moved(box, ghostBox)) {
              drawGhost(box, false);
              ghostBox = box;
              next = 0;
            }
            if (next < STILL) {
              check(next);
            }
          };
        });
      check(0);
    };

    /** The pill onto the selected row: from the ghost, or gliding. */
    /** The selected row and its box, read: where `placePill` puts the pill. */
    const selectedPill = () => {
      if (!selected) {
        return null;
      }
      const row = container.querySelector<HTMLElement>(selected);
      return { row, box: row && shownBoxOf(row) };
    };
    const placePill = (glide: boolean, at = selectedPill()) => {
      if (!at) {
        return;
      }
      const { row, box } = at;
      if (!(row && box)) {
        show(pill, false);
        pillBox = null;
        pillRow = null;
        watchRows();
        return;
      }
      if (row === pillRow && same(box, pillBox)) {
        return;
      }
      const fromGhost =
        row !== pillRow &&
        ((row === ghostRow && same(box, ghostBox)) ||
          row.hasAttribute("data-ghosted"));
      if (fromGhost && pillBox) {
        fadeTrail(pillBox);
      }
      movePill(box, glide && !fromGhost && pillBox !== null && row !== pillRow);
      pillBox = box;
      pillRow = row;
      watchRows();
      afterMoves();
    };
    /** Hover becomes selection: the old selection fades where it was. */
    const fadeTrail = (from: Box) => {
      trail.el.removeAttribute("data-fade");
      trail.el.removeAttribute("data-swap");
      draw(trail, from, card);
      show(trail, true);
      requestAnimationFrame(() => {
        // With less motion the fade is the whole move: --duration-fade (`swap`).
        trail.el.toggleAttribute("data-fade", true);
        trail.el.toggleAttribute("data-swap", reduced.matches);
        show(trail, false);
      });
    };
    /**
     * The pill to its box: gliding when it moves to another row, or, with
     * less motion, cross-fading there (`swap`); landing at once otherwise.
     */
    const movePill = (box: Box, move: boolean) => {
      if (move && pillBox && reduced.matches) {
        swap(pillBox, box);
        return;
      }
      pill.el.removeAttribute("data-swap");
      draw(pill, box, card, move ? GLIDES.pill : null);
      show(pill, true);
    };
    /** A selection that moves under less motion: a cross-fade, never a glide. */
    const swap = (from: Box, to: Box) => {
      // Both land at once, transitions off: the trail where the selection
      // was, the pill hidden where it is going.
      trail.el.removeAttribute("data-fade");
      trail.el.removeAttribute("data-swap");
      draw(trail, from, card);
      show(trail, true);
      pill.el.removeAttribute("data-swap");
      draw(pill, to, card);
      show(pill, false);
      // Then the fades, from the frame those were drawn in.
      requestAnimationFrame(() => {
        trail.el.toggleAttribute("data-fade", true);
        trail.el.toggleAttribute("data-swap", true);
        pill.el.toggleAttribute("data-swap", true);
        show(trail, false);
        show(pill, true);
      });
    };
    const syncPill = (glide: boolean) => {
      if (!skipped) {
        placePill(glide);
      }
    };

    /** Whether `at` lies on the row at `box`, the gaps along the axis bridged. */
    const reaches = (
      box: { x: number; y: number; w: number; h: number },
      at: { x: number; y: number }
    ): boolean => {
      const growX = axis === "y" ? 0 : REACH;
      const growY = axis === "x" ? 0 : REACH;
      return (
        at.x >= box.x - growX &&
        at.x <= box.x + box.w + growX &&
        at.y >= box.y - growY &&
        at.y <= box.y + box.h + growY
      );
    };

    /** Whether a row is one of the list's own, shown and in reach. */
    const isRow = (row: HTMLElement) =>
      container.contains(row) &&
      !(row as HTMLButtonElement).disabled &&
      row.offsetParent !== null &&
      (!laidOut || laidOut().has(row));
    /**
     * Whether a row is drawn where the pointer could reach it: what is on
     * screen at the row's own point nearest the pointer is the row's. A row
     * scrolled out under the list's edge, or under another surface, has a
     * box there and nothing drawn.
     */
    const drawnNear = (row: HTMLElement, x: number, y: number): boolean => {
      const rect = row.getBoundingClientRect();
      const inX = Math.min(REACH, rect.width / 2);
      const inY = Math.min(1, rect.height / 2);
      const seen = document.elementFromPoint(
        Math.min(rect.right - inX, Math.max(rect.left + inX, x)),
        Math.min(rect.bottom - inY, Math.max(rect.top + inY, y))
      );
      return seen !== null && rowOf(seen) === row;
    };
    /**
     * The row an element belongs to: the row it is in, or the one row of
     * the nearest box around it that holds any. A control that stands beside
     * its row in the row's own box (a session row's Peek or Archive) is that row's;
     * the box of a parent and the rows under it is nobody's.
     */
    const rowOf = (element: Element): HTMLElement | null => {
      const inside = element.closest<HTMLElement>(rows);
      if (inside) {
        return inside;
      }
      for (
        let at: Element | null = element;
        at && at !== container;
        at = at.parentElement
      ) {
        const held = at.querySelectorAll<HTMLElement>(rows);
        if (held.length > 0) {
          return held.length === 1 ? held[0] : null;
        }
      }
      return null;
    };

    /**
     * The row a point on screen is on. What is drawn under the point says
     * so first: a row whose anything is under it (its mark, a control that
     * hangs outside its box or stands beside it, `rowOf`) is that row,
     * whatever boxes lie there. Measured
     * by boxes alone, a pointer on the rail's footer was on the session row
     * scrolled out of sight behind it, nearer by its centre. A row a slide
     * is still carrying is not counted this way: the ghost is aimed at where
     * rows land. Between rows, the nearest of those the pointer can reach: a
     * row counts only when its box, grown by REACH along the list's axis
     * (enough to bridge the gaps between rows), holds the point, and it is
     * drawn there. Over a header, a seam, the list's own chrome or anything
     * that lies over the list there is none, and the ghost fades rather than
     * jumping to whatever row is closest.
     */
    const nearest = (clientX: number, clientY: number) => {
      const under = document.elementFromPoint(clientX, clientY);
      if (!(under && container.contains(under))) {
        return null;
      }
      const shares = new Map<HTMLElement, { x: number; y: number }>();
      return standingRow(under, shares) ?? reachedRow(clientX, clientY, shares);
    };
    /** The row an element is in, if it stands where it is laid out. */
    const standingRow = (
      under: Element,
      shares: Map<HTMLElement, { x: number; y: number }>
    ) => {
      const on = rowOf(under);
      if (!(on && isRow(on))) {
        return null;
      }
      const slid = slideOf(on, container, shares);
      return Math.abs(slid.x) <= CARRIED && Math.abs(slid.y) <= CARRIED
        ? on
        : null;
    };
    /** The nearest row whose grown box holds the point, drawn there. */
    const reachedRow = (
      clientX: number,
      clientY: number,
      shares: Map<HTMLElement, { x: number; y: number }>
    ) => {
      const at = toLocal(clientX, clientY);
      const reached: { distance: number; row: HTMLElement }[] = [];
      for (const row of rowsNow()) {
        // A row the pointer cannot reach — one on its way out — is not
        // under it, wherever it is still drawn.
        const box =
          getComputedStyle(row).pointerEvents === "none"
            ? undefined
            : placeOf(row, shares);
        if (!(box && reaches(box, at))) {
          continue;
        }
        reached.push({ distance: distanceTo(axis, at, box), row });
      }
      reached.sort((a, b) => a.distance - b.distance);
      return (
        reached.find(({ row }) => drawnNear(row, clientX, clientY))?.row ?? null
      );
    };

    /** Where the pointer last was, to re-aim when a list scrolls under it. */
    let pointer: { x: number; y: number } | null = null;
    /** Which wait for the rows to stand still is current (`settle`): a move ends it. */
    let waits = 0;
    /** The next aim places the ghost even on the row it is on (`again`). */
    let aimAgain = false;
    /**
     * The ghost to the row the pointer is on, aimed in the next delivery:
     * however many moves come before that frame, one hit test and one box,
     * on the frame's own layout.
     */
    const onMove = (
      event: { clientX: number; clientY: number },
      again = false
    ) => {
      if (hovered) {
        return;
      }
      waits += 1;
      pointer = { x: event.clientX, y: event.clientY };
      aimAgain ||= again;
      readSoon("pointer", () => {
        const at = pointer;
        const force = aimAgain;
        aimAgain = false;
        if (hovered || !at) {
          return;
        }
        const best = nearest(at.x, at.y);
        if (!(force || best !== ghostRow)) {
          return;
        }
        const box = best ? boxOf(best) : undefined;
        return () => {
          if (pointer === at) {
            placeGhost(best, box);
          }
        };
      });
    };

    /** Whether any row is drawn off its place: a slide is carrying it. */
    const rowsMoving = (): boolean => {
      const shares = new Map<HTMLElement, { x: number; y: number }>();
      return rowsNow().some((row) => {
        const slid = slideOf(row, container, shares);
        return Math.abs(slid.x) > CARRIED || Math.abs(slid.y) > CARRIED;
      });
    };
    /**
     * The rows moved and the pointer did not: a tree folded and the rows
     * under it slid up, or the list got shorter at its scroll end and
     * everything stepped down. The row the ghost was on is on its way
     * somewhere else, and so is whatever will end up under the pointer. The
     * ghost steps aside, and once every row has stood still for `STILL`
     * frames it shows on the row the pointer is on, in place. Aimed at once,
     * at where the rows would land, it glided to a row still sliding in: a
     * project folded at the rail's end sent it to the "N older" row of the
     * project above, a row the pointer was not on yet.
     */
    const settle = () => {
      const at = pointer;
      if (hovered || !at) {
        return;
      }
      waits += 1;
      const mine = waits;
      // Read in the next delivery, and each check a frame apart after it.
      readSoon("pointer", () => {
        if (pointer !== at || mine !== waits) {
          return;
        }
        if (nearest(at.x, at.y) === ghostRow && !rowsMoving()) {
          // Nothing left its place: the ghost follows its own row.
          const row = ghostRow;
          const box = row ? boxOf(row) : undefined;
          return () => {
            if (row && ghostRow === row) {
              placeGhost(row, box);
            }
          };
        }
        return () => {
          placeGhost(null, undefined);
          stillFor(at, mine, 0);
        };
      });
    };
    /** Once the rows have stood still for `STILL` frames, the ghost onto the row the pointer is on. */
    const stillFor = (
      at: { x: number; y: number },
      mine: number,
      still: number
    ): void =>
      readSoon("pointer", () => {
        if (pointer !== at || mine !== waits) {
          return;
        }
        const next = rowsMoving() ? 0 : still + 1;
        if (next < STILL) {
          return () => {
            stillFor(at, mine, next);
          };
        }
        // From out of view, so it lands without a glide.
        const best = nearest(at.x, at.y);
        const box = best ? boxOf(best) : undefined;
        return () => {
          if (pointer === at && mine === waits) {
            placeGhost(best, box);
          }
        };
      });

    /**
     * A hovering pointer only. A touch has nothing to hover, and a tap's
     * compatibility mousemove would leave the ghost aimed at the tapped row
     * with no mouseleave to end it — every later scroll of the list, a
     * swipe's tab strip following the gesture frame by frame, re-measured
     * the rows for a ghost that is never shown.
     */
    const onPointer = (event: PointerEvent) => {
      if (event.pointerType !== "touch") {
        onMove(event);
      }
    };
    /** Sent with a move, and with none when the rows shift under a still pointer. */
    const onOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        return;
      }
      if (pointer?.x === event.clientX && pointer.y === event.clientY) {
        settle();
      } else {
        onMove(event);
      }
    };
    const onLeave = () => {
      waits += 1;
      forgetScroll();
      pointer = null;
      if (!hovered) {
        // It fades from now, where its row stands. Placed as the list's
        // content moved under a still pointer (a `pointerover` the list had
        // not seen the pointer for), the place was the list's at that
        // moment; the list moving on without resizing, with the same row
        // under the pointer, set nothing measuring it again, and the ghost
        // faded, and stayed, off its row by as much (the spawn sheet's model
        // list, 142.469px or 142.016px down by the race). So the row is
        // measured in the next delivery, on that frame's layout, and the
        // fading ghost put on it there: measured here, in the pointer's own
        // event, its box styled the page again (2.8ms at 4x CPU).
        const row = ghostRow;
        placeGhost(null, undefined);
        if (row && withGhost) {
          readSoon("leave", () => {
            const box = row.isConnected && !skipped ? boxOf(row) : undefined;
            return () => {
              if (box && ghostRow === null) {
                drawGhost(box, false);
              }
            };
          });
        }
      }
    };
    /** When the reader last scrolled by hand: a wheel, a key, a touch. */
    let lastInput = Number.NEGATIVE_INFINITY;
    const onInput = () => {
      lastInput = performance.now();
    };
    /**
     * A scroll the reader makes carries the rows under a still pointer, and
     * the ghost follows to the row the pointer is on, frame by frame. The
     * rows do not move in the list's own space while it scrolls, so their
     * boxes are measured once, when the scroll begins, with the list's
     * frame; each scroll frame then reads only the scroll offset and checks
     * the pointer against those boxes, and the ghost is placed again only
     * when the row under the pointer changes. Re-aimed in full every frame
     * (`nearest`: what is drawn under the pointer, every row's style and
     * box), the tab track's scroll spent half its script here. Once the
     * scroll has stood still for `SCROLL_END`, the pointer is aimed in full
     * (a row covered by another surface is not the pointer's), and the
     * boxes are let go: anything that moves the rows (`laidOut`, a resize)
     * lets them go too.
     */
    let scrolling: {
      frame: ReturnType<typeof frameOf>;
      rows: { box: Omit<Box, "r">; row: HTMLElement }[];
    } | null = null;
    let scrollEnd: ReturnType<typeof setTimeout> | undefined;
    const forgetScroll = () => {
      clearTimeout(scrollEnd);
      scrolling = null;
    };
    /** The row whose box, as the scroll began, holds the pointer now: the scroll offset its only read. */
    const scrolledOnto = (
      at: { x: number; y: number },
      held: NonNullable<typeof scrolling>
    ): HTMLElement | null => {
      const local = inFrame(held.frame, at.x, at.y);
      let best: HTMLElement | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const { row, box } of held.rows) {
        if (!reaches(box, local)) {
          continue;
        }
        const distance = distanceTo(axis, local, box);
        if (distance < bestDistance) {
          best = row;
          bestDistance = distance;
        }
      }
      return best;
    };
    /** Read in the next delivery, whatever the scroll's own writes laid out. */
    const aimScrolling = () => {
      readSoon("pointer", () => {
        const at = pointer;
        if (!(at && ghostRow) || hovered) {
          return;
        }
        if (!scrolling) {
          const shares = new Map<HTMLElement, { x: number; y: number }>();
          scrolling = {
            frame: frameOf(),
            rows: rowsNow().flatMap((row) => {
              const box =
                getComputedStyle(row).pointerEvents === "none"
                  ? undefined
                  : placeOf(row, shares);
              return box ? [{ row, box }] : [];
            }),
          };
        }
        const best = scrolledOnto(at, scrolling);
        if (best === ghostRow) {
          return;
        }
        const box = best ? boxOf(best) : undefined;
        return () => {
          if (pointer === at) {
            placeGhost(best, box);
          }
        };
      });
      clearTimeout(scrollEnd);
      scrollEnd = setTimeout(() => {
        scrolling = null;
        if (pointer && ghostRow) {
          onMove({ clientX: pointer.x, clientY: pointer.y }, true);
        }
      }, SCROLL_END);
    };
    const onScroll = () => {
      if (!pointer) {
        return;
      }
      if (performance.now() - lastInput < OWN_SCROLL) {
        if (ghostRow && !hovered) {
          waits += 1;
          aimScrolling();
        }
        return;
      }
      // Nobody scrolled: the list moved itself under the pointer.
      forgetScroll();
      settle();
    };
    container.addEventListener("pointermove", onPointer);
    container.addEventListener("pointerover", onOver);
    container.addEventListener("pointerleave", onLeave);
    const passive = { capture: true, passive: true } as const;
    container.addEventListener("wheel", onInput, passive);
    container.addEventListener("touchmove", onInput, passive);
    container.addEventListener("keydown", onInput, passive);
    container.addEventListener("scroll", onScroll, passive);

    const watch = new MutationObserver((records) => {
      // A row moved without a size of its own changing: a list's padding, or
      // a virtual list's rows placed by their inline style (virtua's `top`).
      // The layers follow, without a glide, in the next frame.
      if (records.some((record) => record.attributeName === "style")) {
        toRealign();
      }
      // A row under the ghost can come to cover it (a tab chosen under
      // the pointer), or stop covering it.
      if (covered && ghostRow) {
        showOrCover();
      }
      if (hovered) {
        const row = container.querySelector<HTMLElement>(hovered);
        cancelAnimationFrame(pendingHide);
        if (row) {
          // Measured in the next delivery, as a pointer's aim is.
          readSoon("pointer", () => {
            const box = boxOf(row);
            return () => {
              if (row.matches(hovered)) {
                placeGhost(row, box);
              }
            };
          });
        } else {
          // A highlight moving from one row to the next can clear the old
          // row a task before it marks the new one: wait a frame before
          // taking the ghost away, so it glides instead of blinking.
          pendingHide = requestAnimationFrame(() => {
            if (!container.querySelector(hovered)) {
              placeGhost(null, undefined);
            }
          });
        }
      }
      // The pill follows in the next frame's delivery, on the layout that
      // frame has just done. Placed from here, in the microtask after the
      // change that moved the selection (a tab switch showing another
      // conversation), measuring the row laid the whole page out a second
      // time before the change could paint; measured in the frame's
      // callbacks, it laid out whatever the updates since the last frame
      // had changed, which on a page at rest is every hub message's.
      pillAim.readNext();
    });
    /** The pill to the selected row, read in a delivery (`readNext`). */
    const pillAim = frameObserver(null, {
      inside: () => {
        if (skipped) {
          return;
        }
        const at = selectedPill();
        return () => {
          if (!skipped) {
            placePill(true, at);
          }
        };
      },
    });
    watch.observe(container, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "aria-current",
        "aria-pressed",
        "aria-selected",
        "aria-checked",
        "data-state",
        "data-active",
        "data-highlighted",
        "data-selected",
        "style",
      ],
    });
    // A resize moves every row at once (heard on the frame line, as wide as
    // the list): the layers follow without a glide,
    // on the next frame, so placing them (which can toggle a scrollbar on a
    // scrolling list) never resizes the list inside its own observer.
    // Its first report places the pill, inside the delivery: the frame the
    // list mounts in has laid it out and not painted, so the selected row is
    // read there at no layout of its own and the pill is in that frame's
    // paint. The pill is an absolute layer under the rows: placing it
    // resizes nothing an observer watches.
    const sizes = frameObserver(() => onResize(), {
      // Read with every site's reads, placed after them (frameObserver).
      first: () => {
        if (skipped) {
          return;
        }
        const pillRead = selectedPill();
        return () => {
          if (!skipped) {
            placePill(false, pillRead);
          }
        };
      },
    });
    const onResize = () => {
      forgetScroll();
      if (skipped) {
        return;
      }
      pillRow = null;
      pillBox = null;
      syncPill(false);
      const box = ghostRow?.isConnected ? boxOf(ghostRow) : undefined;
      if (box) {
        drawGhost(box, false);
        ghostBox = box;
      }
    };
    sizes.observe(line);
    /**
     * Each layer onto its row's box as it stands now, where that is anywhere
     * else at all (`moved`: a residue under `same`'s half pixel is still a
     * place the layer is not), without a glide. A layer already on its row's
     * box is left as it is, so a glide on its way there runs on. Read in a
     * delivery, on the frame's own layout, and written once every site
     * there has read; a layer whose row changed in between (the pill
     * placed on another row in the same delivery) is left to that row.
     */
    const realign = () => {
      if (skipped) {
        return;
      }
      const pillOn = pillRow;
      const ghostOn = ghostRow;
      const pillAt = pillOn?.isConnected ? shownBoxOf(pillOn) : undefined;
      const ghostAt = ghostOn?.isConnected ? boxOf(ghostOn) : undefined;
      return () => {
        if (skipped) {
          return;
        }
        if (pillRow === pillOn && pillAt && pillBox && moved(pillAt, pillBox)) {
          draw(pill, pillAt, card);
          pillBox = pillAt;
        }
        if (
          ghostRow === ghostOn &&
          ghostAt &&
          ghostBox &&
          moved(ghostAt, ghostBox)
        ) {
          drawGhost(ghostAt, false);
          ghostBox = ghostAt;
        }
      };
    };
    /**
     * The rows the layers stand on, watched beside the list. A row's own box
     * can change while the list keeps its size: a tree's inset, measured
     * after the pill was placed (motion/branch `measureNests`), sets its rows
     * a step in and a step narrower, and a row whose edge is drawn
     * (`data-flip="box"`) travels to that width frame by frame (motion/rows
     * `spanOf`). Nothing else here heard it: placed while the width was on
     * its way, the rail's pill stood at the row's old width for good (198px
     * on a 185px row). A row's first report aims the layers once more too:
     * the box they were measured at may have moved on before it.
     */
    const watchedRows = new Set<Element>();
    // A watched row's report, and a move heard without one, aim the layers
    // in a delivery, on the layout the frame has just done.
    const rowWatch = frameObserver(null, { inside: realign });
    const toRealign = () => rowWatch.readNext();
    watchRows = () => {
      for (const row of watchedRows) {
        if (row !== pillRow && row !== ghostRow) {
          rowWatch.unobserve(row);
          watchedRows.delete(row);
        }
      }
      for (const row of [pillRow, ghostRow]) {
        if (row && !watchedRows.has(row)) {
          watchedRows.add(row);
          rowWatch.observe(row, { box: "border-box" });
        }
      }
    };
    watchRows();
    // An ancestor that moves the list (a popover scaling in, a sheet sliding
    // up on `sheet-in`) leaves a residue in what was measured mid-move: a
    // row's edges are put on the device-pixel grid where it is drawn, and a
    // move is no resize, so nothing measured them again. The rail's pill in
    // a tablet's sheet stood 0.37px off its row. Once an ancestor's
    // transition or animation ends, whatever it moved, the layers are aimed
    // again at where their rows stand.
    const settled = (event: Event) => {
      const { target } = event;
      if (
        target instanceof Element &&
        target !== container &&
        target.contains(container)
      ) {
        toRealign();
      }
    };
    for (const type of SETTLES) {
      document.addEventListener(type, settled, true);
    }
    /**
     * A move on the Web Animations API sends none of those events: a Svelte
     * transition (an `in:` or `out:` scaling the list), on the list itself
     * or round it. Placed while one runs, the layers keep its residue (the
     * Project select's ghost, its row's edges on the device-pixel grid of a
     * list still scaling, drew another antialiasing on each walk of
     * usage/project-pick-many). Each placement waits on every animation then
     * running on the list or round it, and once it finishes the layers are
     * aimed again at where their rows stand. Asked in the next delivery,
     * whose style is the frame's own: asked where the layer was placed,
     * after its writes, `getAnimations` styled the page again there.
     */
    const awaited = new WeakSet<Animation>();
    const afterMoves = () =>
      readSoon("moves", () => {
        for (let at: Element | null = container; at; at = at.parentElement) {
          for (const run of at.getAnimations()) {
            if (run.playState !== "finished" && !awaited.has(run)) {
              awaited.add(run);
              run.finished.then(toRealign, () => undefined);
            }
          }
        }
      });
    // A list an ancestor skips (the home board put away under a
    // conversation) has no layout to measure, and measuring it would lay it
    // out: the layers wait, and are placed afresh, without a glide, the
    // frame it is rendered again.
    const watching = watchRendered(line, (on) => {
      skipped = !on;
      onResize();
    });

    // A list that measures its rows moves the layers each time it does: the
    // ghost glides to the row under the pointer now (or its own row, or
    // away if its row has gone), and the pill onto the selected row. Read
    // here, in the update that moved them, so the layers move in the frame
    // the rows do: the list measured them on that frame's layout.
    if (laidOut) {
      $effect(() => {
        laidOut();
        untrack(() => {
          forgetScroll();
          if (pointer && !hovered) {
            waits += 1;
            showGhost(nearest(pointer.x, pointer.y));
          } else if (ghostRow) {
            showGhost(ghostRow.isConnected ? ghostRow : null);
          }
          syncPill(true);
        });
      });
    }

    return () => {
      forgetScroll();
      cancelAnimationFrame(pendingHide);
      pillAim.disconnect();
      readSite.disconnect();
      waits += 1;
      followed += 1;
      container.removeEventListener("pointermove", onPointer);
      container.removeEventListener("pointerover", onOver);
      container.removeEventListener("pointerleave", onLeave);
      container.removeEventListener("wheel", onInput, { capture: true });
      container.removeEventListener("touchmove", onInput, { capture: true });
      container.removeEventListener("keydown", onInput, { capture: true });
      container.removeEventListener("scroll", onScroll, { capture: true });
      for (const type of SETTLES) {
        document.removeEventListener(type, settled, true);
      }
      rowWatch.disconnect();
      watch.disconnect();
      sizes.disconnect();
      watching.stop();
      ghostRow?.removeAttribute("data-ghosted");
      line.remove();
      for (const one of [ghost, trail, pill]) {
        for (const run of one.run?.anims ?? []) {
          run.cancel();
        }
        one.el.remove();
      }
      delete container.dataset.highlight;
      container.removeAttribute("data-ghost-shown");
      if (ownIsolate) {
        container.classList.remove("isolate");
      }
    };
  };
}
