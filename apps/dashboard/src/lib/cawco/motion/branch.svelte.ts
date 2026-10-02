/**
 * A tree's fold: the rows under a parent row opening and folding away, the
 * same in every list that nests rows (the rail's projects, sessions and
 * delegates at every depth, the home's Working and Finished, a run step's
 * result). One primitive, read off one moving point: the tip of the
 * parent's rail.
 *
 * Opening. The room opens downward from the parent row's bottom edge: the
 * parent's box (`data-flip="box"` in a `reflow`, motion/rows) is laid out
 * at its new size at once and its edge is uncovered on the rows' curve,
 * while everything under it slides down with that edge, all from one frame
 * (`atTravel`). The rail grows from the parent's glyph, its tip half a row
 * behind the edge, so each child's place is open before the tip reaches it.
 * The moment the tip reaches a child's glyph, the child swipes out along its
 * arm, left to right, fading in, and the arm draws out with it, ending at
 * the glyph however far it has come. The rail's speed is the stagger. No
 * child ever moves vertically: each stands at its place inside the growing
 * box, so nothing is drawn above the parent row's bottom edge or over
 * another row.
 *
 * Folding. The exact reverse. Each child swipes back into the rail, right to
 * left, fading out, and is gone as the retracting tip passes its glyph; the
 * room closes behind the tip, the rows under it sliding up with its edge;
 * then the group unmounts. The lowest child starts leaving first, so the
 * room starts closing once it has gone (`atTravel`'s `notBefore`), and
 * every move under the tree waits with it.
 *
 * Turned back mid-way, every piece carries on from where it is drawn: the
 * fold in flight holds still, and the new one starts from it on the next
 * batch's frame, with the box.
 *
 * Reduced motion: nothing travels. Opening, the room lands at once and the
 * children fade in; folding, they fade out where they stand and then the
 * room closes at once.
 *
 * Markup. The group is the element the transition is on, mounted under its
 * parent row in the parent's own element (an `li`, or a box marked
 * `data-nest-host`), which is `data-flip="box"` and `position: relative`;
 * the group is `data-flip-anchor`, so reflow never copies or uncovers what
 * is inside it. Each row in it, at any depth, is `data-branch-item`, with
 * its glyph matching `glyph`. A `.kit-nest` group's rails (app.css) are its
 * list items' `::before` (the elbow, its arm at the foot) and `::after` (the
 * rail on past the child), placed by `nestFrom`.
 *
 *   {#if open}
 *     <ul class="kit-nest" data-flip-anchor
 *         in:branch={{ glyph: ".session-mark" }} out:branch={{ glyph: ".session-mark" }}
 *         {@attach nestFrom(".session-mark")}>
 */
import type { Attachment } from "svelte/attachments";
import type { TransitionConfig } from "svelte/transition";
import {
  CURVE,
  dur,
  easeInOut,
  easeOut,
  motionOk,
  popRise,
} from "./curves.svelte";
import { atTravel, beforeReflow, heldToTravel } from "./rows.svelte";

export interface BranchOptions {
  /** A row's glyph, a selector inside the row: its rail ends there. */
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

/** An element's layout box on the page, transforms ignored. */
function layoutBox(element: HTMLElement): Box {
  let left = 0;
  let top = 0;
  let at: HTMLElement | null = element;
  while (at) {
    left += at.offsetLeft;
    top += at.offsetTop;
    const up = at.offsetParent as HTMLElement | null;
    if (up) {
      left += up.clientLeft - up.scrollLeft;
      top += up.clientTop - up.scrollTop;
    }
    at = up;
  }
  return {
    left,
    top,
    width: element.offsetWidth,
    height: element.offsetHeight,
  };
}

const px = (value: number) => `${value.toFixed(2)}px`;

/** The parent row's own element around a group, and its glyph. */
function parentGlyph(group: HTMLElement, selector: string) {
  const host = group.parentElement?.closest<HTMLElement>(
    "li, [data-nest-host]"
  );
  return host?.querySelector<HTMLElement>(selector) ?? null;
}

/**
 * Where a nested list's rails stand (app.css .kit-nest), measured rather
 * than assumed, so a rail leaves its parent's glyph and meets each child's
 * wherever the rows put them: `--nest-x` under the centre of the parent's
 * glyph, `--nest-lead` from that glyph's foot to the list's first row,
 * `--nest-glyph-y` a child glyph's centre from its row's top and
 * `--nest-reach` from its row's left edge to it. The parent's glyph is the
 * first `glyph` in the nearest list item around the list (or the box marked
 * `data-nest-host`); a child's is the first `child` in the first row.
 *
 *   <ul class="kit-nest" {@attach nestFrom(".session-mark")}>
 *
 * Measured in layout, transforms ignored: first just before motion/rows
 * reads where the rows are, after the update that drew the list
 * (`beforeReflow`), or as `open` shows the group it is in; then by a size
 * observer, when a rail or font change moves a glyph. Left to the
 * observer's first call, after layout, the rows were read at the default
 * inset and the inset landed after: every child of a tree opening in the
 * rail was tweened 15px narrower, its trailing count sliding in from past
 * the rail's edge.
 * Every list measured at once is read, then written: read and written a
 * list at a time, each list's write laid the page out again for the next
 * one's read, a tree opening in the rail and the home at once paid a layout
 * a list. A list starts out where the last one under the same parent stood,
 * or the last one of its kind (its glyphs, its depth), and a measure that
 * finds it there writes nothing: written every time, the inset laid out
 * the forty rows of a tree opening in the rail twice in the click.
 */
type Measured = [HTMLElement, Record<string, string>];

/**
 * Groups mounted but not yet shown (`open`): laid out a task after the
 * update that drew them. A list inside one has nothing to measure yet.
 */
const unshown = new WeakSet<Element>();

function isUnshown(node: Element): boolean {
  for (let at: Element | null = node; at; at = at.parentElement) {
    if (unshown.has(at)) {
      return true;
    }
  }
  return false;
}

/** Where a list's rails go: down in drawn boxes, across in layout. */
function nestOf(
  node: HTMLElement,
  glyph: string,
  child: string
): Measured | null {
  const parent = isUnshown(node) ? null : parentGlyph(node, glyph);
  if (!parent) {
    return null;
  }
  // Across in layout (a row caught mid-swipe is drawn off its place); down
  // in drawn boxes read against each other, to the subpixel (nothing here
  // moves vertically on its own transform; see `topIn`).
  const mark = layoutBox(parent);
  const first =
    node.getBoundingClientRect().top +
    node.clientTop +
    Number.parseFloat(getComputedStyle(node).paddingTop);
  const vars: Record<string, string> = {
    "--nest-x": px(mark.left + mark.width / 2 - layoutBox(node).left),
    "--nest-lead": px(first - parent.getBoundingClientRect().bottom),
  };
  const row = node.querySelector<HTMLElement>(":scope > li");
  const own = row?.querySelector<HTMLElement>(child);
  if (row && own) {
    const tile = own.getBoundingClientRect();
    vars["--nest-glyph-y"] = px(
      tile.top + tile.height / 2 - row.getBoundingClientRect().top
    );
    vars["--nest-reach"] = px(layoutBox(own).left - layoutBox(row).left);
  }
  return [node, vars];
}

interface Nest {
  host: Element | null;
  kind: string;
  measure: () => Measured | null;
}

const nests = new Map<Element, Nest>();
let nestSizes: ResizeObserver | null = null;
/** Lists drawn in this update, measured together before rows are read. */
const drawnNow = new Set<Element>();
/** Where the last list under each parent, and of each kind, stood. */
const byHost = new WeakMap<Element, Record<string, string>>();
const byKind = new Map<string, Record<string, string>>();

function measureNests(lists: Iterable<Element>): void {
  const measured = [...lists].map((list) => {
    const nest = nests.get(list);
    return nest ? ([nest, nest.measure()] as const) : null;
  });
  for (const each of measured) {
    if (!each?.[1]) {
      continue;
    }
    const [nest, [list, vars]] = each;
    for (const [name, value] of Object.entries(vars)) {
      if (list.style.getPropertyValue(name) !== value) {
        list.style.setProperty(name, value);
      }
    }
    if (nest.host) {
      byHost.set(nest.host, vars);
    }
    byKind.set(nest.kind, vars);
  }
}

/** The lists drawn in this update, but those a group holds out of the layout (`open` measures them as it shows them). */
function settleDrawn(): void {
  const lists = [...drawnNow].filter(
    (list) => list.isConnected && !isUnshown(list)
  );
  drawnNow.clear();
  measureNests(lists);
}

/** Every list in a group just shown, the group's own included. */
function measureNestsIn(group: HTMLElement): void {
  measureNests(
    [group, ...group.querySelectorAll(".kit-nest")].filter((list) =>
      nests.has(list)
    )
  );
}

/** How many nested lists a list sits in. */
function depthIn(node: Element): number {
  let depth = 0;
  for (
    let at = node.parentElement?.closest(".kit-nest");
    at;
    at = at.parentElement?.closest(".kit-nest")
  ) {
    depth += 1;
  }
  return depth;
}

export function nestFrom(
  glyph: string,
  child = glyph
): Attachment<HTMLElement> {
  return (node) => {
    const host = node.parentElement?.closest("li, [data-nest-host]") ?? null;
    const kind = `${glyph}|${child}|${depthIn(node)}`;
    nests.set(node, {
      host,
      kind,
      measure: () => nestOf(node, glyph, child),
    });
    const known = (host && byHost.get(host)) ?? byKind.get(kind);
    for (const [name, value] of Object.entries(known ?? {})) {
      node.style.setProperty(name, value);
    }
    drawnNow.add(node);
    beforeReflow(settleDrawn);
    // The border box: the inset this sets (`--nest-pad`) resizes the
    // content box, and watching that would hear its own write back as a
    // second resize.
    nestSizes ??= new ResizeObserver((entries) => {
      measureNests(entries.map((entry) => entry.target));
    });
    nestSizes.observe(node, { box: "border-box" });
    return () => {
      nests.delete(node);
      drawnNow.delete(node);
      nestSizes?.unobserve(node);
    };
  };
}

/* ── The fold's shape ──────────────────────────────────────────────── */

/** One stretch of rail: a list item's elbow or the rail on past it. */
interface Rail {
  height: number;
  /** The child it ends at, for an elbow: its arm draws out with it. */
  item: number | null;
  li: HTMLElement;
  pseudo: "::before" | "::after";
  /** In the group's frame. */
  top: number;
  width: number;
}

interface Item {
  /** Its foot, in the group's frame. */
  bottom: number;
  /** How far left of its place it starts: out of its parent's column. */
  dx: number;
  el: HTMLElement;
  /** Its top, in the group's frame. */
  top: number;
  /** Its glyph's centre (its top, with none) in the group's frame: where the tip reaches it. */
  y: number;
}

interface Shape {
  /** The lowest child's mark: the tip's end. */
  end: number;
  /** The group's height: how far its parent's box grows. */
  height: number;
  items: Item[];
  rails: Rail[];
  /**
   * Whether a stretch of the group's frame is in the viewport where the
   * group is drawn now or where it is laid out (a slide carrying the group
   * runs between the two). Off it at both, nobody sees it move.
   */
  seen: (top: number, bottom: number) => boolean;
  /** The parent glyph's foot: the tip's start. */
  start: number;
}

/** The stretches of rail a list item draws, in the group's frame. */
function railsOf(li: HTMLElement, top: number, item: number | null): Rail[] {
  const rails: Rail[] = [];
  for (const pseudo of ["::before", "::after"] as const) {
    const style = getComputedStyle(li, pseudo);
    if (style.content === "none" || style.display === "none") {
      continue;
    }
    rails.push({
      li,
      pseudo,
      item: pseudo === "::before" ? item : null,
      top: top + Number.parseFloat(style.top),
      height: Number.parseFloat(style.height),
      width: Number.parseFloat(style.width),
    });
  }
  return rails;
}

/**
 * The fold's heights, to the subpixel: drawn boxes, read against the
 * group's own. Nothing in or around a group moves vertically on its own
 * transform while it is measured (a child swipes only sideways, and a slide
 * that carries the parent's box carries the group with it), so the
 * differences are layout's, without the rounding offsets carry; a tip a
 * pixel off a glyph is a frame late at the slow end of the curve.
 */
const topIn = (frame: DOMRect, el: Element) =>
  el.getBoundingClientRect().top - frame.top;

function measure(group: HTMLElement, options: BranchOptions): Shape {
  const frame = group.getBoundingClientRect();
  const parent = parentGlyph(group, options.parent ?? options.glyph);
  const start = parent ? parent.getBoundingClientRect().bottom - frame.top : 0;
  // Across, in layout: a child caught mid-swipe is drawn off its place.
  const parentBox = parent ? layoutBox(parent) : null;
  const parentX = parentBox ? parentBox.left + parentBox.width / 2 : 0;
  const items: Item[] = [];
  const rails: Rail[] = [];
  const rise = popRise();
  for (const el of group.querySelectorAll<HTMLElement>("[data-branch-item]")) {
    const own = el.querySelector<HTMLElement>(options.glyph);
    const index = items.length;
    const li = el.closest("li");
    const nested =
      li !== null &&
      group.contains(li) &&
      li.parentElement?.classList.contains("kit-nest") === true;
    const drawn = nested ? railsOf(li, topIn(frame, li), index) : [];
    rails.push(...drawn);
    const elbow = drawn.find((rail) => rail.pseudo === "::before");
    // Along its arm: its glyph's left edge starts on the rail. With no rail,
    // out from under its parent's glyph; a block with no glyph, a small step.
    let dx = rise;
    if (elbow) {
      dx = elbow.width - 1;
    } else if (own && parentBox) {
      const tile = layoutBox(own);
      dx = Math.max(rise, tile.left + tile.width / 2 - parentX);
    }
    const box = el.getBoundingClientRect();
    const top = box.top - frame.top;
    let y = top;
    if (own) {
      const tile = own.getBoundingClientRect();
      y = tile.top + tile.height / 2 - frame.top;
    }
    items.push({ el, dx, y, top, bottom: top + box.height });
  }
  return {
    start,
    end: Math.max(start, ...items.map((item) => item.y)),
    height: frame.height,
    items,
    rails,
    seen: viewOf(group, frame),
  };
}

/**
 * The viewport in the group's frame, where the group is drawn and where it
 * is laid out: it sits `shift` below its place while a slide carries it.
 */
function viewOf(
  group: HTMLElement,
  frame = group.getBoundingClientRect()
): Shape["seen"] {
  const shift = frame.top - (layoutBox(group).top - window.scrollY);
  const above = -frame.top + Math.min(0, shift);
  const below = window.innerHeight - frame.top + Math.max(0, shift);
  return (top, bottom) => bottom > above && top < below;
}

/* ── The fold over time ────────────────────────────────────────────── */

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/** When (0–1) the rows' in-out curve reaches `share` of its way. */
function reach(share: number): number {
  if (share <= 0) {
    return 0;
  }
  if (share >= 1) {
    return 1;
  }
  let low = 0;
  let high = 1;
  for (let step = 0; step < 24; step += 1) {
    const mid = (low + high) / 2;
    if (easeInOut(mid) < share) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return high;
}

/** A fold as functions of its own time τ (ms). */
interface Plan {
  /** When the tip reaches `y` (from the group's top) on its way. */
  at: (y: number) => number;
  /** The room's foot, from the group's top. */
  edge: (t: number) => number;
  /** How far in (0–1) each child is: 1 at its place, 0 gone into the rail. */
  shown: ((t: number) => number)[];
  /**
   * Each child's swipe, on --ease-out: from `from` of the way in to `to`,
   * over `length` ms from `start` (the arm draws out or back over the same).
   */
  swipes: Swipe[];
  /** The tip of the rail, from the group's top. */
  tip: (t: number) => number;
  total: number;
}

interface Swipe {
  from: number;
  length: number;
  start: number;
  to: number;
}

const tipOf =
  (shape: Shape, edge: (t: number) => number) =>
  (t: number): number =>
    clamp(edge(t) - (shape.height - shape.end), shape.start, shape.end);

/** How far in a child is at `t` on its swipe. */
const progress = (swipe: Swipe, t: number): number =>
  swipe.length <= 0
    ? swipe.to
    : swipe.from +
      (swipe.to - swipe.from) *
        easeOut(clamp((t - swipe.start) / swipe.length, 0, 1));

/** Opening from a room `from` px tall, each child `was` of the way in. */
function planOpen(shape: Shape, from: number, was: number[]): Plan {
  const travel = dur("--dur-panel");
  const swipe = dur("--dur-rail");
  const grow = shape.height - from;
  const edge = (t: number) => from + grow * easeInOut(clamp(t / travel, 0, 1));
  const lag = shape.height - shape.end;
  const at = (y: number) =>
    grow < 0.5
      ? 0
      : travel * reach((clamp(y, shape.start, shape.end) + lag - from) / grow);
  const swipes = shape.items.map((item, i): Swipe => {
    const p0 = Math.min(1, was[i] ?? 0);
    return { from: p0, to: 1, start: at(item.y), length: swipe * (1 - p0) };
  });
  const total = Math.max(travel, ...swipes.map((s) => s.start + s.length));
  return {
    at,
    edge,
    tip: tipOf(shape, edge),
    swipes,
    shown: swipes.map((s) => (t: number) => progress(s, t)),
    total,
  };
}

/**
 * Folding from a room `from` px tall, each child `was` of the way in. Each
 * child is gone as the tip passes it, so the room waits `lead` ms for the
 * one that has furthest to go before the tip reaches it.
 */
function planFold(
  shape: Shape,
  from: number,
  was: number[]
): Plan & { lead: number } {
  const travel = dur("--dur-panel");
  const swipe = dur("--dur-exit");
  const lag = shape.height - shape.end;
  const crossing = (y: number) =>
    from < 0.5
      ? 0
      : travel * reach(1 - (clamp(y, shape.start, shape.end) + lag) / from);
  const crossings = shape.items.map((item) => crossing(item.y));
  // Never sooner than the batch's own two frames, so the room and what is
  // under it start on the frame this plan has them start on.
  let lead = HOLD;
  shape.items.forEach((_, i) => {
    lead = Math.max(lead, swipe * (was[i] ?? 0) - crossings[i]);
  });
  const edge = (t: number) =>
    from * (1 - easeInOut(clamp((t - lead) / travel, 0, 1)));
  const swipes = shape.items.map((_, i): Swipe => {
    const p0 = Math.max(0, was[i] ?? 0);
    const length = swipe * p0;
    return { from: p0, to: 0, start: lead + crossings[i] - length, length };
  });
  return {
    at: (y) => lead + crossing(y),
    edge,
    tip: tipOf(shape, edge),
    swipes,
    shown: swipes.map((s) => (t: number) => progress(s, t)),
    total: lead + travel,
    lead,
  };
}

/** Keyframes half a 60Hz frame apart, linear between: finer than any frame. */
const STEP = 1000 / 120;
/** A batch's two frames at 60Hz (motion/rows `atTravel`). */
const HOLD = 1000 / 30;

/** A child at `p` of the way in: off its place along its arm, faded with it. */
const swiped = (item: Item, p: number): Keyframe => ({
  translate: `${(-item.dx * (1 - p)).toFixed(2)}px 0px`,
  opacity: p.toFixed(3),
});

/**
 * The keyframes of a stretch of rail. Its tip-driven part is sampled where
 * it moves, and only there: a stretch the tip is not passing holds still,
 * and a run of equal frames is two. An elbow's arm draws out or back on its
 * child's swipe, one segment on the same curve, so the arm's end is the
 * glyph's left edge on every frame. Within the swipe the tip has passed the
 * glyph (opening) or not reached it (folding): the stretch is whole, and
 * only the arm moves.
 */
function railFrames(
  shape: Shape,
  plan: Plan,
  rail: Rail,
  times: number[]
): Keyframe[] {
  const own = rail.item === null ? null : shape.items[rail.item];
  const swipe = rail.item === null ? null : plan.swipes[rail.item];
  const end = rail.top + rail.height;
  const clip = (t: number, p: number): string => {
    const tip = plan.tip(t);
    const below = own && tip >= own.y ? 0 : clamp(end - tip, 0, rail.height);
    const right = own ? (rail.width - 1) * (1 - p) : 0;
    return `inset(0px ${right.toFixed(2)}px ${below.toFixed(2)}px 0px)`;
  };
  const frames: Keyframe[] = [];
  const at = (t: number) => t / plan.total;
  const inSwipe = (t: number) =>
    swipe !== null &&
    swipe.length > 0 &&
    t > swipe.start &&
    t < swipe.start + swipe.length;
  for (const t of times) {
    if (inSwipe(t)) {
      continue;
    }
    const p = swipe ? progress(swipe, t) : 1;
    frames.push({ offset: at(t), clipPath: clip(t, p) });
    if (swipe && swipe.length > 0 && t <= swipe.start) {
      const next = times.find((u) => u > t);
      if (next !== undefined && next > swipe.start) {
        frames.push({
          offset: at(swipe.start),
          clipPath: clip(swipe.start, swipe.from),
          easing: CURVE.out,
        });
        frames.push({
          offset: at(swipe.start + swipe.length),
          clipPath: clip(swipe.start + swipe.length, swipe.to),
        });
      }
    }
  }
  return frames.filter(
    (frame, k) =>
      k === 0 ||
      k === frames.length - 1 ||
      frame.easing !== undefined ||
      frames[k - 1].easing !== undefined ||
      frame.clipPath !== frames[k - 1].clipPath ||
      frame.clipPath !== frames[k + 1].clipPath
  );
}

/**
 * One piece of a plan, as an animation still to build: the stretch of the
 * group's frame it is drawn in, and τ (ms) when it first moves.
 */
interface Piece {
  bottom: number;
  build: () => Animation;
  start: number;
  top: number;
}

/** Built this far ahead of its start: two frames at 60Hz. */
const AHEAD = 1000 / 30;

/**
 * Every piece of a plan, to build on its own element: each child's swipe as
 * one segment on --ease-out, each stretch of rail as the frames it moves
 * on. Each holds where it starts until it moves and where it ends after
 * (`fill: "both"`): an opening lands (`fly`), a fold unmounts.
 *
 * `rests`: until it is built, every piece stands where its plan starts it,
 * hidden under the group's hold (a fresh opening) or at rest (a fold from
 * rest). Then a piece is built just before it moves, and only once it is in
 * view (`fly`): built at once, a tree of forty under the rail's foot cost
 * the frame its fold started on 13ms in `animate` alone, mostly for rows
 * nobody could see, and every piece of a tall tree in view still made that
 * frame run past 16ms. A fold turned back mid-way has pieces caught
 * part-way, so each in view is built at once.
 */
function piecesOf(shape: Shape, plan: Plan, rests: boolean): Piece[] {
  const count = Math.max(2, Math.ceil(plan.total / STEP));
  const times = Array.from(
    { length: count + 1 },
    (_, k) => (plan.total * k) / count
  );
  const opening = plan.swipes.every((swipe) => swipe.to === 1);
  const pieces: Piece[] = [];
  shape.items.forEach((item, i) => {
    const swipe = plan.swipes[i];
    if (opening && swipe.from >= 1) {
      return;
    }
    pieces.push({
      top: item.top,
      bottom: item.bottom,
      start: rests ? swipe.start : 0,
      build: () =>
        item.el.animate([swiped(item, swipe.from), swiped(item, swipe.to)], {
          delay: swipe.start,
          duration: Math.max(swipe.length, 1),
          easing: CURVE.out,
          fill: "both",
        }),
    });
  });
  for (const rail of shape.rails) {
    const bottom = rail.top + rail.height;
    const swipe = rail.item === null ? null : plan.swipes[rail.item];
    // Opening, the tip enters a stretch at its top; folding, at its foot,
    // and an elbow's arm may start back before that, with its child.
    const enters = plan.at(opening ? rail.top : bottom);
    const start = Math.min(enters, swipe?.start ?? enters);
    pieces.push({
      top: rail.top,
      bottom,
      start: rests ? start : 0,
      build: () =>
        rail.li.animate(railFrames(shape, plan, rail, times), {
          duration: plan.total,
          easing: "linear",
          fill: "both",
          pseudoElement: rail.pseudo,
        }),
    });
  }
  return pieces;
}

/**
 * A flight's pieces, each built on the fold's clock, so it stands where the
 * plan has it, once it is due (`AHEAD` of its start) and in view: checked
 * every frame until the last is built, and on every scroll that carries the
 * group. A scroll that leaves the group where it is drawn brings nothing in:
 * the rail anchors its own scroll as the home list above it grows
 * (motion/rows), and that scroll alone built a forty-row tree's every piece
 * in one frame. `landed` runs on the frame the fold ends. Stopped when the
 * fold lands or is turned (`Flight.unwatch`).
 */
function fly(
  group: HTMLElement,
  flight: Flight,
  pieces: Piece[],
  seen: Shape["seen"],
  landed?: () => void
): void {
  const { plan, start } = flight;
  if (!plan || start === null) {
    return;
  }
  let view = seen;
  const build = (now: number) => {
    for (let i = pieces.length - 1; i >= 0; i -= 1) {
      const piece = pieces[i];
      if (
        piece.start - (now - start) <= AHEAD &&
        view(piece.top, piece.bottom)
      ) {
        const animation = piece.build();
        animation.startTime = start;
        flight.animations.push(animation);
        pieces.splice(i, 1);
      }
    }
  };
  const options = { capture: true, passive: true } as const;
  const scrolled = ({ target }: Event) => {
    // Another pane scrolling moves nothing of the group.
    if (target === document || (target as Node).contains(group)) {
      view = viewOf(group);
      build(Number(document.timeline.currentTime));
    }
  };
  let frame = 0;
  const tick = (now: number) => {
    if (now - start >= plan.total) {
      flight.unwatch?.();
      landed?.();
      return;
    }
    build(now);
    frame = requestAnimationFrame(tick);
  };
  flight.unwatch = () => {
    cancelAnimationFrame(frame);
    document.removeEventListener("scroll", scrolled, options);
    flight.unwatch = undefined;
  };
  build(start);
  document.addEventListener("scroll", scrolled, options);
  frame = requestAnimationFrame(tick);
}

/* ── The transition ────────────────────────────────────────────────── */

/** A fold in flight on a group: its plan, on the clock it started on. */
interface Flight {
  animations: Animation[];
  /** Drops the hold it put on the batch, or shows a group still waiting to be. */
  hold?: () => void;
  items: HTMLElement[];
  plan: Plan | null;
  /** Its τ = 0 on the document timeline; null until its batch starts. */
  start: number | null;
  /** Stops building its pieces as they fall due or come into view (`fly`). */
  unwatch?: () => void;
}

const flights = new WeakMap<HTMLElement, Flight>();

/**
 * Where the fold in flight on `group` stands now, held there (its pieces
 * paused, to be dropped once the next fold takes over): the room's height
 * and how far in each of `items` is. With none in flight, or one that has
 * landed: `rest`.
 */
function stopFlight(
  group: HTMLElement,
  items: HTMLElement[],
  rest: { from: number; was: number }
): { from: number; held: Animation[]; was: number[] } {
  const flight = flights.get(group);
  flights.delete(group);
  const resting = { from: rest.from, held: [], was: items.map(() => rest.was) };
  if (!flight) {
    return resting;
  }
  flight.hold?.();
  flight.unwatch?.();
  for (const animation of flight.animations) {
    animation.pause();
  }
  const held = flight.animations;
  const { plan, start } = flight;
  if (!(plan && start !== null)) {
    // Its batch had not started: nothing has moved yet.
    return { from: 0, held, was: items.map(() => 0) };
  }
  const t = Number(document.timeline.currentTime) - start;
  if (t >= plan.total) {
    return { ...resting, held };
  }
  const at = Math.max(0, t);
  return {
    from: plan.edge(at),
    held,
    was: items.map((el) => {
      const i = flight.items.indexOf(el);
      return i === -1 ? 0 : plan.shown[i](at);
    }),
  };
}

/** Back in the flow, and out of it: the room the group takes. */
function inFlow(group: HTMLElement): void {
  group.style.position = "";
  group.style.insetBlockStart = "";
  group.style.insetInlineStart = "";
  group.style.inlineSize = "";
}
function outOfFlow(group: HTMLElement): void {
  const { offsetTop, offsetLeft, offsetWidth } = group;
  group.style.position = "absolute";
  group.style.insetBlockStart = `${offsetTop}px`;
  group.style.insetInlineStart = `${offsetLeft}px`;
  group.style.inlineSize = `${offsetWidth}px`;
}

const itemsOf = (group: HTMLElement) => [
  ...group.querySelectorAll<HTMLElement>("[data-branch-item]"),
];

/**
 * A group just mounted is held hidden, its rows and its rails, from the
 * update that mounts it until each piece is built (`fly`), and the hold goes
 * as the fold lands (app.css `[data-branch-hold]`): one attribute, where an
 * animation a piece cost the click its own long task.
 */
const HELD = "data-branch-hold";

/** How far in each measured child was, by element: a new one was nowhere. */
const wasOf = (shape: Shape, items: HTMLElement[], was: number[]) =>
  shape.items.map((item) => {
    const i = items.indexOf(item.el);
    return i === -1 ? 0 : was[i];
  });

function open(group: HTMLElement, options: BranchOptions): TransitionConfig {
  const items = itemsOf(group);
  const turning = flights.has(group);
  const from = stopFlight(group, items, { from: 0, was: 0 });
  inFlow(group);
  if (turning) {
    // reflow hears the group take its room again, in this update.
    group.dataset.state = "open";
  }
  const flight: Flight = {
    // Held where they are (turned back) or hidden (just mounted) until the
    // batch starts.
    animations: from.held,
    items,
    plan: null,
    start: null,
  };
  if (!turning) {
    group.setAttribute(HELD, "");
  }
  flights.set(group, flight);
  if (!motionOk.current) {
    group.removeAttribute(HELD);
    for (const animation of flight.animations) {
      animation.cancel();
    }
    flight.animations = items.map((el) =>
      heldToTravel(
        el.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: dur("--dur-pop"),
          easing: CURVE.out,
        })
      )
    );
    return { duration: dur("--dur-pop") };
  }
  // Measured on the batch's frame, where every row and rail is placed, and
  // planned from where every piece is held.
  const begin = () => {
    flight.hold = atTravel((at) => takeOff(at));
  };
  if (turning) {
    begin();
  } else {
    // Just mounted, it is drawn in this update and laid out in a task of its
    // own: drawn and laid out in the click's task, a tree of forty in the
    // rail ran it to 19–27ms. Shown, it takes its room (reflow hears
    // `data-state`, and holds the rows under it) and its lists are measured
    // before reflow reads them. Out of the layout until then, it moves
    // nothing, and the frame between shows the rail as it was.
    group.style.display = "none";
    unshown.add(group);
    const show = () => {
      unshown.delete(group);
      group.style.display = "";
    };
    const shown = setTimeout(() => {
      // Every write first, then the one read: the lists' measure lays the
      // group out, and reflow reads it as it stands.
      show();
      group.dataset.state = "open";
      measureNestsIn(group);
      begin();
    }, 0);
    flight.hold = () => {
      clearTimeout(shown);
      show();
    };
  }
  return { duration: dur("--dur-panel") + dur("--dur-rail") };

  function takeOff(at: number): void {
    if (flights.get(group) !== flight) {
      return;
    }
    const shape = measure(group, options);
    const plan = planOpen(
      shape,
      turning ? from.from : 0,
      wasOf(shape, items, from.was)
    );
    for (const animation of flight.animations) {
      animation.cancel();
    }
    flight.animations = [];
    flight.items = shape.items.map((item) => item.el);
    flight.plan = plan;
    flight.start = at;
    // Just mounted, every piece is hidden under the hold until it is built;
    // the hold goes on the frame the fold lands, with the pieces, each then
    // at rest where it ends.
    fly(group, flight, piecesOf(shape, plan, !turning), shape.seen, () => {
      group.removeAttribute(HELD);
      for (const animation of flight.animations) {
        animation.cancel();
      }
      flight.animations = [];
    });
  }
}

function fold(group: HTMLElement, options: BranchOptions): TransitionConfig {
  const items = itemsOf(group);
  const from = stopFlight(group, items, {
    from: group.offsetHeight,
    was: 1,
  });
  if (!motionOk.current) {
    // Still: they fade where they stand, then the room closes at once.
    for (const animation of from.held) {
      animation.cancel();
    }
    const fades = items.map((el) =>
      el.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: dur("--dur-exit"),
        easing: CURVE.out,
        fill: "forwards",
      })
    );
    flights.set(group, { animations: fades, items, plan: null, start: null });
    return { duration: dur("--dur-exit") };
  }
  const shape = measure(group, options);
  const plan = planFold(shape, from.from, wasOf(shape, items, from.was));
  const start = performance.now();
  for (const animation of from.held) {
    animation.cancel();
  }
  // Started on this task's clock, a hair after the frame's: each piece
  // holds its first keyframe in the frame it is drawn in (`fill: "both"`)
  // rather than standing at rest for a frame. From rest, a piece not yet
  // built stands where it starts.
  const rests =
    from.was.every((was) => was >= 1) &&
    Math.abs(from.from - shape.height) < 0.5;
  const flight: Flight = {
    animations: [],
    items: shape.items.map((item) => item.el),
    plan,
    start,
  };
  fly(group, flight, piecesOf(shape, plan, rests), shape.seen);
  // Folded before it ever opened: the pieces hold it hidden now.
  group.removeAttribute(HELD);
  // The room closes from the batch's frame, after the lead; the group leaves
  // the flow now, so reflow hears it (`data-state`) in this update and holds
  // its box and everything under it until then.
  flight.hold = atTravel(() => {
    /* the hold alone */
  }, start + plan.lead);
  outOfFlow(group);
  group.dataset.state = "closing";
  flights.set(group, flight);
  // Unmounted once the last piece has gone, with a frame to spare.
  return { duration: plan.total + STEP * 2 };
}

/**
 * The fold as a Svelte transition: `in:branch={options}` opens, and
 * `out:branch={options}` folds the group and keeps it mounted until it has
 * gone. Each turn is planned when it happens, from where the last one left
 * every piece (a deferred config, which Svelte asks for afresh every time).
 */
export function branch(
  group: HTMLElement,
  options: BranchOptions,
  { direction }: { direction?: "in" | "out" | "both" } = {}
): () => TransitionConfig {
  return () =>
    direction === "out" ? fold(group, options) : open(group, options);
}
