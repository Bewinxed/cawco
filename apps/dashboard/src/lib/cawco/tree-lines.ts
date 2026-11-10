/**
 * A tree as one flat list (design.css `kit-tree`): every row an item of one
 * keyed each, so a row that changes parent (a regroup) is the same node and
 * only moves. Each row draws its own share of the nesting lines beside it
 * (TreeLine, `kit-tree-line`), the way VS Code's indent guides and headless
 * tree libraries draw a tree on flat rows: a row knows its depth and, for
 * each level above it, whether the line at that level runs on past it. The
 * same facts are the WAI-ARIA tree pattern's (`aria-level`,
 * `aria-posinset`, `aria-setsize`), which carry the nesting to a reader now
 * that no list sits inside another.
 *
 *   <ul class="kit-tree" {@attach treeLines("[data-tree-mark]")}>
 *     {#each flatTree(roots, kids, key) as row (row.key)}
 *       <li class="kit-tree-row" {...lineAttrs(row.line)}
 *           style:--line-depth={row.line.depth}>
 *         <TreeLine line={row.line} />
 *         …the row…
 *
 * Where each row's glyph stands is measured (`treeLines`), not assumed: its
 * centre from the row's top, and from the row's inline start, and how far
 * its foot is above the row's foot. A row is read when it is first laid out
 * and again only when its size changes (a font landing, a finger's taller
 * rows, a step's words wrapping); a regroup reorders rows that keep their
 * size, so it reads nothing and writes only what the new order changes.
 */
import type { Attachment } from "svelte/attachments";
import { type FrameObserver, frameObserver } from "./frame-observer";

/** A row's place in its tree: what its share of the lines and its aria name. */
export interface Line {
  depth: number;
  /** The first child of its parent: its elbow leaves the parent's glyph. */
  first: boolean;
  /** The last child of its parent: its own rail ends at its elbow. */
  last: boolean;
  /** Its place among its parent's children, 1 first. */
  pos: number;
  /** The levels above it (1 to depth - 1) whose line runs on past it. */
  rails: number[];
  /** How many children its parent has. */
  size: number;
}

export interface FlatRow<T> {
  key: string;
  line: Line;
  node: T;
}

/**
 * A tree's rows in reading order, each with its place (`Line`): depth
 * first, every row followed by its children.
 */
export function flatTree<T>(
  roots: readonly T[],
  childrenOf: (node: T) => readonly T[],
  keyOf: (node: T) => string
): FlatRow<T>[] {
  const rows: FlatRow<T>[] = [];
  // Whether the line at each level runs on past the row being placed.
  const runsOn: boolean[] = [];
  const walk = (nodes: readonly T[], depth: number) => {
    nodes.forEach((node, at) => {
      const last = at === nodes.length - 1;
      const rails: number[] = [];
      for (let level = 1; level < depth; level += 1) {
        if (runsOn[level]) {
          rails.push(level);
        }
      }
      rows.push({
        key: keyOf(node),
        node,
        line: {
          depth,
          first: at === 0,
          last,
          pos: at + 1,
          rails,
          size: nodes.length,
        },
      });
      runsOn[depth] = !last;
      walk(childrenOf(node), depth + 1);
    });
  };
  walk(roots, 0);
  return rows;
}

/** A row's attributes: its depth and place, for the lines and for a reader. */
export const lineAttrs = (line: Line) => ({
  "data-line-row": "",
  "data-line-depth": line.depth,
  "data-line-first": line.first && line.depth > 0 ? "" : undefined,
  "aria-level": line.depth + 1,
  "aria-posinset": line.pos,
  "aria-setsize": line.size,
});

/* ── Where each row's glyph stands ─────────────────────────────────── */

/** What a row's lines are placed by, read off its layout. */
interface Geo {
  /** Its glyph's foot from its own foot. */
  below: number;
  /** Its glyph's centre from its inline start (past its inset), or null with no glyph. */
  centre: number | null;
  /** How much wider than a tree mark its glyph is, halved: each level's step moves by it. */
  drift: number;
  /** The gap above it (its own margin). */
  gap: number;
  /** Its glyph's centre from its top. */
  y: number;
}

const geos = new WeakMap<Element, Geo>();
/** Each list's glyph, by the list. */
const glyphs = new WeakMap<Element, string>();
/** What was last written on each row, so a value that holds writes nothing. */
const written = new WeakMap<Element, string>();

const ROW = "[data-line-row]";

/**
 * How an element is drawn off its own layout: its `translate`, `scale` and
 * `transform`, as a size it is drawn at (`sx`, `sy`) about its origin
 * (`ox`, `oy`, from its box's corner) and a move (`tx`, `ty`). Null where it
 * is drawn as laid out.
 */
interface Drawn {
  ox: number;
  oy: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
}

const numbers = (value: string): number[] =>
  value.split(" ").map((part) => Number.parseFloat(part));

function drawnOff(element: Element): Drawn | null {
  const style = getComputedStyle(element);
  if (
    style.translate === "none" &&
    style.scale === "none" &&
    style.transform === "none"
  ) {
    return null;
  }
  const [tx = 0, ty = 0] =
    style.translate === "none" ? [] : numbers(style.translate);
  const [sx = 1, sy = sx] = style.scale === "none" ? [] : numbers(style.scale);
  const matrix =
    style.transform === "none" ? null : new DOMMatrixReadOnly(style.transform);
  const [ox = 0, oy = 0] = numbers(style.transformOrigin);
  // `translate`, then `scale`, then `transform`, all about the one origin.
  return {
    ox,
    oy,
    sx: sx * (matrix?.m11 ?? 1),
    sy: sy * (matrix?.m22 ?? 1),
    tx: tx + sx * (matrix?.m41 ?? 0),
    ty: ty + sy * (matrix?.m42 ?? 0),
  };
}

/** A box where it is laid out, in the viewport. */
interface Laid {
  height: number;
  left: number;
  top: number;
  width: number;
}

/**
 * A row's glyph where it is laid out: its drawn box taken back through
 * every move and every size between it and the row, outermost first (a
 * regroup's flight on the row's own box; a fold's ride on the glyph, which
 * moves it and, for a parent's deck's cards, draws it smaller), to the
 * subpixel. Each element's is undone about its own origin, so the box is
 * its layout's whatever it is drawn through. Null while one of them is
 * drawn at no size: nothing is left to read it from.
 */
function laidOut(mark: HTMLElement, row: HTMLElement): Laid | null {
  const off: { drawn: Drawn; element: Element }[] = [];
  for (
    let element: Element | null = mark;
    element && element !== row;
    element = element.parentElement
  ) {
    const drawn = drawnOff(element);
    if (drawn) {
      off.unshift({ drawn, element });
    } else if (element === mark) {
      off.unshift({
        drawn: { ox: 0, oy: 0, sx: 1, sy: 1, tx: 0, ty: 0 },
        element,
      });
    }
  }
  // What is over the element being read draws a point of its layout, `at`,
  // at `at * size + move` on each axis.
  let [sizeX, moveX, sizeY, moveY] = [1, 0, 1, 0];
  let laid: Laid | null = null;
  for (const { drawn, element } of off) {
    if (drawn.sx === 0 || drawn.sy === 0) {
      return null;
    }
    const box = element.getBoundingClientRect();
    laid = {
      width: box.width / sizeX / drawn.sx,
      height: box.height / sizeY / drawn.sy,
      left: (box.left - moveX) / sizeX - drawn.tx - drawn.ox * (1 - drawn.sx),
      top: (box.top - moveY) / sizeY - drawn.ty - drawn.oy * (1 - drawn.sy),
    };
    moveX += sizeX * ((laid.left + drawn.ox) * (1 - drawn.sx) + drawn.tx);
    moveY += sizeY * ((laid.top + drawn.oy) * (1 - drawn.sy) + drawn.ty);
    sizeX *= drawn.sx;
    sizeY *= drawn.sy;
  }
  return laid;
}

/**
 * What a row's lines are placed by: its glyph where it is laid out
 * (`laidOut`), against the row.
 */
function geoOf(row: HTMLElement, glyph: string): Geo | null {
  if (row.offsetParent === null) {
    return null;
  }
  const box = row.getBoundingClientRect();
  const style = getComputedStyle(row);
  const rtl = style.direction === "rtl";
  const mark = row.querySelector<HTMLElement>(glyph);
  if (!mark) {
    return {
      centre: null,
      drift: 0,
      gap: Number.parseFloat(style.marginBlockStart) || 0,
      y: box.height / 2,
      below: box.height / 2,
    };
  }
  const laid = laidOut(mark, row);
  if (!laid) {
    return null;
  }
  const centreX = laid.left + laid.width / 2;
  const y = laid.top + laid.height / 2 - box.top;
  const inset = Number.parseFloat(style.paddingInlineStart) || 0;
  const start = rtl ? box.right - inset : box.left + inset;
  const half = Number.parseFloat(style.getPropertyValue("--line-half")) || 0;
  return {
    centre: rtl ? start - centreX : centreX - start,
    drift: half > 0 ? laid.width / 2 - half : 0,
    gap: Number.parseFloat(style.marginBlockStart) || 0,
    y,
    below: box.height - (y + laid.height / 2),
  };
}

const px = (value: number) => `${value.toFixed(2)}px`;

/** The rows above the one being placed, by depth: each level's inset shift and glyph centre. */
type Chain = { centre: number; shift: number }[];

/**
 * What one row's lines are placed by, from what is known of it and of the
 * rows above it: its glyph's centre a step (and the drift a narrower glyph
 * makes) in from its parent's, a level at a time from the root's (`x0`); a
 * first child's reach up to its parent's glyph's foot (the gap above it,
 * and the parent's own foot under its glyph, `above`); and, for each level
 * above it whose rail it draws, that level's row's inset and glyph, so the
 * rail stands where that row's own stretch of it does.
 */
function varsOf(
  row: HTMLElement,
  geo: Geo,
  x0: number | null,
  above: Geo | undefined,
  chain: Chain
): { shift: number; vars: [string, string][] } {
  const depth = Number(row.dataset.lineDepth ?? 0);
  const root = x0 ?? geo.centre ?? 0;
  const shift = geo.centre === null ? 0 : root + depth * geo.drift - geo.centre;
  const lead =
    row.hasAttribute("data-line-first") && above ? geo.gap + above.below : 0;
  const vars: [string, string][] = [
    ["--line-s", px(shift)],
    ["--line-c", px(geo.centre ?? 0)],
    ["--line-y", px(geo.y)],
    ["--line-lead", px(lead)],
    ["--line-drift", px(geo.drift)],
  ];
  chain.forEach((each, level) => {
    if (level > 0) {
      vars.push([`--rail-s-${level}`, px(each.shift)]);
      vars.push([`--rail-c-${level}`, px(each.centre)]);
    }
  });
  return { shift, vars };
}

/** Writes a row's place, unless it already stands there. */
function write(row: HTMLElement, shift: number, vars: [string, string][]) {
  const values = vars.map(([, value]) => value).join("|");
  if (written.get(row) === values) {
    return;
  }
  written.set(row, values);
  row.style.setProperty("--line-shift", px(shift));
  const line = row.querySelector<HTMLElement>(":scope > [data-tree-line]");
  for (const [name, value] of vars) {
    line?.style.setProperty(name, value);
  }
}

/**
 * Every row of `list` placed from what is known of each (`geos`), in
 * order (`varsOf`). Only what changed is written. Reads nothing off the
 * page.
 */
function place(list: Element): void {
  let x0: number | null = null;
  let above: Geo | undefined;
  const chain: Chain = [];
  for (const row of list.children) {
    if (!(row instanceof HTMLElement && row.matches(ROW))) {
      continue;
    }
    const geo = geos.get(row);
    const depth = Number(row.dataset.lineDepth ?? 0);
    if (depth === 0) {
      x0 = geo?.centre ?? x0;
    }
    chain.length = depth;
    if (geo) {
      const { shift, vars } = varsOf(row, geo, x0, above, chain);
      write(row, shift, vars);
      chain[depth] = { centre: geo.centre ?? 0, shift };
    }
    above = geo;
  }
}

/** Rows read: each one's glyph, on the layout as it stands. Returns the lists they are in. */
function read(rows: Iterable<Element>): Set<Element> {
  const lists = new Set<Element>();
  for (const row of rows) {
    const list = row.parentElement;
    const glyph = list && glyphs.get(list);
    if (!(glyph && row instanceof HTMLElement && row.isConnected)) {
      continue;
    }
    const geo = geoOf(row, glyph);
    if (geo) {
      geos.set(row, geo);
    }
    lists.add(list);
  }
  return lists;
}

/**
 * Rows a fold has just shown, read and placed now, in the task that shows
 * them and before it reads their lines (motion/branch).
 */
export function settleLines(rows: Iterable<Element>): void {
  for (const list of read(rows)) {
    place(list);
  }
}

/**
 * Every row's size, heard on the frame's own layout (frameObserver
 * `inside`): a row is read as it is first laid out, in the frame that lays
 * it out, and again when its size changes, and its list placed before that
 * frame is painted, so a row's lines are never drawn a frame where it was.
 * Every list's rows are read before any is written.
 */
let sizes: FrameObserver | null = null;
const rowSizes = (): FrameObserver => {
  sizes ??= frameObserver(null, {
    inside: (entries) => {
      const lists = read(entries.map((entry) => entry.target));
      return lists.size > 0
        ? () => {
            for (const list of lists) {
              place(list);
            }
          }
        : undefined;
    },
  });
  return sizes;
};

/** Rows that came and went: the new ones watched, the gone ones let go of. */
function heardRows(records: MutationRecord[], observer: FrameObserver): void {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (node instanceof Element && node.matches(ROW)) {
        observer.observe(node, { box: "border-box" });
      }
    }
    for (const node of record.removedNodes) {
      if (node instanceof Element && !node.isConnected) {
        observer.unobserve(node);
      }
    }
  }
}

/**
 * The tree's list: each row's glyph (`glyph`, a selector inside the row) is
 * read as the row is first laid out and again when its size changes, and
 * every row is placed again, from what is known of each, when rows come,
 * go, move or change depth: before the frame, reading nothing.
 */
export function treeLines(glyph: string): Attachment<HTMLElement> {
  return (list) => {
    glyphs.set(list, glyph);
    const observer = rowSizes();
    for (const row of list.children) {
      if (row.matches(ROW)) {
        observer.observe(row, { box: "border-box" });
      }
    }
    const order = new MutationObserver((records) => {
      heardRows(records, observer);
      place(list);
    });
    order.observe(list, { childList: true });
    // Its rows' own depth and place, heard on the rows alone: a change
    // anywhere else inside a row (its words, its age) is nothing to place.
    const moves = new MutationObserver(() => place(list));
    moves.observe(list, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-line-depth", "data-line-first"],
    });
    return () => {
      order.disconnect();
      moves.disconnect();
      for (const row of list.children) {
        observer.unobserve(row);
      }
    };
  };
}
