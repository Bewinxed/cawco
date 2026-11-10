/**
 * A tree's fold: the rows under a parent row opening and folding away, the
 * same in every list that nests rows (the rail's projects, sessions and
 * delegates at every depth, the home's Working and Finished, a run step's
 * result). One primitive, read off one moving point: the head of the line
 * that leaves the parent's glyph, measured from the glyph's centre.
 *
 * The line. Each child's line (design.css .kit-tree-line) runs from the parent's
 * glyph down the rail, round the corner of its elbow and out along its arm
 * to the child's glyph. Its head travels the whole tree at one pace: as far
 * along every branch at once, so where the rail meets a
 * corner it carries on round it and out along the arm without a pause,
 * while the rail carries on down to the next child. Each stretch of line is
 * cut where the head has got to, along the stroke, the corner by its arc's
 * length. Drawn as two motions, the rail tracking the room's edge and each
 * arm on its child's own swipe, the line stalled at every corner and
 * restarted at another speed.
 *
 * The glyphs ride the line. A child's glyph is on the tip of its own line
 * for the whole trip: its centre is the point `min(head, arrive)` along the
 * path its line draws, from the parent's glyph's centre down the rail,
 * round its elbow and out along its arm, on to its own place (`rideOf`).
 * Its place is a function of the head alone, sampled into keyframes as the
 * line's cuts are (`rideFrames`), `translate`, `scale` and `opacity` only.
 * It starts under the parent's glyph, which stands over it (app.css). Where
 * the parent stands on a deck (TreeMark `[data-deck]`), the first
 * children are its cards: each starts as its card, the parent's colour at
 * its card's size and place, and comes to its own colour and size on the
 * way (its `[data-ride-skin]` fades off it); the deck itself is away from
 * the frame the line sets off to the frame the group starts to fold. The
 * rest start at the parent's glyph and fade in over --ride-fade. A glyph
 * flew in from its row's left edge once the head had reached it, on a clock
 * of its own: it met the line, it did not arrive on it.
 *
 * Opening. The line leads. Its head glides at one steady speed (curves
 * `glide`: at speed from its first frame, easing out over its last px), so the
 * children are reached at even times: --duration-stagger apart, or closer
 * together in a tree too tall to open within --duration-cascade. The room opens
 * downward from the parent row's bottom edge at the same speed: the
 * parent's box (`data-flip="box"` in a `reflow`, motion/rows) is laid out at
 * its new size at once and its edge is uncovered, while everything under it
 * slides down with that edge, all from one frame and at the pace the tree
 * asks of the batch (`atTravel`), so the head, which starts above the room's
 * top, is never below its edge. On the rows' in-out curve, the room set the
 * pace and the head rode it: the children were reached 22ms, then 134ms
 * apart. The moment the head reaches a child's place, its glyph has landed
 * and its title wipes in left to right, on --ease-out over --duration-morph. No
 * row ever moves: each stands at its place inside the growing box, and only
 * its glyph is drawn on its way there. Every piece in view is built before
 * the opening starts, held at its first frame, and all are started together
 * on the batch's frame (`open`): built as the head neared each, a tree of
 * seven made 6, 16 and 16 animations in its first three frames, and Safari
 * took 38 to 73ms over each of them.
 *
 * Folding. The group leaves as one piece, quicker than it opened and under
 * way in the next frame, from the click's own time (motion/rows `now`): it
 * is closed from its foot over --duration-exit, on the rows' curve, as the rows
 * under it slide up with the room's edge (the batch's "close" pace). The
 * close is one edge: each of the group's rows is cut at it (a clip a row,
 * all on one clock and one curve), so the line shortens from its foot up
 * the rail and on up to the parent's glyph, where the edge stops; then the
 * rows unmount. Each row left on its own (its title wiped out, its glyph
 * rode the line back, each stretch of line was cut back): thirty-eight
 * animations for a tree of seven, made inside a fold that is shown in ten
 * frames, and Safari showed four.
 *
 * Turned back mid-way, an opening carries on from where the fold left the
 * room, with every row as it stood; a fold takes an opening as it stands,
 * its pieces held at the click's time, and closes over them. Either starts
 * at that same time with the rows under it, so the next frame already
 * shows it under way. Waiting for a batch of its own, the line stood still
 * a frame (a fold) or two (an opening) at every turn.
 *
 * Reduced motion: nothing travels. Opening, the room lands at once and the
 * children fade in; folding, they fade out where they stand and then the
 * room closes at once.
 *
 * Measuring. A turn writes first and reads after, once: every attribute it
 * sets goes on as it is asked for, and it reads its group (`measure`) only
 * when every turn of the same update has written its own (`afterWrites`),
 * so one click styles a tree's rows once however many lists the tree is
 * open in. The reads themselves are a few ms for a tree of 150 once the
 * page is styled: each row's and glyph's drawn box, each stroke's box and
 * corner, and its layout box, every offset parent read once for the whole
 * tree (`layoutBoxes`). Every row is read, in view or not: a tree's rows
 * differ in height (a row with a box open under it, a run step's wrapped
 * words), so none is placed by arithmetic. A fold reads its rows' boxes
 * and its parent's glyph alone, then takes them out of the flow as its
 * last write, and motion/rows reads after it. A tree opening has one layout
 * to pay in the task that shows it, its rows', and its rows' lines stand
 * in it already: CSS places them (design.css `kit-tree`).
 *
 * Markup. A tree is one flat list (tree-lines.ts, design.css `kit-tree`):
 * the group is the rows a parent shows, every row of its subtree that
 * mounts or unmounts in one update, each `in:branch` and `out:branch`; the
 * turns of one update are taken together, as one group, under the nearest
 * row of the list that stays (its parent). Each row's share of the line is
 * its own strokes (TreeLine): the strokes of the levels the group draws
 * are cut as the head passes, the rails of the levels above it stand with
 * the room. A box that scrolls its own rows (OlderRows) is a group of one
 * element, under the row whose element holds it (an `li`, or a box marked
 * `data-nest-host`). Each row, at any depth, is `data-branch-item`, with
 * its glyph matching `glyph`. While a group turns, each of its elements is
 * `data-flip-anchor`, so reflow never copies or uncovers it, and slides
 * only the rows around it.
 *
 *   {#each rows as row (row.key)}
 *     <li class="kit-tree-row" {...lineAttrs(row.line)}
 *         in:branch={TREE} out:branch={TREE}>
 *       <TreeLine line={row.line} />
 */

import type { TransitionConfig } from "svelte/transition";
import {
  CURVE,
  dur,
  easeInOut,
  easeOut,
  glide,
  glideSpeed,
  motionOk,
  numberOf,
} from "./curves.svelte";
import {
  atTravel,
  BLEED,
  beforeReflow,
  heldToTravel,
  skippedAt,
} from "./rows.svelte";
import { regrouping } from "./share.svelte";

export interface BranchOptions {
  /** A row's glyph, a selector inside the row: its line ends there. */
  glyph: string;
  /** The parent row's glyph, where it is another kind (a project's mark). */
  parent?: string;
}

/* ── Where things are laid out ─────────────────────────────────────── */

interface Box {
  height: number;
  left: number;
  top: number;
  width: number;
}

/**
 * Layout boxes on the page, transforms ignored, for one pass of reads: each
 * offset parent's own corner is read once and kept. Walked to the root from
 * every element in turn, the ancestors a tree's rows share were read again
 * for every row and every glyph: three walks a row, some sixty offsets each,
 * in the task that folds a tree of 140.
 */
function layoutBoxes(): (element: HTMLElement) => Box {
  const corners = new Map<HTMLElement, { left: number; top: number }>();
  const placed = (at: HTMLElement): { left: number; top: number } => {
    const known = corners.get(at);
    if (known) {
      return known;
    }
    const up = at.offsetParent instanceof HTMLElement ? at.offsetParent : null;
    const base = up ? placed(up) : null;
    const corner = {
      left:
        at.offsetLeft +
        (up && base ? base.left + up.clientLeft - up.scrollLeft : 0),
      top:
        at.offsetTop +
        (up && base ? base.top + up.clientTop - up.scrollTop : 0),
    };
    corners.set(at, corner);
    return corner;
  };
  return (element) => ({
    ...placed(element),
    width: element.offsetWidth,
    height: element.offsetHeight,
  });
}

const px = (value: number) => `${value.toFixed(2)}px`;

/**
 * A glyph's centre in the viewport where it is laid out: where it is drawn,
 * less its own ride (a glyph on its way along its line is drawn off its
 * place, and scaled about that centre).
 */
function restOf(glyph: HTMLElement): { x: number; y: number } {
  const box = glyph.getBoundingClientRect();
  const ridden = getComputedStyle(glyph).translate;
  const [dx = 0, dy = 0] =
    ridden === "none"
      ? []
      : ridden.split(" ").map((length) => Number.parseFloat(length));
  return {
    x: box.left + box.width / 2 - dx,
    y: box.top + box.height / 2 - dy,
  };
}

/** How far an element is drawn off its layout by its own `translate` and `transform`'s move. */

/* ── A group: the rows that turn together ─────────────────────────── */

/** A row of a flat tree (tree-lines.ts). */
const ROW = "[data-line-row]";
/** A row's start of the line under its glyph, while its first child follows it (TreeLine). */
const START = ":scope > [data-tree-line] > [data-line-down]";

const depthOf = (row: Element): number =>
  Number((row as HTMLElement).dataset.lineDepth ?? 0);

/**
 * The rows that open or fold under one parent in one update: the parent's
 * child rows and every row under them that turns with them, in the page's
 * order; or one box of rows (OlderRows).
 */
interface Group {
  els: HTMLElement[];
  options: BranchOptions;
  /** The parent row's own element: where its glyph is, and its flight's key. */
  parent: HTMLElement;
}

/**
 * The row a turning element hangs under: for a tree's row, the nearest row
 * before it one level up; for a box, the row whose element holds it.
 */
function parentOf(node: HTMLElement): HTMLElement | null {
  if (!node.matches(ROW)) {
    return (
      node.parentElement?.closest<HTMLElement>("li, [data-nest-host]") ?? null
    );
  }
  const depth = depthOf(node);
  for (
    let at = node.previousElementSibling;
    at && depth > 0;
    at = at.previousElementSibling
  ) {
    if (at.matches(ROW) && depthOf(at) < depth) {
      return depthOf(at) === depth - 1 ? (at as HTMLElement) : null;
    }
  }
  return null;
}

/** A parent row's child rows as they stand in its list. */
function childrenOf(parent: HTMLElement): HTMLElement[] {
  const depth = depthOf(parent);
  const kids: HTMLElement[] = [];
  for (
    let at = parent.nextElementSibling;
    at?.matches(ROW) && depthOf(at) > depth;
    at = at.nextElementSibling
  ) {
    if (depthOf(at) === depth + 1) {
      kids.push(at as HTMLElement);
    }
  }
  return kids;
}

/** The group's own line's parent element's glyph. */
function parentGlyph(group: Group, selector: string) {
  return group.parent.querySelector<HTMLElement>(selector);
}

/**
 * Groups mounted but not yet shown (`open`): laid out a task after the
 * update that drew them.
 */
const unshown = new WeakSet<Element>();

/**
 * Each row of a group, in order, with the line each of its strokes and its
 * glyph is on: the parent's own (`null`), a row of the group's (its
 * element), or none (`undefined`: a rail of a level above the parent's,
 * standing with the room, never cut). Read off the rows' attributes alone.
 */
interface GroupRow {
  /** The line its glyph hangs from. */
  hangs: HTMLElement | null;
  row: HTMLElement;
  strokes: { line: HTMLElement | null; span: HTMLElement }[];
}

/**
 * A first child's line starts under its parent's glyph, in its parent's
 * row (TreeLine `data-line-down`): that stroke is the top of the line the
 * child hangs from (`hung`), before its elbow.
 */
function startStroke(
  row: HTMLElement,
  hung: HTMLElement | null | undefined
): GroupRow["strokes"] {
  const start = row.hasAttribute("data-line-first")
    ? row.previousElementSibling?.querySelector<HTMLElement>(START)
    : null;
  return start && hung !== undefined ? [{ line: hung, span: start }] : [];
}

function rowsOf(group: Group): GroupRow[] {
  const { parent } = group;
  const home = parent.parentElement;
  const parentDepth = parent.matches(ROW) ? depthOf(parent) : -1;
  // The rows above each row in its own list, by depth.
  const chains = new Map<Element, HTMLElement[]>();
  const found: GroupRow[] = [];
  /** The line from the row at `depth` above a row in `list`. */
  const lineAt = (
    list: Element,
    depth: number
  ): HTMLElement | null | undefined => {
    const own = list === home ? parentDepth : -1;
    if (depth < own) {
      return undefined;
    }
    if (depth === own || depth < 0) {
      return null;
    }
    return chains.get(list)?.[depth] ?? null;
  };
  for (const el of group.els) {
    const rows = [
      ...(el.matches(ROW) ? [el] : []),
      ...el.querySelectorAll<HTMLElement>(ROW),
    ];
    for (const row of rows) {
      const list = row.parentElement;
      if (!list) {
        continue;
      }
      const depth = depthOf(row);
      const chain = chains.get(list) ?? [];
      chains.set(list, chain);
      chain.length = depth;
      const hung = lineAt(list, depth - 1);
      const strokes = startStroke(row, hung);
      for (const span of row.querySelectorAll<HTMLElement>(
        ":scope > [data-tree-line] > [data-line-level]"
      )) {
        const line = lineAt(list, Number(span.dataset.lineLevel) - 1);
        if (line !== undefined) {
          strokes.push({ line, span });
        }
      }
      found.push({ row, hangs: hung ?? null, strokes });
      chain[depth] = row;
    }
  }
  return found;
}

/**
 * The line's start under the group's parent's glyph (TreeLine
 * `data-line-down`), drawn while the group's first row follows the parent;
 * none for a box of rows.
 */
function startOf(group: Group): HTMLElement | null {
  const [first] = group.els;
  return first?.matches("[data-line-first]") &&
    first.previousElementSibling === group.parent
    ? group.parent.querySelector<HTMLElement>(START)
    : null;
}

/** The group's strokes, cut as the head passes (design.css `data-branch-cut`). */
const CUT = "data-branch-cut";

function markCuts(group: Group, on: boolean): void {
  for (const { strokes } of rowsOf(group)) {
    for (const { span } of strokes) {
      span.toggleAttribute(CUT, on);
    }
  }
}

/* ── The fold's shape ──────────────────────────────────────────────── */

/**
 * One stretch of line (TreeLine): a row's elbow (down from the row above,
 * round its corner, out along its arm to its glyph) or a straight rail (on
 * past a row to its next sibling, or past a row deeper in). `from` is how
 * far along the line its top is, from where the line leaves its parent's
 * glyph.
 */
interface Stretch {
  /** An elbow's corner radius; a straight stretch has none. */
  corner: number;
  el: HTMLElement;
  from: number;
  height: number;
  /** Laid out right to left: its rail is its right edge, its arm runs left. */
  rtl: boolean;
  /** In the group's frame. */
  top: number;
  width: number;
  /** Its box's left and top edges in the viewport, to the subpixel. */
  x: number;
  y: number;
}

/** An elbow's corner, its stroke's centre on it, and the run down to it. */
function cornerOf(stretch: Stretch) {
  const corner = Math.min(stretch.corner, stretch.height, stretch.width);
  const centre = Math.max(0, corner - 0.5);
  return {
    corner,
    centre,
    down: stretch.height - corner,
    arc: (Math.PI / 2) * centre,
  };
}

/** How far along the line a stretch ends: an elbow at its glyph, a straight stretch at its foot. */
function endOf(stretch: Stretch): number {
  if (stretch.corner <= 0) {
    return stretch.from + stretch.height;
  }
  const { corner, down, arc } = cornerOf(stretch);
  return stretch.from + down + arc + stretch.width - corner;
}

/**
 * A glyph's way along its line: from the centre of its parent's glyph, down
 * the rail, round its elbow and out along its arm to its own place.
 */
interface Ride {
  /** Its offset from its place, `d` along its way. */
  at: (d: number) => [x: number, y: number];
  /** How far along the whole line its way starts: at its parent's glyph. */
  base: number;
  /** How far along its way it bends: where its corner starts, a few points round it, where it ends. */
  bends: number[];
  /** Its place in its parent's deck (1 nearest), or 0: it is no card. */
  card: number;
  /** Its parent's colour, for the card it starts as. */
  fill: string;
  /** How far along its way it starts: a card, at its place in the deck. */
  lead: number;
  /** Its way's whole length. */
  length: number;
  /** What it wears as a card (its `[data-ride-skin]`). */
  skin: HTMLElement | null;
}

/** How many chords a glyph's way round its corner is drawn as: each within a seventh of a pixel of the arc. */
const ROUND = 4;

interface Item {
  /** How far along the line its glyph is: at its place, or straight down. */
  arrive: number;
  bottom: number;
  /** Its glyph's centre in the viewport, where it is laid out. */
  centre: { x: number; y: number } | null;
  el: HTMLElement;
  icon: HTMLElement | null;
  /** Where its title starts, from the row's left edge: past its glyph. */
  reveal: number;
  /** Its glyph's way to its place; none without a glyph. */
  ride: Ride | null;
  /** In the group's frame. */
  top: number;
  width: number;
}

interface Shape {
  /** The room's height: how far the group's rows reach under the parent. */
  height: number;
  items: Item[];
  /** The whole line's length, to the furthest glyph. */
  length: number;
  /** Each element of the group in its frame: what the room uncovers. */
  rooms: { bottom: number; el: HTMLElement; top: number }[];
  /**
   * Whether a stretch of the group's frame is in the viewport where the
   * group is drawn now or where it is laid out (a slide carrying the group
   * runs between the two). Off it at both, nobody sees it move.
   */
  seen: (top: number, bottom: number) => boolean;
  /** Where the line leaves the parent's glyph, from the group's top. */
  start: number;
  stretches: Stretch[];
  /** How far along the line the group's own rail runs straight down: the head is never further down than that. */
  trunk: number;
}

/**
 * A line from a parent's glyph: how far down the group its parent's glyph's
 * centre is, where it starts, and how far along the whole line that is; and
 * the deck the parent stands on, whose cards its first children start as.
 */
interface Line {
  at: number;
  base: number;
  /** How many cards the parent's deck shows. */
  cards: number;
  /** The parent's colour. */
  fill: string;
  /** How far under the parent's centre each card's centre is, a place. */
  step: number;
}

/**
 * A row's stroke on `line`, in the group's frame. The fold's heights are
 * read to the subpixel: drawn boxes, against the group's own. Nothing in or
 * around a group but a glyph moves on its own transform while it is
 * measured (a glyph on its way is read less its ride, `restOf`, and a slide
 * that carries the rows carries the group with them), so the differences
 * are layout's, without the rounding offsets carry; a head a pixel off a
 * glyph is a frame late at the slow end of the curve.
 */
function stretchOf(span: HTMLElement, frame: DOMRect, line: Line): Stretch {
  const box = span.getBoundingClientRect();
  const style = getComputedStyle(span);
  const rtl = style.direction === "rtl";
  const top = box.top - frame.top;
  return {
    el: span,
    top,
    rtl,
    x: box.left,
    y: box.top,
    from: line.base + (top - line.at),
    height: box.height,
    width: box.width,
    // The elbow's corner is its end-start one (design.css .kit-tree-line).
    corner: span.hasAttribute("data-line-elbow")
      ? Number.parseFloat(
          rtl ? style.borderBottomRightRadius : style.borderBottomLeftRadius
        ) || 0
      : 0,
  };
}

/** A row, its glyph, and how far along its list's line the glyph is when the line runs straight down to it. */
function itemOf(
  el: HTMLElement,
  glyph: string,
  frame: DOMRect,
  line: Line,
  boxOf: (element: HTMLElement) => Box
): Item {
  const icon = el.querySelector<HTMLElement>(glyph);
  const box = el.getBoundingClientRect();
  const top = box.top - frame.top;
  const centre = icon ? restOf(icon) : null;
  const y = centre ? centre.y - frame.top : top;
  // Across, in layout: a glyph caught mid-flight is drawn off its place.
  const row = boxOf(el);
  const tile = icon ? boxOf(icon) : null;
  const inset = tile ? tile.left - row.left : 0;
  return {
    el,
    icon,
    centre,
    ride: null,
    arrive: line.base + (y - line.at),
    top,
    bottom: top + box.height,
    width: row.width,
    reveal: tile ? inset + tile.width : 0,
  };
}

/**
 * A glyph's way to its place, `centre` in the viewport: along its list
 * item's elbow, the path its line draws (`cutAt` cuts the same one), and on
 * from its arm's end to its own centre; with no elbow, straight down from
 * its parent's glyph. `place` is which child of its parent it is (1 first):
 * the first few are the parent's cards, and start where their card is.
 */
function rideOf(
  item: Item,
  centre: { x: number; y: number },
  elbow: Stretch | undefined,
  line: Line,
  frame: DOMRect,
  place: number
): Ride {
  const card = place <= line.cards ? place : 0;
  const ride = {
    base: line.base,
    card,
    fill: line.fill,
    lead: card * line.step,
    skin: item.icon?.querySelector<HTMLElement>("[data-ride-skin]") ?? null,
  };
  if (!elbow) {
    const from = frame.top + line.at;
    const length = Math.max(0, centre.y - from);
    return {
      ...ride,
      bends: [],
      length,
      at: (d) => [0, from + clamp(d, 0, length) - centre.y],
    };
  }
  // The elbow, on the stroke's centre: down the rail to where it turns,
  // round the corner, out along the arm at the glyph's own height.
  const { corner, centre: radius, arc } = cornerOf(elbow);
  const before = elbow.from - line.base;
  const turn = centre.y - radius;
  const down = turn - elbow.y;
  // Right to left the rail is the elbow's right edge and the arm runs left
  // (design.css .kit-tree-line, on the inline axis): every step across mirrored.
  const way = elbow.rtl ? -1 : 1;
  const start = elbow.rtl ? elbow.x + elbow.width : elbow.x;
  const rail = start + way * (corner - radius);
  const arm = start + way * corner;
  const length = before + down + arc + Math.max(0, way * (centre.x - arm));
  return {
    ...ride,
    bends: Array.from(
      { length: ROUND + 1 },
      (_, k) => before + down + (arc * k) / ROUND
    ),
    length,
    at: (d) => {
      const along = clamp(d, 0, length) - before;
      if (along <= down) {
        return [rail - centre.x, elbow.y + along - centre.y];
      }
      if (along <= down + arc) {
        const turned = radius > 0 ? (along - down) / radius : Math.PI / 2;
        return [
          arm - way * radius * Math.cos(turned) - centre.x,
          turn + radius * Math.sin(turned) - centre.y,
        ];
      }
      return [arm + way * (along - down - arc) - centre.x, 0];
    },
  };
}

/**
 * A line from a parent's glyph, `selector` in `host`: from its centre, with
 * the deck it stands on (TreeMark `[data-deck]`: how many cards, each a
 * place further under the centre, a tile shrunk about the deck's vanishing
 * point). With no glyph there, from `fallback` down the group.
 */
function lineFrom(
  frame: DOMRect,
  host: Element | null | undefined,
  selector: string,
  base: number,
  fallback: number
): Line {
  const mark = host?.querySelector<HTMLElement>(selector);
  if (!mark) {
    return { at: fallback, base, cards: 0, fill: "", step: 0 };
  }
  const deck = mark.querySelector<HTMLElement>("[data-deck]");
  return {
    at: restOf(mark).y - frame.top,
    base,
    cards: Number(deck?.dataset.deck ?? 0),
    fill: deck ? getComputedStyle(mark).getPropertyValue("--fill") : "",
    step:
      (numberOf("--deck-shrink") * mark.offsetHeight) / 2 +
      numberOf("--deck-step"),
  };
}

/** The nested list in a group that a list item is a row of, if it is one. */

/**
 * The group's frame: from the parent's foot (the gap above its first
 * element is its room too) to its last element's foot, drawn.
 */
function frameOf(els: HTMLElement[]): DOMRect {
  const first = els[0].getBoundingClientRect();
  const last = (els.at(-1) ?? els[0]).getBoundingClientRect();
  const gap = Number.parseFloat(getComputedStyle(els[0]).marginBlockStart) || 0;
  const top = first.top - gap;
  return new DOMRect(first.left, top, first.width, last.bottom - top);
}

/** Where the group's frame is laid out, down the page: its first element's layout box, less its gap. */
function laidTop(els: HTMLElement[], boxOf = layoutBoxes()): number {
  const gap = Number.parseFloat(getComputedStyle(els[0]).marginBlockStart) || 0;
  return boxOf(els[0]).top - gap;
}

/** What a group's measure reads row by row. */
interface Reading {
  boxOf: (element: HTMLElement) => Box;
  frame: DOMRect;
  glyph: string;
  items: Item[];
  /** The line hanging from a row of the group's, or from its parent (null). */
  lineOf: (from: HTMLElement | null) => Line;
  /** Which child of its line a glyph is, 1 first. */
  places: Map<Line, number>;
  stretches: Stretch[];
  /** How far along the line the group's own rail runs straight down. */
  trunk: number;
}

/** A glyph's way along its line, and how far along the whole line it lands. */
function wayOn(
  reading: Reading,
  item: Item,
  line: Line,
  elbow: Stretch | undefined
): void {
  if (item.centre) {
    const place = (reading.places.get(line) ?? 0) + 1;
    reading.places.set(line, place);
    item.ride = rideOf(item, item.centre, elbow, line, reading.frame, place);
    item.arrive = line.base + item.ride.length;
  } else if (elbow) {
    item.arrive = endOf(elbow);
  }
}

/**
 * One row of the group: each of its strokes on the line it is part of, and
 * its glyph's way along the line it hangs from. Returns how far along the
 * whole line its glyph lands, where a line from it starts.
 */
function readRow(reading: Reading, { row, hangs, strokes }: GroupRow): number {
  let elbow: Stretch | undefined;
  for (const { line, span } of strokes) {
    const stretch = stretchOf(span, reading.frame, reading.lineOf(line));
    reading.stretches.push(stretch);
    if (span.hasAttribute("data-line-elbow")) {
      elbow = stretch;
      if (line === null) {
        reading.trunk = Math.max(
          reading.trunk,
          stretch.from + cornerOf(stretch).down
        );
      }
    }
  }
  let arrive = 0;
  const line = reading.lineOf(hangs);
  for (const el of row.querySelectorAll<HTMLElement>("[data-branch-item]")) {
    if (el.closest(ROW) !== row) {
      continue;
    }
    const item = itemOf(el, reading.glyph, reading.frame, line, reading.boxOf);
    wayOn(reading, item, line, elbow);
    ({ arrive } = item);
    reading.items.push(item);
  }
  return arrive;
}

function measure(group: Group): Shape {
  const { els, options } = group;
  const frame = frameOf(els);
  // Each row's line. The group's own leaves the parent's glyph; a row of
  // the group with rows under it is the line they hang from, as far along
  // the whole line as that row's glyph is.
  const own = lineFrom(
    frame,
    group.parent,
    options.parent ?? options.glyph,
    0,
    0
  );
  const start = own.at;
  const lines = new Map<HTMLElement, Line>();
  const arrived = new Map<HTMLElement, number>();
  const boxOf = layoutBoxes();
  const reading: Reading = {
    boxOf,
    frame,
    glyph: options.glyph,
    items: [],
    places: new Map(),
    stretches: [],
    trunk: 0,
    lineOf: (from) => {
      if (!from) {
        return own;
      }
      let line = lines.get(from);
      if (!line) {
        line = lineFrom(
          frame,
          from,
          options.glyph,
          arrived.get(from) ?? 0,
          start
        );
        lines.set(from, line);
      }
      return line;
    },
  };
  const rows = rowsOf(group);
  for (const each of rows) {
    arrived.set(each.row, readRow(reading, each));
  }
  // A box with no tree rows of its own: its rows straight down the line.
  if (rows.length === 0) {
    for (const el of els) {
      for (const item of el.querySelectorAll<HTMLElement>(
        "[data-branch-item]"
      )) {
        const each = itemOf(item, options.glyph, frame, own, boxOf);
        wayOn(reading, each, own, undefined);
        reading.items.push(each);
      }
    }
  }
  const { items, stretches } = reading;
  const length = Math.max(
    0,
    ...items.map((item) => item.arrive),
    ...stretches.map(endOf)
  );
  return {
    start,
    height: frame.height,
    items,
    length,
    stretches,
    rooms: els.map((el) => {
      const box = el.getBoundingClientRect();
      return {
        el,
        top: box.top - frame.top,
        bottom: box.bottom - frame.top,
      };
    }),
    trunk: reading.trunk || length,
    seen: viewOf(frame, laidTop(els, boxOf)),
  };
}

/**
 * The viewport in the group's frame, where the group is drawn and where it
 * is laid out: it sits `shift` below its place while a slide carries it.
 */
function viewOf(frame: DOMRect, laidOut: number): Shape["seen"] {
  const shift = frame.top - (laidOut - window.scrollY);
  const above = -frame.top + Math.min(0, shift);
  const below = window.innerHeight - frame.top + Math.max(0, shift);
  return (top, bottom) => bottom > above && top < below;
}

/* ── The fold over time ────────────────────────────────────────────── */

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/** One value on --ease-out: from `from` to `to`, over `length` ms from `start`. */
interface Seg {
  from: number;
  length: number;
  start: number;
  to: number;
}

const valueAt = (seg: Seg, t: number): number =>
  seg.length <= 0
    ? seg.to
    : seg.from +
      (seg.to - seg.from) * easeOut(clamp((t - seg.start) / seg.length, 0, 1));

/**
 * Where a fold stands: the room's height, how far along the line its head
 * is (0–1 of the line), and how far in each child's title is (0–1), in the
 * order of the items it was read for. Every glyph is where the head puts
 * it.
 */
interface State {
  head: number;
  room: number;
  titles: number[];
}

/** A fold as functions of its own time τ (ms). */
interface Plan {
  /** The room's foot, from the group's top. */
  edge: (t: number) => number;
  /** How far along the line its head is. */
  head: (t: number) => number;
  /** The line's length. */
  length: number;
  titles: Seg[];
  total: number;
  /** When the head passes `s`, on its way. */
  when: (s: number) => number;
}

/**
 * Opening from where `now` left it, at the batch's `speed`. The head glides
 * the rest of the line, and the room's edge glides open, both at that
 * speed (curves `glide`), as the rows under the room slide down: they keep
 * step, and the head, which leaves the parent's glyph above the room's top
 * and only ever goes down the rail as far as the last corner, is never
 * below the edge. Each child's title enters as the head, and its glyph on
 * it, reaches its place, so children an even distance apart along the line
 * enter at even times.
 */
function planOpen(shape: Shape, now: State, speed: number): Plan {
  const grow = shape.height - now.room;
  const room = glide(Math.abs(grow), speed);
  const edge = (t: number) => now.room + Math.sign(grow) * room.covered(t);
  const from = now.head * shape.length;
  const line = glide(Math.max(0, shape.length - from), speed);
  const head = (t: number) => from + line.covered(t);
  const when = (s: number) => (s <= from ? 0 : line.reached(s - from));
  const rail = dur("--duration-morph");
  const titles = shape.items.map((item, i): Seg => {
    const v = Math.min(1, now.titles[i] ?? 0);
    return {
      from: v,
      to: 1,
      start: when(item.arrive),
      length: rail * (1 - v),
    };
  });
  return {
    edge,
    head,
    when,
    titles,
    length: shape.length,
    total: Math.max(
      line.duration,
      room.duration,
      ...titles.map((seg) => seg.start + seg.length)
    ),
  };
}

/**
 * Folding from where `now` left it, over --duration-exit: the room closes on the
 * rows' curve, and nothing in it moves. The line's head and every title
 * stand where `now` has them (as shares: the line is taken as 1 long), so an
 * opening that turns the fold back plans from the room alone.
 */
function planFold(now: State, exit: number): Plan {
  return {
    edge: (t) => now.room * (1 - easeInOut(clamp(t / exit, 0, 1))),
    head: () => now.head,
    when: () => 0,
    titles: now.titles.map((v): Seg => ({
      from: v,
      to: v,
      start: 0,
      length: 0,
    })),
    length: 1,
    total: exit,
  };
}

/** Keyframes half a 60Hz frame apart, linear between: finer than any frame. */
const STEP = 1000 / 120;
/** How far apart along a stretch its cut is sampled (`railFrames`), px. */
const GRAIN = 0.5;
/** A frame at 60Hz: a fold's batch starts on the next one (`atTravel`). */
const FRAME = 1000 / 60;
/** How close to a stretch's end the head counts as past it, px (`cutAt`). */
const WHOLE = 0.01;
/**
 * How far above and left of its row a glyph is drawn on its way to it. A
 * row's clip is open that far and the rows' `BLEED` more, and no further:
 * the glyph rides on a layer of its own, so its row's clip is a layer as
 * large as the clip (motion/rows `BLEED`). Open by 100vmax on three sides,
 * every row of a tree was a layer 1605 by 2654px.
 */
function reachOf(item: Item): { left: number; up: number } {
  const [x, y] = item.ride ? item.ride.at(0) : [0, 0];
  return { left: Math.max(0, -x), up: Math.max(0, -y) };
}

/**
 * An element of a folding group, `top` to `bottom` in the group's frame,
 * cut where the room's edge is over the fold: the edge closes from `room`
 * up to the parent's glyph's foot, `lead` px over the group's top, on the
 * rows' curve over `exit`, and each element is cut at it, never below its
 * own foot. Open above as far as the line starts, and on the other sides
 * by `BLEED`. Sampled on the curve, linear between: one curve for the whole
 * group's edge, which no element's own clip, eased, would keep to.
 */
function shutFrames(
  top: number,
  bottom: number,
  lead: number,
  room: number,
  exit: number
): Span {
  const count = Math.max(2, Math.ceil(exit / STEP));
  const points = Array.from({ length: count + 1 }, (_, k): Sample => {
    const at = (exit * k) / count;
    const edge = room - (room + lead) * easeInOut(at / exit);
    return {
      at,
      v: [Number(clamp(bottom - edge, 0, bottom + lead).toFixed(2))],
    };
  });
  return cutAtEdge(points, BLEED + lead + top);
}

/**
 * An element cut from its foot where the room's edge is: `points`, how far
 * up from its foot over time, thinned to the frames it moves on; open
 * `above` px over its top, and `BLEED` on its sides.
 */
function cutAtEdge(points: Sample[], above: number): Span {
  return spanOf(thin(moving(points), [0.1]), ([below]) => ({
    clipPath: `inset(${px(-above)} ${px(-BLEED)} ${px(below)} ${px(-BLEED)})`,
  }));
}

/** A row's title `v` of the way wiped in: cut from the right, past its glyph. */
const wiped = (item: Item, v: number): Keyframe => {
  const { left, up } = reachOf(item);
  return {
    clipPath: `inset(${px(-(BLEED + up))} ${px((item.width - item.reveal) * (1 - v))} ${px(-BLEED)} ${px(-(BLEED + left))})`,
  };
};

/**
 * One moment of a track, `at` ms of τ, and its values as numbers: what a
 * piece's keyframes are sampled as, trimmed to the span it moves in
 * (`moving`) and thinned (`thin`) before they are keyframes.
 */
interface Sample {
  at: number;
  v: number[];
}

/**
 * A piece's animation: its keyframes over the span it moves in alone, `delay`
 * ms into the plan, held at its first frame before and its last after
 * (`fill: "both"`). Every moment of the plan outside that span has it still,
 * so an animation over the whole plan was a running animation the page
 * restyled every frame for nothing: a tree's pieces, all of them, the whole
 * time any one of them moved.
 */
interface Span {
  delay: number;
  duration: number;
  frames: Keyframe[];
}

/** How far a thinned ride may stray from the samples it was thinned from: translate px, scale, opacity. */
const RIDE_TOLERANCE = [0.1, 0.1, 0.001, 0.005];
/** The same for a skin's opacity. */
const SKIN_TOLERANCE = [0.01];

/**
 * The samples with the first and last of every straight run kept and the
 * rest dropped where linear between the ones kept stays within `tolerance`
 * of each (Ramer–Douglas–Peucker over time): a glyph down the rail or out
 * along its arm is two keyframes, round its corner as many as hold it
 * within a quarter of a pixel.
 */
function thin(points: Sample[], tolerance: number[]): Sample[] {
  const last = points.length - 1;
  const keep = points.map((_, k) => k === 0 || k === last);
  const todo: [number, number][] = [[0, last]];
  for (let range = todo.pop(); range; range = todo.pop()) {
    const [from, to] = range;
    const span = Math.max(points[to].at - points[from].at, 1e-9);
    let worst = 1;
    let at = -1;
    for (let k = from + 1; k < to; k += 1) {
      const share = (points[k].at - points[from].at) / span;
      let stray = 0;
      for (let c = 0; c < tolerance.length; c += 1) {
        const lerp =
          points[from].v[c] + (points[to].v[c] - points[from].v[c]) * share;
        stray = Math.max(stray, Math.abs(points[k].v[c] - lerp) / tolerance[c]);
      }
      if (stray > worst) {
        worst = stray;
        at = k;
      }
    }
    if (at !== -1) {
      keep[at] = true;
      todo.push([from, at], [at, to]);
    }
  }
  return points.filter((_, k) => keep[k]);
}

const sameSample = (a: Sample, b: Sample): boolean =>
  a.v.every((value, c) => value === b.v[c]);

/**
 * The span a track moves in: the last frame of its still start to the first
 * of its still end, each side held by the fill. At least two frames, the
 * second a millisecond on, where nothing moves at all.
 */
function moving(points: Sample[]): Sample[] {
  let from = 0;
  let to = points.length - 1;
  while (from < to && sameSample(points[from], points[from + 1])) {
    from += 1;
  }
  while (to > from && sameSample(points[to], points[to - 1])) {
    to -= 1;
  }
  const run = points.slice(from, to + 1);
  return run.length > 1 ? run : [run[0], { ...run[0], at: run[0].at + 1 }];
}

/** `points` as an animation over their own span. */
function spanOf(points: Sample[], frame: (v: number[]) => Keyframe): Span {
  const delay = points[0].at;
  const duration = Math.max((points.at(-1) ?? points[0]).at - delay, 1);
  return {
    delay,
    duration,
    frames: points.map((point, k) => ({
      ...frame(point.v),
      offset: k === points.length - 1 ? 1 : (point.at - delay) / duration,
    })),
  };
}

/**
 * A glyph's keyframes, and its skin's: where the head puts it at each of
 * `times`, linear between them. Its centre is `min(head, arrive)` along its way,
 * never short of where it starts (a card, at its place in the deck). A card
 * comes from its card's size to its own, shedding the skin, over its way; a
 * glyph that is no card fades in over the first --ride-fade of its. Until
 * the head has reached the glyph its way starts at (a child's own children,
 * in a tree that opens whole), it is not drawn.
 *
 * Sampled at `times` and at the moments the head passes each place its way
 * bends (where it sets off, each point round its corner, where it lands, the
 * end of its fade). A tall tree folds its line at ten pixels a millisecond
 * and more: a glyph's whole way fell between two of `times`, and it crossed
 * its corner in a straight line, 16px off its line. Then cut to the span it
 * moves in and thinned (`moving`, `thin`).
 */
function rideFrames(
  plan: Plan,
  ride: Ride,
  times: number[]
): { glyph: Span; skin: Span } {
  const fade = numberOf("--ride-fade");
  const shrunk = ride.card * numberOf("--deck-shrink");
  const way = Math.max(ride.length - ride.lead, 1);
  const passed = [0, ride.lead, fade, ...ride.bends, ride.length].map((d) =>
    clamp(plan.when(ride.base + d), 0, plan.total)
  );
  const moments = [...new Set([...times, ...passed])].sort((a, b) => a - b);
  // Each at the precision it was written at (`px`, four places of scale,
  // three of opacity), so frames that drew the same are the same.
  const round = (value: number, places: number) =>
    Number(value.toFixed(places));
  const worn: Sample[] = [];
  const points = moments.map((at): Sample => {
    const along = plan.head(at) - ride.base;
    const d = clamp(along, ride.lead, ride.length);
    const [x, y] = ride.at(d);
    const share = ride.card ? 1 - clamp((d - ride.lead) / way, 0, 1) : 0;
    let seen = ride.card ? 1 : clamp(d / fade, 0, 1);
    if (along < 0) {
      seen = 0;
    }
    worn.push({ at, v: [round(share, 3)] });
    return {
      at,
      v: [
        round(x, 2),
        round(y, 2),
        round(1 - shrunk * share, 4),
        round(seen, 3),
      ],
    };
  });
  return {
    glyph: spanOf(
      thin(moving(points), RIDE_TOLERANCE),
      ([x, y, scale, opacity]) => ({
        translate: `${px(x)} ${px(y)}`,
        scale: scale.toFixed(4),
        opacity: opacity.toFixed(3),
      })
    ),
    skin: spanOf(thin(moving(worn), SKIN_TOLERANCE), ([opacity]) => ({
      opacity: opacity.toFixed(3),
    })),
  };
}

/** A stretch's two cuts (app.css `--nest-cut-r`, `--nest-cut-b`). */
const CUT_RIGHT = "--nest-cut-r";
const CUT_BELOW = "--nest-cut-b";
/** No cut on that side: well clear of the stretch, as it is at rest. */
const UNCUT = -9999;
/**
 * The room a cut leaves beside the line it runs along, round a corner. A
 * stretch stands on the half pixel its row starts on and is painted on the
 * whole pixel it is snapped to: a cut a line's width from the stretch's edge
 * took a slice off the line itself.
 */
const CLEAR = 2;

/**
 * A stretch of line cut where the head is, `s` along the whole line, as how
 * far it is cut back from its right and from its foot: a straight stretch
 * at the head's depth; an elbow down its rail, then round its corner at the
 * point the arc's length puts the head, then out along its arm. A cut only
 * ever ends the line: down the rail nothing cuts from the right, along the
 * arm nothing cuts from below, and round the corner the cut from the right
 * stands `CLEAR` of the rail, closing on the corner as the head turns. Each
 * cut stands on the screen's pixel grid (`onGrid`), so the line ends on a
 * whole pixel.
 */
function cutAt(stretch: Stretch, s: number): [right: number, below: number] {
  const { height, width, x, y } = stretch;
  const along = s - stretch.from;
  // A stretch starts on a fraction of a pixel and is painted from the whole
  // pixel that snaps to. Its cut is put on the grid, in the viewport; and
  // until the head is a whole pixel into it, it is cut clear of its start:
  // cut at its own edge, half its first pixel stood there at half the ink
  // until the fold unmounted.
  const cut = (size: number, edge: number, to: number) => {
    const end = onGrid(edge + to);
    if (to <= 0 || end <= onGrid(edge)) {
      return size + CLEAR;
    }
    // Whole within a hundredth of a pixel: a head at the stretch's very end,
    // a rounding short of it, left a cut of nothing on a line already whole.
    return to >= size - WHOLE ? UNCUT : Math.max(0, size - (end - edge));
  };
  const below = (to: number) => cut(height, y, to);
  const right = (to: number) => cut(width, x, to);
  if (stretch.corner <= 0) {
    return [UNCUT, below(along)];
  }
  const { corner, centre, down, arc } = cornerOf(stretch);
  if (along <= down) {
    return [UNCUT, below(along)];
  }
  if (along <= down + arc) {
    const turn = centre > 0 ? (along - down) / centre : Math.PI / 2;
    return [
      right(corner - corner * Math.cos(turn) + CLEAR * Math.cos(turn)),
      below(down + corner * Math.sin(turn)),
    ];
  }
  return [right(corner + (along - down - arc)), UNCUT];
}

/**
 * A place in the viewport on the device's pixel grid. A line's cut lands
 * between pixels otherwise (a row starts on a fraction of one), and its last
 * pixel is drawn at part of the ink while the head passes.
 */
function onGrid(place: number): number {
  const ratio = window.devicePixelRatio || 1;
  return Math.round(place * ratio) / ratio;
}

/**
 * A stretch's keyframes: its cut at each `GRAIN` of its own length, at the
 * moment the head stands there, and only where the cut changes. Each holds
 * until the next (`step-end`): eased from one to the next, a cut passed
 * between pixels on its way. An offset is never over 1 (`animate` throws on
 * one, and the throw stops its fold).
 *
 * Sampled by place, not by time: a cut never moves between samples, so
 * sampled every 8ms it stood up to a whole sample behind the head, 3px
 * behind the glyph riding the line's tip as a small tree folded and a whole
 * stretch behind as a tall one did, whose head runs ten pixels a
 * millisecond. By place it is within half a `GRAIN` of the head at any pace,
 * and a stretch has as many keyframes as it has pixels at most.
 */
function railFrames(plan: Plan, stretch: Stretch): Span {
  const { from } = stretch;
  const to = endOf(stretch);
  const steps = Math.max(1, Math.ceil((to - from) / GRAIN));
  // Each place along the stretch, and when the head is there, in time's
  // order: opening it comes in at the top, folding at the end.
  const marks = Array.from({ length: steps + 1 }, (_, k) => {
    const s = from + ((to - from) * k) / steps;
    return { s, t: plan.when(s) };
  })
    .filter(({ t }) => t > 0 && t < plan.total)
    .sort((a, b) => a.t - b.t);
  // Held from one mark to the next, at the place midway between them.
  const cuts = [
    { t: 0, cut: cutAt(stretch, plan.head(0)) },
    ...marks.map(({ s, t }, k) => ({
      t,
      cut: cutAt(stretch, (s + (marks[k + 1]?.s ?? s)) / 2),
    })),
    { t: plan.total, cut: cutAt(stretch, plan.head(plan.total)) },
  ];
  const last = cuts.length - 1;
  const kept: { at: number; cut: [number, number] }[] = [];
  cuts.forEach(({ t, cut }, k) => {
    const before = cuts[k - 1]?.cut;
    if (k > 0 && k < last && before?.[0] === cut[0] && before[1] === cut[1]) {
      return;
    }
    kept.push({ at: t, cut });
  });
  // The line is whole where the head has been past it: the last frame, the
  // plan's end, adds nothing to the one before it. Its first holds until the
  // second, so it stands a millisecond before it and the span starts there.
  const [tail, prior] = [kept.at(-1), kept.at(-2)];
  if (
    tail &&
    prior &&
    tail.cut[0] === prior.cut[0] &&
    tail.cut[1] === prior.cut[1]
  ) {
    kept.pop();
  }
  if (kept.length > 1) {
    kept[0].at = Math.max(kept[0].at, kept[1].at - 1);
  } else {
    kept.push({ at: kept[0].at + 1, cut: kept[0].cut });
  }
  const delay = kept[0].at;
  const duration = Math.max((kept.at(-1) ?? kept[0]).at - delay, 1);
  return {
    delay,
    duration,
    frames: kept.map(({ at, cut: [right, below] }, k) => ({
      offset: k === kept.length - 1 ? 1 : (at - delay) / duration,
      easing: "step-end",
      [CUT_RIGHT]: px(right),
      [CUT_BELOW]: px(below),
    })),
  };
}

/**
 * One piece of an opening, still to build: the stretch of the group's frame
 * it is drawn in.
 */
interface Piece {
  bottom: number;
  build: () => Animation[];
  top: number;
}

/**
 * Every piece of an opening, to build on its own elements: each row's title
 * wipe on --ease-out, and its glyph's ride and each stretch of line as the
 * frames they move on. Each holds where it starts until it moves and where
 * it ends after (`fill: "both"`), until the opening lands (`fly`). A piece
 * the plan starts where it ends (a row already in, a stretch the head is
 * already past: a fold turned back) is no piece.
 *
 * A piece is built only once it is in view (`buildSeen`): the rest stand hidden
 * under the group's hold, and a tree of forty under the rail's foot cost
 * 13ms in `animate` alone for rows nobody could see.
 */
function piecesOf(shape: Shape, plan: Plan): Piece[] {
  const count = Math.max(2, Math.ceil(plan.total / STEP));
  const times = Array.from(
    { length: count + 1 },
    (_, k) => (plan.total * k) / count
  );
  const timing = (seg: Seg): KeyframeAnimationOptions => ({
    delay: seg.start,
    duration: Math.max(seg.length, 1),
    easing: CURVE.out,
    fill: "both",
  });
  /** An animation over the span of its own, linear: a glyph's ride, its skin's fade, a stretch's cuts, a room's edge. */
  const along = ({
    frames,
    delay,
    duration,
  }: Span): [Keyframe[], KeyframeAnimationOptions] => [
    frames,
    { delay, duration, easing: "linear", fill: "both" },
  ];
  /** A glyph on its way, and the card it wears on it. */
  const ridden = ({ icon, ride }: Item): Animation[] => {
    if (!(icon && ride)) {
      return [];
    }
    const frames = rideFrames(plan, ride, times);
    const built = [icon.animate(...along(frames.glyph))];
    if (ride.card && ride.skin) {
      ride.skin.style.setProperty("--p", String(ride.card));
      ride.skin.style.setProperty("--pfill", ride.fill);
      built.push(ride.skin.animate(...along(frames.skin)));
    }
    return built;
  };
  const pieces: Piece[] = [];
  shape.items.forEach((item, i) => {
    const title = plan.titles[i];
    const { ride } = item;
    // Already there: its glyph landed and its title in.
    const landed = !ride || plan.head(0) - ride.base >= ride.length;
    if (landed && title.from >= 1) {
      return;
    }
    pieces.push({
      top: item.top,
      bottom: item.bottom,
      build: () => [
        item.el.animate(
          [wiped(item, title.from), wiped(item, title.to)],
          timing(title)
        ),
        ...ridden(item),
      ],
    });
  });
  for (const stretch of shape.stretches) {
    // Whole already: the head is past its end (`cutAt`).
    if (plan.head(0) >= endOf(stretch) - WHOLE) {
      continue;
    }
    pieces.push({
      top: stretch.top,
      bottom: stretch.top + stretch.height,
      build: () => [stretch.el.animate(...along(railFrames(plan, stretch)))],
    });
  }
  // What the room uncovers, element by element, at its edge: the rails of
  // the levels above the parent's stand whole in each row, and grow with
  // the room as the parent's own box once grew around its rows.
  for (const room of shape.rooms) {
    if (plan.edge(0) >= room.bottom) {
      continue;
    }
    pieces.push({
      top: room.top,
      bottom: room.bottom,
      build: () => [
        room.el.animate(...along(roomFrames(shape, plan, room, times))),
      ],
    });
  }
  return pieces;
}

/**
 * An element of the group cut at the room's edge at each of `times`: open
 * above as far as the parent's glyph (the glyphs ride down from it, and a
 * first child's elbow leaves it), and on the other sides by `BLEED`.
 */
function roomFrames(
  shape: Shape,
  plan: Plan,
  room: Shape["rooms"][number],
  times: number[]
): Span {
  return cutAtEdge(
    times.map((at): Sample => ({
      at,
      v: [Number(Math.max(-BLEED, room.bottom - plan.edge(at)).toFixed(2))],
    })),
    BLEED + Math.max(0, room.top - shape.start)
  );
}

/** The pieces now in view, built and taken off the list. */
function buildSeen(pieces: Piece[], seen: Shape["seen"]): Animation[] {
  const made: Animation[] = [];
  for (let i = 0; i < pieces.length;) {
    const piece = pieces[i];
    if (seen(piece.top, piece.bottom)) {
      made.push(...piece.build());
      pieces.splice(i, 1);
    } else {
      i += 1;
    }
  }
  return made;
}

/**
 * An opening under way. Its pieces in view were built before it started
 * (`open`); each of the rest is built, on the opening's clock, so it stands
 * where the plan has it, on the scroll that brings it into view. A scroll
 * that leaves the group where it is drawn brings nothing in: the rail
 * anchors its own scroll as the home list above it grows (motion/rows).
 * `landed` runs on the frame the opening ends. Stopped when it lands or is
 * turned (`Flight.unwatch`).
 */
function fly(
  group: Group,
  flight: Flight,
  pieces: Piece[],
  landed: () => void
): void {
  const { plan, start } = flight;
  if (!plan || start === null) {
    return;
  }
  const { els } = group;
  const options = { capture: true, passive: true } as const;
  const scrolled = ({ target }: Event) => {
    // Another pane scrolling moves nothing of the group.
    if (
      target === document ||
      (target instanceof Node && target.contains(els[0]))
    ) {
      const view = viewOf(frameOf(els), laidTop(els));
      for (const animation of buildSeen(pieces, view)) {
        animation.startTime = start;
        flight.animations.push(animation);
      }
    }
  };
  let frame = 0;
  const tick = (now: number) => {
    if (now - start >= plan.total) {
      flight.unwatch?.();
      landed();
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  flight.unwatch = () => {
    cancelAnimationFrame(frame);
    document.removeEventListener("scroll", scrolled, options);
    flight.unwatch = undefined;
  };
  document.addEventListener("scroll", scrolled, options);
  frame = requestAnimationFrame(tick);
}

/* ── The transition ────────────────────────────────────────────────── */

/** A fold in flight on a group: its plan, on the clock it started on. */
interface Flight {
  animations: Animation[];
  /** The elements it turns, for letting go of them. */
  els: HTMLElement[];
  /** Drops its ask of the batch, or shows a group still waiting to be. */
  hold?: () => void;
  items: HTMLElement[];
  plan: Plan | null;
  /** Where it stands until its batch starts, for `items`. */
  rest: State;
  /** Its τ = 0 on the document timeline; null until its batch starts. */
  start: number | null;
  /** Stops building its pieces as they fall due or come into view (`fly`). */
  unwatch?: () => void;
}

/** Each parent's fold in flight. */
const flights = new WeakMap<HTMLElement, Flight>();

/** Values read for one list of rows, by element, for another: a row new to it was nowhere. */
const byElement = (from: HTMLElement[], values: number[], to: HTMLElement[]) =>
  to.map((el) => {
    const i = from.indexOf(el);
    return i === -1 ? 0 : values[i];
  });

/** At rest: the room `room` tall, and every piece `value` of the way in. */
const resting = (items: HTMLElement[], room: number, value: number): State => ({
  room,
  head: value,
  titles: items.map(() => value),
});

/**
 * Where the fold in flight under `parent` stands now, held there (its
 * pieces paused, to be dropped once the next fold takes over), for `items`.
 * With none in flight, or one that has landed, it is at rest and `now` is
 * null: how tall its room is then is the caller's to read, once it has
 * written everything it writes (`fold`).
 */
function stopFlight(
  parent: HTMLElement,
  items: HTMLElement[]
): { held: Animation[]; now: State | null } {
  const flight = flights.get(parent);
  flights.delete(parent);
  if (!flight) {
    return { held: [], now: null };
  }
  flight.hold?.();
  flight.unwatch?.();
  // Held where it stands at the time read here, which is where the next fold
  // is planned from, and the time its batch starts at (motion/rows `now`),
  // and the time the room's edge is read at: a pause alone takes effect on
  // the next frame, so a line turned back ran on a frame past the edge, 4px
  // below it, then jumped back.
  const frame = Number(document.timeline.currentTime);
  for (const animation of flight.animations) {
    const begun = animation.startTime;
    animation.pause();
    if (begun !== null) {
      animation.currentTime = frame - Number(begun);
    }
  }
  const held = flight.animations;
  const { plan, start } = flight;
  if (!(plan && start !== null)) {
    // Its batch had not started: it stands where it was asked from.
    return {
      held,
      now: {
        room: flight.rest.room,
        head: flight.rest.head,
        titles: byElement(flight.items, flight.rest.titles, items),
      },
    };
  }
  const t = Number(document.timeline.currentTime) - start;
  if (t >= plan.total) {
    return { held, now: null };
  }
  const at = Math.max(0, t);
  return {
    held,
    now: {
      room: plan.edge(at),
      head: plan.length > 0 ? plan.head(at) / plan.length : 0,
      titles: byElement(
        flight.items,
        plan.titles.map((seg) => valueAt(seg, at)),
        items
      ),
    },
  };
}

/**
 * Lets go of every animation a parent's flight still holds. A paused
 * animation is in play for as long as it exists: the document's timeline
 * keeps it, and it keeps its target and the whole tree that target was cut
 * out of. A fold holds the pieces of an opening it turned back where they
 * stood until the group is gone (`fold`), so every tree folded mid-opening —
 * a tab switch away from a session whose rail tree was still drawing in —
 * stayed on the heap for good: 62MB over a hundred switches across twenty tabs.
 */
function release(parent: HTMLElement): void {
  const flight = flights.get(parent);
  flights.delete(parent);
  if (!flight) {
    return;
  }
  flight.hold?.();
  flight.unwatch?.();
  for (const animation of flight.animations) {
    animation.cancel();
  }
  flight.animations = [];
}

/** Elements whose fold lets go of its flight once Svelte has taken them out. */
const leaving = new WeakSet<HTMLElement>();

/**
 * Releases the parent's flight once its fold has run and every element of
 * the group is out of the page. Svelte says each fold is over (`outroend`)
 * and takes the element out once every outro of its block has ended, in
 * that task at the soonest, so the release waits behind it, a microtask and
 * then a frame at a time. The group is shut by then (its clips at their
 * end), so nothing let go of is ever drawn. A fold turned back by an
 * opening never ends, and the opening takes the flight over as before.
 */
function releaseWhenGone(group: Group): void {
  const { parent, els } = group;
  for (const el of els) {
    if (leaving.has(el)) {
      continue;
    }
    leaving.add(el);
    el.addEventListener(
      "outroend",
      () => {
        leaving.delete(el);
        const ended = flights.get(parent);
        const gone = () => {
          // Taken over since (another turn holds the group): that turn's own.
          if (flights.get(parent) !== ended || !ended) {
            return;
          }
          if (ended.els.some((each) => each.isConnected)) {
            requestAnimationFrame(gone);
            return;
          }
          release(parent);
        };
        queueMicrotask(gone);
      },
      { once: true }
    );
  }
}

/** Back in the flow, and out of it: the room each element takes. */
function inFlow(el: HTMLElement): void {
  el.style.position = "";
  el.style.insetBlockStart = "";
  el.style.insetInlineStart = "";
  el.style.inlineSize = "";
  el.style.marginBlockStart = "";
}
/**
 * Where it stands in the flow, to the subpixel. Placed by its whole-pixel
 * offsets, a group whose rows start on a fraction of a pixel shifted by that
 * fraction as its fold began, its line's cuts with it, off the pixel grid.
 */
function placeOf(el: HTMLElement): Box {
  const parent = el.offsetParent;
  const box = el.getBoundingClientRect();
  const frame = parent?.getBoundingClientRect();
  return {
    top: frame ? box.top - frame.top - (parent?.clientTop ?? 0) : el.offsetTop,
    left: frame
      ? box.left - frame.left - (parent?.clientLeft ?? 0)
      : el.offsetLeft,
    width: box.width,
    height: box.height,
  };
}
/** Out of the flow, where it stood in it (`placeOf`): its border box there, so no margin. */
function outOfFlow(el: HTMLElement, place: Box): void {
  el.style.position = "absolute";
  el.style.marginBlockStart = "0px";
  el.style.insetBlockStart = `${place.top}px`;
  el.style.insetInlineStart = `${place.left}px`;
  el.style.inlineSize = `${place.width}px`;
}

/**
 * What a turn begun in this update has still to read, and what it writes
 * once every turn of the update has read.
 */
interface Late {
  read: () => void;
  write?: () => void;
}

/**
 * The turns begun in this update, still to read. A turn writes its
 * attributes as it is asked for, and reads here: after every other turn of
 * the update has written its own, and before motion/rows reads where the
 * rows are (`beforeReflow`), or in the update's next microtask where no
 * `reflow` hears it. One tree is often open in two lists at once (the rail's
 * Recent and the phone home's), and both fold in the one click: read as
 * each was asked, the second one's attributes went on after the first
 * one's read, and every row was styled twice, 24 then 18ms for a tree of
 * 140.
 */
const late: Late[] = [];

function readTogether(): void {
  const turns = late.splice(0);
  for (const turn of turns) {
    turn.read();
  }
  for (const turn of turns) {
    turn.write?.();
  }
}

function afterWrites(turn: Late): void {
  if (late.length === 0) {
    queueMicrotask(readTogether);
    beforeReflow(readTogether);
  }
  late.push(turn);
}

const itemsOf = (group: Group) =>
  group.els.flatMap((el) => [
    ...(el.matches("[data-branch-item]") ? [el] : []),
    ...el.querySelectorAll<HTMLElement>("[data-branch-item]"),
  ]);

/** Sets or takes an attribute off every element of the group. */
const mark = (group: Group, name: string, on: boolean) => {
  for (const el of group.els) {
    el.toggleAttribute(name, on);
  }
};
/** Sets `data-state` on every element of the group: reflow hears it. */
const stateOf = (group: Group, state: "open" | "closing") => {
  for (const el of group.els) {
    el.dataset.state = state;
  }
};

/**
 * A group just mounted is held hidden, its rows (by the clip their titles
 * wipe in by) and its line, from the update that mounts it until each
 * piece is built (`fly`), and the hold goes as the fold lands (app.css
 * `[data-branch-hold]`): one attribute, where an animation a piece cost the
 * click its own long task.
 */
const HELD = "data-branch-hold";
/**
 * A group whose line is drawing in or running back: its stretches take the
 * cuts their pieces move (design.css `[data-branch-draw]`). Off at rest,
 * where a stretch has no clip at all.
 */
const DRAWN = "data-branch-draw";
/**
 * On the parent, while its group is just mounted and its line has not set
 * off yet: its deck still stands (app.css). The deck goes on the frame the
 * glyphs that were its cards are first drawn, a task and two frames after
 * the mount; gone from the mount, the parent stood bare for those frames.
 */
const WAITS = "data-branch-wait";
/** reflow's: what it neither slides, uncovers nor copies, while the group turns. */
const ANCHOR = "data-flip-anchor";

/** A state read for `from`, for the rows a shape has measured. */
const stateFor = (shape: Shape, from: HTMLElement[], now: State): State => {
  const to = shape.items.map((item) => item.el);
  return {
    room: now.room,
    head: now.head,
    titles: byElement(from, now.titles, to),
  };
};

/**
 * A turn in a list that is not rendered (`skippedAt`: the same tree is open
 * in the phone's sheet and in the home board put away under the
 * conversation behind it): the group is simply there, or gone. Nothing of it
 * is measured, held or animated. Opened and folded as a list in view is,
 * a tree of six cost every opening 24 drawn boxes, 20 heights and 23
 * computed styles read in a board the page does not lay out, and 39
 * animations started on rows it does not draw; a fold, much the same.
 */
function unseenTurn(group: Group, opening: boolean): void {
  const { held } = stopFlight(group.parent, itemsOf(group));
  for (const animation of held) {
    animation.cancel();
  }
  mark(group, HELD, false);
  mark(group, DRAWN, false);
  group.parent.removeAttribute(WAITS);
  markCuts(group, false);
  if (opening) {
    for (const el of group.els) {
      inFlow(el);
    }
    mark(group, ANCHOR, false);
    stateOf(group, "open");
  }
}

/** Every element of the group back in the layout: shown, and in the flow. */
function show(group: Group): void {
  for (const el of group.els) {
    unshown.delete(el);
    el.style.display = "";
  }
}

function open(group: Group): void {
  if (skippedAt(group.els[0])) {
    unseenTurn(group, true);
    return;
  }
  const { parent, options } = group;
  const items = itemsOf(group);
  const turning = flights.has(parent);
  const stopped = stopFlight(parent, items);
  const { held } = stopped;
  const now = stopped.now ?? resting(items, 0, 0);
  for (const el of group.els) {
    inFlow(el);
  }
  mark(group, ANCHOR, true);
  if (turning) {
    // reflow hears the group take its room again, in this update.
    stateOf(group, "open");
  }
  const flight: Flight = {
    // Held where they are (turned back) or hidden (just mounted) until the
    // batch starts.
    animations: held,
    els: group.els,
    items,
    plan: null,
    rest: now,
    start: null,
  };
  if (!turning) {
    mark(group, HELD, true);
  }
  flights.set(parent, flight);
  if (!motionOk.current) {
    mark(group, HELD, false);
    mark(group, DRAWN, false);
    mark(group, ANCHOR, false);
    stateOf(group, "open");
    for (const animation of flight.animations) {
      animation.cancel();
    }
    flight.animations = items.map((el) =>
      heldToTravel(
        el.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: dur("--duration-pop"),
          easing: CURVE.out,
        })
      )
    );
    return;
  }
  markCuts(group, true);
  mark(group, DRAWN, true);
  parent.toggleAttribute(WAITS, !turning);
  /** The opening as it was last laid out, and its pieces still to build. */
  let laid: { plan: Plan; shape: Shape; speed: number } | null = null;
  let pieces: Piece[] = [];
  // Its pace is asked for from the room it takes and the glyphs in it
  // (curves `glideSpeed`): --duration-stagger from one row's glyph to the next,
  // --duration-cascade at most for the whole tree; a result with no glyph opens
  // over --duration-panel. Returns the speed it asked for.
  const begin = (): number => {
    const pace = glideSpeed(
      frameOf(group.els).height,
      items.filter((el) => el.querySelector(options.glyph)).length
    );
    // Turned back mid-fold, it carries on from where the fold left it in the
    // next frame (`now`); from rest it waits for its batch's two frames.
    flight.hold = atTravel(
      (at, batch) => takeOff(at, batch.speed ?? pace.speed),
      { ...pace, now: turning }
    );
    return pace.speed;
  };
  // Read: measured where every row and rail is placed, and planned at
  // `speed` from where every piece is held.
  const lay = (speed: number) => {
    const shape = measure(group);
    laid = {
      shape,
      speed,
      plan: planOpen(shape, stateFor(shape, items, now), speed),
    };
    return laid;
  };
  // Written: every piece in view, held at its first frame, which is where
  // the turn it takes over from left it (hidden, just mounted). Built ahead
  // of the batch, in the frames the rows under the room are still held:
  // built on the batch's frame and the two after, their making was what
  // those frames showed late.
  const build = ({ plan, shape }: NonNullable<typeof laid>) => {
    for (const animation of flight.animations) {
      animation.cancel();
    }
    pieces = piecesOf(shape, plan);
    flight.animations = buildSeen(pieces, shape.seen);
    for (const animation of flight.animations) {
      animation.pause();
    }
  };
  if (turning) {
    // Read with every other turn of the update, and written after all of
    // them have read (`afterWrites`).
    afterWrites({
      read: () => {
        if (flights.get(parent) === flight) {
          lay(begin());
        }
      },
      write: () => {
        if (flights.get(parent) === flight && laid) {
          build(laid);
        }
      },
    });
  } else {
    // Just mounted, it is drawn in this update and laid out in a task of its
    // own: drawn and laid out in the click's task, a tree of forty in the
    // rail ran it to 19–27ms. Shown, it takes its room (reflow hears
    // `data-state`, and holds the rows under it), its rows' lines standing
    // where layout puts them. Out of the layout until then, it moves
    // nothing, and the frame between shows the rail as it was.
    for (const el of group.els) {
      el.style.display = "none";
      unshown.add(el);
    }
    const shown = setTimeout(() => {
      // Every write first, then the one layout its shape is read in, and
      // reflow reads it as it stands.
      show(group);
      stateOf(group, "open");
      const speed = begin();
      build(lay(speed));
    }, 0);
    flight.hold = () => {
      clearTimeout(shown);
      show(group);
    };
  }

  /** On the batch's frame, at its speed (motion/rows `atTravel`). */
  function takeOff(at: number, speed: number): void {
    // Its rows unmounted since it asked (the rail giving way to the drawer
    // as the window narrows, a row leaving with live data): nothing is left
    // to open. Measured off the page, it has no length and no duration, and
    // `fly` asked for a frame on every frame from then on, never landing.
    // Its pieces, built and held for the batch, are let go of with it.
    if (flights.get(parent) !== flight) {
      return;
    }
    if (!group.els[0].isConnected) {
      release(parent);
      return;
    }
    // Laid out at the speed it asked for; another tree in its batch set a
    // faster one (motion/rows `atTravel`), so it is laid out again at that.
    let ready = laid;
    if (ready?.speed !== speed) {
      ready = lay(speed);
      build(ready);
    }
    flight.items = ready.shape.items.map((item) => item.el);
    flight.plan = ready.plan;
    flight.start = at;
    for (const animation of flight.animations) {
      animation.startTime = at;
    }
    parent.removeAttribute(WAITS);
    // Just mounted, a piece out of view is hidden under the hold until it is
    // built; the hold goes on the frame the opening lands, with the pieces,
    // each then at rest where it ends.
    fly(group, flight, pieces, () => {
      mark(group, HELD, false);
      mark(group, DRAWN, false);
      mark(group, ANCHOR, false);
      markCuts(group, false);
      for (const animation of flight.animations) {
        animation.cancel();
      }
      flight.animations = [];
    });
  }
}

function fold(group: Group): void {
  if (skippedAt(group.els[0])) {
    unseenTurn(group, false);
    return;
  }
  const { parent, options } = group;
  releaseWhenGone(group);
  const items = itemsOf(group);
  const exit = dur("--duration-exit");
  parent.removeAttribute(WAITS);
  if (!motionOk.current) {
    // Still: they fade where they stand, then the room closes at once.
    const { held, now } = stopFlight(parent, items);
    for (const animation of held) {
      animation.cancel();
    }
    mark(group, HELD, false);
    mark(group, DRAWN, false);
    markCuts(group, false);
    const fades = items.map((el) =>
      el.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: exit,
        easing: CURVE.out,
        fill: "forwards",
      })
    );
    flights.set(parent, {
      animations: fades,
      els: group.els,
      items,
      plan: null,
      rest: now ?? resting(items, frameOf(group.els).height, 1),
      start: null,
    });
    return;
  }
  // The attributes the fold sets go on before anything is read, here and
  // in every other group folding in this update (`afterWrites`). Svelte has
  // made the rows inert by now, which styles every row in them again at the
  // first read; set between the reads, an attribute styled them once more.
  // reflow hears `data-state` in the update's microtask, by when the rows
  // have left the flow (`place`), and holds everything under them until
  // the batch. Whatever an opening it turns back had drawn stays as it
  // stood (`held`, and the group's hold over what was not built yet): the
  // fold closes over it.
  mark(group, ANCHOR, true);
  stateOf(group, "closing");
  const { held, now } = stopFlight(parent, items);
  let places: Box[] = [];
  let shuts: Span[] = [];
  // What the edge cuts: every element of the group, and the line's start
  // under the parent's glyph, which the first of them follows.
  let shut: HTMLElement[] = [];
  let folding: Flight | null = null;
  let rooms: Animation[] = [];
  afterWrites({
    read: () => {
      // Its rows' boxes and its parent's glyph: all a fold reads of the tree.
      const frame = frameOf(group.els);
      const glyph = parentGlyph(group, options.parent ?? options.glyph);
      // How far over the group's top its line starts, at that glyph's foot.
      const lead = glyph
        ? Math.max(0, frame.top - (restOf(glyph).y + glyph.offsetHeight / 2))
        : 0;
      const state = now ?? resting(items, frame.height, 1);
      const flight: Flight = {
        animations: held,
        els: group.els,
        items,
        plan: null,
        rest: state,
        start: null,
      };
      flights.set(parent, flight);
      // The group closes from its foot with its room, on the room's curve,
      // and on up its line to the parent's glyph: one edge across every
      // element of it, each cut there. Then it stays shut until it
      // unmounts: out of the flow, it stands under the rows that slide up,
      // and would show over them once the room had closed.
      const start = startOf(group);
      shut = start ? [...group.els, start] : group.els;
      shuts = shut.map((el) => {
        const box = el.getBoundingClientRect();
        return shutFrames(
          box.top - frame.top,
          box.bottom - frame.top,
          lead,
          state.room,
          exit
        );
      });
      // From the next frame, the batch the room and every row under it
      // close in.
      flight.hold = atTravel(
        (at) => {
          if (flights.get(parent) !== flight) {
            return;
          }
          flight.plan = planFold(state, exit);
          flight.start = at;
          // The clips alone: an opening's pieces stay held where they stood.
          for (const room of rooms) {
            room.startTime = at;
          }
        },
        { close: true, now: true }
      );
      folding = flight;
      places = group.els.map(placeOf);
    },
    // The fold's writes, after every read: its clips, held where the room
    // stands until the batch starts, and the rows out of the flow.
    write: () => {
      if (!folding) {
        return;
      }
      rooms = shut.map((el, i) => {
        const { frames, delay, duration } = shuts[i];
        const room = el.animate(frames, {
          delay,
          duration,
          easing: "linear",
          fill: "both",
        });
        room.pause();
        return room;
      });
      folding.animations = [...held, ...rooms];
      group.els.forEach((el, i) => {
        outOfFlow(el, places[i]);
      });
    },
  });
}

/* ── Turns taken together ──────────────────────────────────────────── */

/** A turn Svelte asked for, still to be taken with the rest of its update. */
interface Asked {
  el: HTMLElement;
  options: BranchOptions;
  out: boolean;
}

/** The turns of the update under way, taken together in its microtask (`takeTurns`). */
let asked: Asked[] = [];
/** The elements Svelte has mounted or unmounted with a branch in this update. */
const turningNow = new Set<HTMLElement>();
/** Elements a regroup mounts or unmounts: they simply come and go (motion/share). */
const regrouped = new WeakSet<HTMLElement>();

/** The nearest row above `el` that does not turn with it: its group's parent. */
function rootOf(el: HTMLElement): HTMLElement | null {
  let parent = parentOf(el);
  while (parent && turningNow.has(parent) && parent.matches(ROW)) {
    parent = parentOf(parent);
  }
  return parent;
}

/**
 * Whether `el` turns as a fold, under a parent: a row of a parent that
 * showed none before (all its rows turn now) or whose fold is in flight, or
 * a box. A row that comes or goes beside rows that stay (a new delegate
 * under an open session, one archived) is a row of the list, which reflow
 * uncovers or closes; so is a row at the root, and anything a regroup moves.
 */
function foldsAs(el: HTMLElement): HTMLElement | null {
  if (regrouped.has(el)) {
    return null;
  }
  const parent = rootOf(el);
  if (!parent) {
    return null;
  }
  if (!el.matches(ROW) || flights.has(parent)) {
    return parent;
  }
  return childrenOf(parent).every((row) => turningNow.has(row)) ? parent : null;
}

/** The update's turns are to be taken (`takeTurns`), in the microtask after Svelte asked for them all. */
let taking = false;

/** Every turn of the update, grouped under its parent and taken. */
function takeTurns(): void {
  taking = false;
  const turns = asked;
  asked = [];
  const groups = new Map<string, Group>();
  const order: [Group, boolean][] = [];
  const keys = new WeakMap<HTMLElement, number>();
  let next = 0;
  for (const { el, options, out } of turns) {
    const parent = foldsAs(el);
    if (!parent) {
      continue;
    }
    if (!keys.has(parent)) {
      keys.set(parent, next);
      next += 1;
    }
    const key = `${keys.get(parent)}:${out}`;
    let group = groups.get(key);
    if (!group) {
      group = { parent, els: [], options };
      groups.set(key, group);
      order.push([group, out]);
    }
    group.els.push(el);
  }
  turningNow.clear();
  for (const [group, out] of order) {
    // In the page's order: Svelte asks in the order its blocks run.
    // Rows of one list, or a box alone: siblings, each before or after.
    group.els.sort((a, b) =>
      a.compareDocumentPosition(b) === Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    );
    if (out) {
      fold(group);
    } else {
      open(group);
    }
  }
}

/**
 * The fold as a Svelte transition, on each row of a flat tree (or on a box
 * of rows): `in:branch={options}` opens, and `out:branch={options}` folds
 * and keeps the row mounted until it has gone. Every row that turns in one
 * update is one group under the row above them that stays, taken together
 * in the update's microtask (`takeTurns`). Each turn is planned when it
 * happens, from where the last one left every piece (a deferred config,
 * which Svelte asks for afresh every time).
 */
export function branch(
  el: HTMLElement,
  options: BranchOptions,
  { direction }: { direction?: "in" | "out" | "both" } = {}
): () => TransitionConfig {
  const out = direction === "out";
  turningNow.add(el);
  if (regrouping()) {
    regrouped.add(el);
  }
  return () => {
    // Asked again without its outer call (a turn turned back), it turns
    // with its parent's flight.
    turningNow.add(el);
    // Taken once Svelte has asked for every turn of the update: its deferred
    // configs all run in one microtask, so the next one sees them all.
    if (!taking) {
      taking = true;
      queueMicrotask(takeTurns);
    }
    if (!foldsAs(el)) {
      regrouped.delete(el);
      return { duration: 0 };
    }
    asked.push({ el, options, out });
    if (skippedAt(el)) {
      return { duration: 0 };
    }
    if (!motionOk.current) {
      return { duration: out ? dur("--duration-exit") : dur("--duration-pop") };
    }
    // Unmounted once the last piece has gone: a frame for the batch, and a
    // frame to spare. A fold takes --duration-exit whatever it measures
    // (`planFold`).
    return {
      duration: out
        ? dur("--duration-exit") + FRAME + STEP * 2
        : dur("--duration-cascade") + dur("--duration-morph"),
    };
  };
}
