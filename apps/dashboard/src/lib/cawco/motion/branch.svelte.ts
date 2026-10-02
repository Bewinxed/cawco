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
import { atTravel, heldToTravel } from "./rows.svelte";

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
 * Measured in layout, transforms ignored, and only once the page is laid
 * out: the size observer's first call comes after layout and before paint.
 * One observer for every list, which reads them all and then writes them
 * all: read and written a list at a time, each list's write laid the page
 * out again for the next one's read, a tree opening in the rail and the
 * home at once paid a layout a list.
 */
type Measured = [HTMLElement, Record<string, string>];

/** Where a list's rails go: down in drawn boxes, across in layout. */
function nestOf(
  node: HTMLElement,
  glyph: string,
  child: string
): Measured | null {
  const parent = parentGlyph(node, glyph);
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

const nests = new Map<Element, () => Measured | null>();
let nestSizes: ResizeObserver | null = null;

export function nestFrom(
  glyph: string,
  child = glyph
): Attachment<HTMLElement> {
  return (node) => {
    nests.set(node, () => nestOf(node, glyph, child));
    // Its first call is the measure, after layout; after that, a rail or
    // font change that moves a glyph measures again. The border box: the
    // inset this sets (`--nest-pad`) resizes the content box, and watching
    // that would hear its own write back as a second resize.
    nestSizes ??= new ResizeObserver((entries) => {
      const measured = entries
        .map((entry) => nests.get(entry.target)?.() ?? null)
        .filter((each): each is Measured => each !== null);
      for (const [list, vars] of measured) {
        for (const [name, value] of Object.entries(vars)) {
          list.style.setProperty(name, value);
        }
      }
    });
    nestSizes.observe(node, { box: "border-box" });
    return () => {
      nests.delete(node);
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
  /** How far left of its place it starts: out of its parent's column. */
  dx: number;
  el: HTMLElement;
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
    let y = topIn(frame, el);
    if (own) {
      const tile = own.getBoundingClientRect();
      y = tile.top + tile.height / 2 - frame.top;
    }
    items.push({ el, dx, y });
  }
  return {
    start,
    end: Math.max(start, ...items.map((item) => item.y)),
    height: frame.height,
    items,
    rails,
  };
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
  const swipes = shape.items.map((item, i): Swipe => {
    const p0 = Math.min(1, was[i] ?? 0);
    const cross = grow < 0.5 ? 0 : travel * reach((item.y + lag - from) / grow);
    return { from: p0, to: 1, start: cross, length: swipe * (1 - p0) };
  });
  const total = Math.max(travel, ...swipes.map((s) => s.start + s.length));
  return {
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
  const crossings = shape.items.map((item) =>
    from < 0.5 ? 0 : travel * reach(1 - (item.y + lag) / from)
  );
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
 * Every piece of a plan as an animation on its own element: each child's
 * swipe as one segment on --ease-out, each stretch of rail as the frames it
 * moves on. Opening (`fill: "none"`), a child holds where it starts until
 * its swipe and is at rest after it; folding (`"both"`), each piece holds
 * where it ends until the group unmounts.
 */
function animate(shape: Shape, plan: Plan, fill: FillMode): Animation[] {
  const count = Math.max(2, Math.ceil(plan.total / STEP));
  const times = Array.from(
    { length: count + 1 },
    (_, k) => (plan.total * k) / count
  );
  const animations: Animation[] = [];
  shape.items.forEach((item, i) => {
    const swipe = plan.swipes[i];
    if (fill === "none" && swipe.from >= 1) {
      return;
    }
    animations.push(
      item.el.animate([swiped(item, swipe.from), swiped(item, swipe.to)], {
        delay: swipe.start,
        duration: Math.max(swipe.length, 1),
        easing: CURVE.out,
        fill: fill === "none" ? "backwards" : "both",
      })
    );
  });
  for (const rail of shape.rails) {
    const frames = railFrames(shape, plan, rail, times);
    const still = frames.every(
      (frame) => frame.clipPath === frames[0].clipPath
    );
    if (
      fill === "none" &&
      still &&
      frames[0].clipPath === "inset(0px 0.00px 0.00px 0px)"
    ) {
      continue;
    }
    animations.push(
      rail.li.animate(frames, {
        duration: plan.total,
        easing: "linear",
        fill,
        pseudoElement: rail.pseudo,
      })
    );
  }
  return animations;
}

/* ── The transition ────────────────────────────────────────────────── */

/** A fold in flight on a group: its plan, on the clock it started on. */
interface Flight {
  animations: Animation[];
  /** Drops the hold it put on the batch. */
  hold?: () => void;
  items: HTMLElement[];
  plan: Plan | null;
  /** Its τ = 0 on the document timeline; null until its batch starts. */
  start: number | null;
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
 * update that mounts it to the frame its fold starts (app.css
 * `[data-branch-hold]`): one attribute, where an animation a piece cost
 * the click its own long task.
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
  // Measured on the batch's frame, once the rails are placed (nestFrom
  // measures after layout), and planned from where every piece is held.
  flight.hold = atTravel((at) => {
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
    const animations = animate(shape, plan, "none");
    for (const animation of animations) {
      animation.startTime = at;
    }
    // In the same frame the pieces take over from the hold.
    group.removeAttribute(HELD);
    flight.animations = animations;
    flight.items = shape.items.map((item) => item.el);
    flight.plan = plan;
    flight.start = at;
  });
  return { duration: dur("--dur-panel") + dur("--dur-rail") };
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
  // Both ways: started on this task's clock, a hair after the frame's, so
  // the frame it is drawn in falls before its start, and it holds its first
  // keyframe there rather than the row standing at rest for a frame.
  const animations = animate(shape, plan, "both");
  for (const animation of animations) {
    animation.startTime = start;
  }
  // Folded before it ever opened: the pieces hold it hidden now.
  group.removeAttribute(HELD);
  // The room closes from the batch's frame, after the lead; the group leaves
  // the flow now, so reflow hears it (`data-state`) in this update and holds
  // its box and everything under it until then.
  const hold = atTravel(() => {
    /* the hold alone */
  }, start + plan.lead);
  outOfFlow(group);
  group.dataset.state = "closing";
  flights.set(group, {
    animations,
    hold,
    items: shape.items.map((item) => item.el),
    plan,
    start,
  });
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
