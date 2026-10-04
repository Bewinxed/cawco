/**
 * A tree's fold: the rows under a parent row opening and folding away, the
 * same in every list that nests rows (the rail's projects, sessions and
 * delegates at every depth, the home's Working and Finished, a run step's
 * result). One primitive, read off one moving point: the head of the line
 * that leaves the parent's glyph.
 *
 * The line. Each child's line (app.css .kit-nest) runs from the parent's
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
 * Opening. The line leads. Its head glides at one steady speed (curves
 * `glide`: easing in over its first few px and out over its last), so the
 * children are reached at even times: --dur-stagger apart, or closer
 * together in a tree too tall to open within --dur-cascade. The room opens
 * downward from the parent row's bottom edge at the same speed: the
 * parent's box (`data-flip="box"` in a `reflow`, motion/rows) is laid out at
 * its new size at once and its edge is uncovered, while everything under it
 * slides down with that edge, all from one frame and at the pace the tree
 * asks of the batch (`atTravel`), so the head, which starts above the room's
 * top, is never below its edge. On the rows' in-out curve, the room set the
 * pace and the head rode it: the children were reached 22ms, then 134ms
 * apart. The moment the head reaches a child's glyph, the glyph flies in
 * from the row's left edge as it fades in, and its title wipes in left to
 * right, both on --ease-out over --dur-rail. No row ever moves vertically:
 * each stands at its place inside the growing box, so nothing is drawn
 * above the parent row's bottom edge or over another row.
 *
 * Folding. Quicker than opening, and under way in the next frame, from the
 * click's own time (motion/rows `now`): the room closes over --dur-exit, the
 * rows under it sliding up with its edge (the batch's "close" pace), while
 * the line runs back the way it came at one steady pace (`RUN_BACK`),
 * ahead of the edge. As the head leaves a child's glyph, its title wipes out
 * right to left, then its glyph flies out to the left as it fades; then the
 * group unmounts. The room used to wait for the lowest child to swipe out
 * before it started, and then took an opening's whole time to close.
 *
 * Turned back mid-way, every piece carries on from where it stands: the
 * fold in flight is held at the click's time, and the new one starts from
 * it at that same time, with the box and the rows under it, so the next
 * frame already shows the line on its way back. Waiting for a batch of its
 * own, the line stood still a frame (a fold) or two (an opening) at every
 * turn.
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
 * its glyph matching `glyph`. A `.kit-nest` group's line (app.css) is its
 * list items' `::before` (the elbow: down, round its corner, out along its
 * arm) and `::after` (the rail on past the child), placed by `nestFrom`.
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
  glide,
  glideSpeed,
  motionOk,
  popRise,
} from "./curves.svelte";
import { atTravel, beforeReflow, heldToTravel } from "./rows.svelte";

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
  // Across in layout (a glyph caught mid-flight is drawn off its place);
  // down in drawn boxes read against each other, to the subpixel (nothing
  // here moves vertically on its own transform; see `railsOf`).
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

/**
 * One stretch of line (app.css .kit-nest): a list item's elbow (`::before`:
 * down from the row above, round its corner, out along its arm to the
 * child's glyph) or the rail on past it (`::after`, straight down). `from`
 * is how far along the line its top is, from where the line leaves its
 * parent's glyph.
 */
interface Stretch {
  /** An elbow's corner radius; a straight stretch has none. */
  corner: number;
  from: number;
  height: number;
  li: HTMLElement;
  pseudo: "::before" | "::after";
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

interface Item {
  /** How far along the line its glyph is: its arm's end, or straight down. */
  arrive: number;
  bottom: number;
  /** How far its glyph flies in from: the row's own left edge. */
  dx: number;
  el: HTMLElement;
  icon: HTMLElement | null;
  /** Where its title starts, from the row's left edge: past its glyph. */
  reveal: number;
  /** In the group's frame. */
  top: number;
  width: number;
}

interface Shape {
  /** The room's height: how far its parent's box grows. */
  height: number;
  items: Item[];
  /** The whole line's length, to the furthest glyph. */
  length: number;
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

/** A list's line: how far down the group it leaves its parent's glyph, and how far along the whole line that is. */
interface Line {
  at: number;
  base: number;
}

/**
 * The stretches of line a list item draws, in the group's frame. The fold's
 * heights are read to the subpixel: drawn boxes, against the group's own.
 * Nothing in or around a group moves vertically on its own transform while
 * it is measured (a glyph flies only sideways, and a slide that carries the
 * parent's box carries the group with it), so the differences are layout's,
 * without the rounding offsets carry; a head a pixel off a glyph is a frame
 * late at the slow end of the curve.
 */
function railsOf(li: HTMLElement, frame: DOMRect, line: Line): Stretch[] {
  const rails: Stretch[] = [];
  const box = li.getBoundingClientRect();
  for (const pseudo of ["::before", "::after"] as const) {
    const style = getComputedStyle(li, pseudo);
    if (style.content === "none" || style.display === "none") {
      continue;
    }
    const y = box.top + Number.parseFloat(style.top);
    const at = y - frame.top;
    rails.push({
      li,
      pseudo,
      top: at,
      x: box.left + Number.parseFloat(style.left),
      y,
      from: line.base + (at - line.at),
      height: Number.parseFloat(style.height),
      width: Number.parseFloat(style.width),
      corner:
        pseudo === "::before"
          ? Number.parseFloat(style.borderBottomLeftRadius) || 0
          : 0,
    });
  }
  return rails;
}

/** A row, its glyph, and how far along its list's line the glyph is when the line runs straight down to it. */
function itemOf(
  el: HTMLElement,
  glyph: string,
  frame: DOMRect,
  line: Line
): Item {
  const icon = el.querySelector<HTMLElement>(glyph);
  const box = el.getBoundingClientRect();
  const top = box.top - frame.top;
  let y = top;
  if (icon) {
    const tile = icon.getBoundingClientRect();
    y = tile.top + tile.height / 2 - frame.top;
  }
  // Across, in layout: a glyph caught mid-flight is drawn off its place.
  const row = layoutBox(el);
  const tile = icon ? layoutBox(icon) : null;
  const inset = tile ? tile.left - row.left : 0;
  return {
    el,
    icon,
    arrive: line.base + (y - line.at),
    top,
    bottom: top + box.height,
    width: row.width,
    dx: tile && inset > 0.5 ? inset : popRise(),
    reveal: tile ? inset + tile.width : 0,
  };
}

function measure(group: HTMLElement, options: BranchOptions): Shape {
  const frame = group.getBoundingClientRect();
  const footOf = (host: Element | null | undefined, selector: string) => {
    const mark = host?.querySelector<HTMLElement>(selector);
    return mark ? mark.getBoundingClientRect().bottom - frame.top : null;
  };
  const start =
    footOf(
      group.parentElement?.closest("li, [data-nest-host]"),
      options.parent ?? options.glyph
    ) ?? 0;
  // Each list's line. The group's own leaves the parent's glyph; a list
  // open under a child leaves that child's glyph, as far along the whole
  // line as the child's arm ends.
  const lines = new Map<Element, Line>([[group, { at: start, base: 0 }]]);
  const arrived = new Map<Element, number>();
  const lineOf = (list: Element): Line => {
    let line = lines.get(list);
    if (!line) {
      const host = list.parentElement?.closest("li, [data-nest-host]");
      line = {
        at: footOf(host, options.glyph) ?? start,
        base: (host && arrived.get(host)) ?? 0,
      };
      lines.set(list, line);
    }
    return line;
  };
  const items: Item[] = [];
  const stretches: Stretch[] = [];
  let trunk = 0;
  for (const el of group.querySelectorAll<HTMLElement>("[data-branch-item]")) {
    const li = el.closest("li");
    const list =
      li !== null &&
      group.contains(li) &&
      li.parentElement?.classList.contains("kit-nest") === true
        ? li.parentElement
        : null;
    const line = lineOf(list ?? group);
    const item = itemOf(el, options.glyph, frame, line);
    if (list && li) {
      const drawn = railsOf(li, frame, line);
      stretches.push(...drawn);
      const elbow = drawn.find((stretch) => stretch.pseudo === "::before");
      if (elbow) {
        item.arrive = endOf(elbow);
        if (list === group) {
          trunk = Math.max(trunk, elbow.from + cornerOf(elbow).down);
        }
      }
    }
    arrived.set(li ?? el, item.arrive);
    items.push(item);
  }
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
    trunk: trunk || length,
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
 * is (0–1 of the line), and how far in each child's glyph and title are
 * (0–1), in the order of the items it was read for.
 */
interface State {
  glyphs: number[];
  head: number;
  room: number;
  titles: number[];
}

/** A fold as functions of its own time τ (ms). */
interface Plan {
  /** The room's foot, from the group's top. */
  edge: (t: number) => number;
  glyphs: Seg[];
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
 * below the edge. Each child enters as the head reaches its glyph, so
 * children an even distance apart along the line enter at even times.
 */
function planOpen(shape: Shape, now: State, speed: number): Plan {
  const grow = shape.height - now.room;
  const room = glide(Math.abs(grow), speed);
  const edge = (t: number) => now.room + Math.sign(grow) * room.covered(t);
  const from = now.head * shape.length;
  const line = glide(Math.max(0, shape.length - from), speed);
  const head = (t: number) => from + line.covered(t);
  const when = (s: number) => (s <= from ? 0 : line.reached(s - from));
  const rail = dur("--dur-rail");
  const enter = (was: number[]) =>
    shape.items.map((item, i): Seg => {
      const v = Math.min(1, was[i] ?? 0);
      return {
        from: v,
        to: 1,
        start: when(item.arrive),
        length: rail * (1 - v),
      };
    });
  const glyphs = enter(now.glyphs);
  const titles = enter(now.titles);
  return {
    edge,
    head,
    when,
    glyphs,
    titles,
    length: shape.length,
    total: Math.max(
      line.duration,
      room.duration,
      ...[...glyphs, ...titles].map((seg) => seg.start + seg.length)
    ),
  };
}

/**
 * How much of a fold's exit its line takes to run back. The room closes on
 * the rows' in-out curve, which at its steepest is 1.398 times as far on as
 * a straight run over the same time (the most of easeInOut(x) / x): a line
 * running back at one pace stays ahead of the room's edge only if it is home
 * within 1 / 1.398 = 0.715 of the exit.
 */
const RUN_BACK = 0.65;

/**
 * Folding from where `now` left it, over --dur-exit. The room closes on the
 * rows' curve; the line runs back ahead of the edge at one steady pace, so
 * children an even distance apart along it are left at even times. On --ease-out it left the last of them first
 * and fastest: a tree with a nested branch folded 7.5, 8.6, 10.3 then 15.8ms
 * apart. As the head leaves a child's glyph, its title wipes out over the
 * first half of the exit and its glyph flies out over the middle half, each
 * done by the time the room has closed: from then the group stands outside
 * its parent's box, under the rows that slid up, until it unmounts (`fold`).
 */
function planFold(shape: Shape, now: State, exit: number): Plan {
  const edge = (t: number) => now.room * (1 - easeInOut(clamp(t / exit, 0, 1)));
  const from = now.head * shape.length;
  // Off at full pace, as the room's edge leaves slowly: an eased start (a
  // glide's) left the first child a third later than the rest.
  const home = exit * RUN_BACK;
  const head = (t: number) => from * (1 - clamp(t / home, 0, 1));
  const when = (s: number) =>
    s >= from || from <= 0 ? 0 : home * (1 - s / from);
  const half = exit / 2;
  const leave = (was: number[], after: number) =>
    shape.items.map((item, i): Seg => {
      const v = Math.max(0, was[i] ?? 0);
      const start = Math.min(exit, when(item.arrive) + after);
      return {
        from: v,
        to: 0,
        start,
        length: Math.min(half * v, exit - start),
      };
    });
  const titles = leave(now.titles, 0);
  const glyphs = leave(now.glyphs, exit / 4);
  return {
    edge,
    head,
    when,
    glyphs,
    titles,
    length: shape.length,
    total: exit,
  };
}

/** Keyframes half a 60Hz frame apart, linear between: finer than any frame. */
const STEP = 1000 / 120;
/** A frame at 60Hz: a fold's batch starts on the next one (`atTravel`). */
const FRAME = 1000 / 60;
/** Unclipped on that side: what a row draws outside itself shows. */
const OPEN = "-100vmax";

/** A group cut `below` px up from its foot: the room it still has. */
const shut = (below: number): string =>
  `inset(${OPEN} ${OPEN} ${px(Math.max(0, below))} ${OPEN})`;

/** A row's title `v` of the way wiped in: cut from the right, past its glyph. */
const wiped = (item: Item, v: number): Keyframe => ({
  clipPath: `inset(${OPEN} ${px((item.width - item.reveal) * (1 - v))} ${OPEN} ${OPEN})`,
});

/** A row's glyph `v` of the way in: off its place to the left, faded with it, over the line it flies along. */
const flown = (item: Item, v: number): Keyframe => ({
  translate: `${px(-item.dx * (1 - v))} 0px`,
  opacity: v.toFixed(3),
  zIndex: 2,
});

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
    return to >= size ? UNCUT : Math.max(0, size - (end - edge));
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
 * A stretch's keyframes: sampled where the head passes it, and only there; a
 * run of equal frames is two. Each holds until the next (`step-end`): eased
 * from one to the next, a cut passed between pixels on its way. Each
 * sample's offset is its place in `times`
 * (evenly spaced over the plan), never its time over the plan's total: the
 * last one came to 1 and a rounding over, `animate` threw, and the throw
 * stopped the batch, every room and row after it held at its first frame.
 */
function railFrames(plan: Plan, stretch: Stretch, times: number[]): Keyframe[] {
  const last = Math.max(1, times.length - 1);
  const cuts = times.map((t) => cutAt(stretch, plan.head(t)));
  const same = (a: number, b: number) =>
    cuts[a][0] === cuts[b][0] && cuts[a][1] === cuts[b][1];
  const frames: Keyframe[] = [];
  cuts.forEach(([right, below], k) => {
    if (k === 0 || k === last || !same(k, k - 1) || !same(k, k + 1)) {
      frames.push({
        offset: k / last,
        easing: "step-end",
        [CUT_RIGHT]: px(right),
        [CUT_BELOW]: px(below),
      });
    }
  });
  return frames;
}

/**
 * One piece of a plan, still to build: the stretch of the group's frame it
 * is drawn in, and τ (ms) when it first moves.
 */
interface Piece {
  bottom: number;
  build: () => Animation[];
  start: number;
  top: number;
}

/**
 * Built this far ahead of its start when a frame has room for it: eight
 * frames at 60Hz. A piece once built runs on the compositor, through
 * whatever holds the main thread; one not yet built waits for it. With a
 * session streaming, a frame of its socket's messages held the main thread
 * 120ms, and a stretch of line due in it, built two frames ahead, stood
 * still until it was over.
 */
const AHEAD = (1000 / 60) * 8;
/** Built by this far ahead of its start, whatever else the frame builds: two frames. */
const SOON = (1000 / 60) * 2;
/**
 * Pieces a frame builds ahead of `SOON`, soonest first. Every piece of a
 * tree due within `AHEAD`, built on the frame its fold started, ran that
 * frame to 18-20ms in paint, layerize and the compositor's setup of each
 * new animation, and the fold dropped its first frame; a few a frame, the
 * rest are built over the frames after, still well before they move.
 */
const EARLY = 2;

/**
 * Every piece of a plan, to build on its own elements: each row's glyph
 * flight and title wipe, each on --ease-out, and each stretch of line as
 * the frames it moves on. Each holds where it starts until it moves and
 * where it ends after (`fill: "both"`): an opening lands (`fly`), a fold
 * unmounts.
 *
 * `rests`: until it is built, every piece stands where its plan starts it,
 * hidden under the group's hold (a fresh opening) or at rest (a fold from
 * rest). Then a piece is built a little before it moves (`SOON` at the
 * latest, `AHEAD` when a frame has room), and only
 * once it is in view (`fly`): built at once, a tree of forty under the rail's foot cost
 * the frame its fold started on 13ms in `animate` alone, mostly for rows
 * nobody could see, and every piece of a tall tree in view still made that
 * frame run past 16ms. A fold turned back mid-way has pieces caught
 * part-way, so each in view is built at once.
 */
function piecesOf(
  shape: Shape,
  plan: Plan,
  rests: boolean,
  opening: boolean
): Piece[] {
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
  const pieces: Piece[] = [];
  shape.items.forEach((item, i) => {
    const glyph = plan.glyphs[i];
    const title = plan.titles[i];
    if (opening && glyph.from >= 1 && title.from >= 1) {
      return;
    }
    pieces.push({
      top: item.top,
      bottom: item.bottom,
      start: rests ? Math.min(glyph.start, title.start) : 0,
      build: () => [
        item.el.animate(
          [wiped(item, title.from), wiped(item, title.to)],
          timing(title)
        ),
        ...(item.icon
          ? [
              item.icon.animate(
                [flown(item, glyph.from), flown(item, glyph.to)],
                timing(glyph)
              ),
            ]
          : []),
      ],
    });
  });
  for (const stretch of shape.stretches) {
    // Opening, the head comes in at a stretch's top; folding, at its end.
    const enters = plan.when(opening ? stretch.from : endOf(stretch));
    pieces.push({
      top: stretch.top,
      bottom: stretch.top + stretch.height,
      start: rests ? enters : 0,
      build: () => [
        stretch.li.animate(railFrames(plan, stretch, times), {
          duration: plan.total,
          easing: "linear",
          fill: "both",
          pseudoElement: stretch.pseudo,
        }),
      ],
    });
  }
  return pieces;
}

/**
 * A flight's pieces, each built on the fold's clock, so it stands where the
 * plan has it, once it is in view and due: every one `SOON` of its start,
 * and `EARLY` more a frame, soonest first, up to `AHEAD` of theirs. Checked
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
  pieces.sort((a, b) => a.start - b.start);
  const build = (now: number) => {
    let early = EARLY;
    for (let i = 0; i < pieces.length; ) {
      const piece = pieces[i];
      const due = piece.start - (now - start);
      if (due > AHEAD) {
        return;
      }
      if (!view(piece.top, piece.bottom) || (due > SOON && early === 0)) {
        i += 1;
        continue;
      }
      if (due > SOON) {
        early -= 1;
      }
      for (const animation of piece.build()) {
        animation.startTime = start;
        flight.animations.push(animation);
      }
      pieces.splice(i, 1);
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

const flights = new WeakMap<HTMLElement, Flight>();

/** Values read for one list of rows, by element, for another: a row new to it was nowhere. */
const byElement = (from: HTMLElement[], values: number[], to: HTMLElement[]) =>
  to.map((el) => {
    const i = from.indexOf(el);
    return i === -1 ? 0 : values[i];
  });

/**
 * Where the fold in flight on `group` stands now, held there (its pieces
 * paused, to be dropped once the next fold takes over), for `items`. With
 * none in flight, or one that has landed: at rest, `rest.room` tall and
 * every piece `rest.value` of the way in.
 */
function stopFlight(
  group: HTMLElement,
  items: HTMLElement[],
  rest: { room: number; value: number }
): { held: Animation[]; now: State } {
  const flight = flights.get(group);
  flights.delete(group);
  const resting: State = {
    room: rest.room,
    head: rest.value,
    glyphs: items.map(() => rest.value),
    titles: items.map(() => rest.value),
  };
  if (!flight) {
    return { held: [], now: resting };
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
        glyphs: byElement(flight.items, flight.rest.glyphs, items),
        titles: byElement(flight.items, flight.rest.titles, items),
      },
    };
  }
  const t = Number(document.timeline.currentTime) - start;
  if (t >= plan.total) {
    return { held, now: resting };
  }
  const at = Math.max(0, t);
  const read = (segs: Seg[]) =>
    byElement(
      flight.items,
      segs.map((seg) => valueAt(seg, at)),
      items
    );
  return {
    held,
    now: {
      room: plan.edge(at),
      head: plan.length > 0 ? plan.head(at) / plan.length : 0,
      glyphs: read(plan.glyphs),
      titles: read(plan.titles),
    },
  };
}

/** Back in the flow, and out of it: the room the group takes. */
function inFlow(group: HTMLElement): void {
  group.style.position = "";
  group.style.insetBlockStart = "";
  group.style.insetInlineStart = "";
  group.style.inlineSize = "";
}
/**
 * Where it stood in the flow, to the subpixel. Placed by its whole-pixel
 * offsets, a group whose rows start on a fraction of a pixel shifted by that
 * fraction as its fold began, its line's cuts with it, off the pixel grid.
 */
function outOfFlow(group: HTMLElement): void {
  const parent = group.offsetParent;
  const box = group.getBoundingClientRect();
  const frame = parent?.getBoundingClientRect();
  const top = frame
    ? box.top - frame.top - (parent?.clientTop ?? 0)
    : group.offsetTop;
  const left = frame
    ? box.left - frame.left - (parent?.clientLeft ?? 0)
    : group.offsetLeft;
  group.style.position = "absolute";
  group.style.insetBlockStart = `${top}px`;
  group.style.insetInlineStart = `${left}px`;
  group.style.inlineSize = `${box.width}px`;
}

const itemsOf = (group: HTMLElement) => [
  ...group.querySelectorAll<HTMLElement>("[data-branch-item]"),
];

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
 * cuts their pieces move (app.css `[data-branch-draw]`). Off at rest, where
 * a stretch has no clip at all.
 */
const DRAWN = "data-branch-draw";

/** A state read for `from`, for the rows a shape has measured. */
const stateFor = (shape: Shape, from: HTMLElement[], now: State): State => {
  const to = shape.items.map((item) => item.el);
  return {
    room: now.room,
    head: now.head,
    glyphs: byElement(from, now.glyphs, to),
    titles: byElement(from, now.titles, to),
  };
};

function open(group: HTMLElement, options: BranchOptions): TransitionConfig {
  const items = itemsOf(group);
  const turning = flights.has(group);
  const { held, now } = stopFlight(group, items, { room: 0, value: 0 });
  inFlow(group);
  if (turning) {
    // reflow hears the group take its room again, in this update.
    group.dataset.state = "open";
  }
  const flight: Flight = {
    // Held where they are (turned back) or hidden (just mounted) until the
    // batch starts.
    animations: held,
    items,
    plan: null,
    rest: now,
    start: null,
  };
  if (!turning) {
    group.setAttribute(HELD, "");
  }
  flights.set(group, flight);
  if (!motionOk.current) {
    group.removeAttribute(HELD);
    group.removeAttribute(DRAWN);
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
  group.setAttribute(DRAWN, "");
  // Measured on the batch's frame, where every row and rail is placed, and
  // planned from where every piece is held. Its pace is asked for now, from
  // the room it takes and the glyphs in it (curves `glideSpeed`):
  // --dur-stagger from one row's glyph to the next, --dur-cascade at most for
  // the whole tree; a result with no glyph opens over --dur-panel. The same
  // tree opening in another list in the same batch travels at this one's
  // speed (motion/rows `atTravel`).
  const begin = () => {
    const pace = glideSpeed(
      group.offsetHeight,
      items.filter((el) => el.querySelector(options.glyph)).length
    );
    // Turned back mid-fold, it carries on from where the fold left it in the
    // next frame (`now`); from rest it waits for its batch's two frames.
    flight.hold = atTravel(
      (at, batch) => takeOff(at, batch.speed ?? pace.speed),
      { ...pace, now: turning }
    );
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
      // Every write first, then the one layout its height and the lists'
      // measure are read in, and reflow reads it as it stands.
      show();
      group.dataset.state = "open";
      begin();
      measureNestsIn(group);
    }, 0);
    flight.hold = () => {
      clearTimeout(shown);
      show();
    };
  }
  return { duration: dur("--dur-cascade") + dur("--dur-rail") };

  /** On the batch's frame, at its speed (motion/rows `atTravel`). */
  function takeOff(at: number, speed: number): void {
    if (flights.get(group) !== flight) {
      return;
    }
    const shape = measure(group, options);
    const plan = planOpen(shape, stateFor(shape, items, now), speed);
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
    fly(
      group,
      flight,
      piecesOf(shape, plan, !turning, true),
      shape.seen,
      () => {
        group.removeAttribute(HELD);
        group.removeAttribute(DRAWN);
        for (const animation of flight.animations) {
          animation.cancel();
        }
        flight.animations = [];
      }
    );
  }
}

function fold(group: HTMLElement, options: BranchOptions): TransitionConfig {
  const items = itemsOf(group);
  const { held, now } = stopFlight(group, items, {
    room: group.offsetHeight,
    value: 1,
  });
  if (!motionOk.current) {
    // Still: they fade where they stand, then the room closes at once.
    for (const animation of held) {
      animation.cancel();
    }
    group.removeAttribute(HELD);
    group.removeAttribute(DRAWN);
    const fades = items.map((el) =>
      el.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: dur("--dur-exit"),
        easing: CURVE.out,
        fill: "forwards",
      })
    );
    flights.set(group, {
      animations: fades,
      items,
      plan: null,
      rest: now,
      start: null,
    });
    return { duration: dur("--dur-exit") };
  }
  group.setAttribute(DRAWN, "");
  const shape = measure(group, options);
  const state = stateFor(shape, items, now);
  const plan = planFold(shape, state, dur("--dur-exit"));
  // From rest, a piece not yet built stands where it starts.
  const rests =
    state.head >= 1 &&
    state.glyphs.every((v) => v >= 1) &&
    state.titles.every((v) => v >= 1) &&
    Math.abs(state.room - shape.height) < 0.5;
  const flight: Flight = {
    // Held where they are (turned back) until the batch starts.
    animations: held,
    items: shape.items.map((item) => item.el),
    plan: null,
    rest: state,
    start: null,
  };
  flights.set(group, flight);
  // From the next frame, the batch the room and every row under it close
  // in: nothing waits for the rows to leave first.
  flight.hold = atTravel(
    (at) => {
      if (flights.get(group) !== flight) {
        return;
      }
      for (const animation of flight.animations) {
        animation.cancel();
      }
      flight.animations = [];
      flight.plan = plan;
      flight.start = at;
      // The group closes with its room, on the room's curve, and stays shut
      // until it unmounts: out of the flow, it stands under the rows that
      // slide up, and once its parent's box had closed, what was left of each
      // row past its title's cut (its glyph's place, a selected row's fill)
      // showed over them until the unmount.
      const room = group.animate(
        [
          { clipPath: shut(shape.height - state.room) },
          { clipPath: shut(shape.height) },
        ],
        { duration: plan.total, easing: CURVE.inOut, fill: "both" }
      );
      room.startTime = at;
      flight.animations.push(room);
      fly(group, flight, piecesOf(shape, plan, rests, false), shape.seen);
      // Folded before it ever opened: its pieces hold it hidden now.
      group.removeAttribute(HELD);
    },
    { close: true, now: true }
  );
  // The group leaves the flow now, so reflow hears it (`data-state`) in
  // this update and holds its box and everything under it until the batch.
  outOfFlow(group);
  group.dataset.state = "closing";
  // Unmounted once the last piece has gone: a frame for the batch, and a
  // frame to spare.
  return { duration: plan.total + FRAME + STEP * 2 };
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
