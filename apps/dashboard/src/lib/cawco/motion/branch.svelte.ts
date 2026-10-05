/**
 * A tree's fold: the rows under a parent row opening and folding away, the
 * same in every list that nests rows (the rail's projects, sessions and
 * delegates at every depth, the home's Working and Finished, a run step's
 * result). One primitive, read off one moving point: the head of the line
 * that leaves the parent's glyph, measured from the glyph's centre.
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
 * apart. The moment the head reaches a child's place, its glyph has landed
 * and its title wipes in left to right, on --ease-out over --dur-rail. No
 * row ever moves: each stands at its place inside the growing box, and only
 * its glyph is drawn on its way there. Every piece in view is built before
 * the opening starts, held at its first frame, and all are started together
 * on the batch's frame (`open`): built as the head neared each, a tree of
 * seven made 6, 16 and 16 animations in its first three frames, and Safari
 * took 38 to 73ms over each of them.
 *
 * Folding. The group leaves as one piece, quicker than it opened and under
 * way in the next frame, from the click's own time (motion/rows `now`): one
 * clip closes it from its foot over --dur-exit, on the rows' curve, as the
 * rows under it slide up with the room's edge (the batch's "close" pace).
 * The clip's edge is the line's end: the line shortens from its foot up the
 * rail and on up to the parent's glyph, where the clip stops; then the group
 * unmounts. One animation, however many rows the tree has. Each row left on
 * its own (its title wiped out, its glyph rode the line back, each stretch
 * of line was cut back): thirty-eight animations for a tree of seven, made
 * inside a fold that is shown in ten frames, and Safari showed four.
 *
 * Turned back mid-way, an opening carries on from where the fold left the
 * room, with every row as it stood; a fold takes an opening as it stands,
 * its pieces held at the click's time, and closes over them. Either starts
 * at that same time with the box and the rows under it, so the next frame
 * already shows it under way. Waiting for a batch of its own, the line stood
 * still a frame (a fold) or two (an opening) at every turn.
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
 * page is styled: each row's and glyph's drawn box, its line's two computed
 * styles, and its layout box, every offset parent read once for the whole
 * tree (`layoutBoxes`). Every row is read, in view or not: a tree's rows
 * differ in height (a row with a list open under it, a project's sessions
 * beside its "N older" box, a run step's result), so none is placed by
 * arithmetic. A fold reads its group's box and its parent's glyph alone,
 * then leaves the flow as its last write, and motion/rows reads after it. A
 * tree opening has one layout to pay in the task that
 * shows it, its rows', and a list never measured before takes its insets
 * off its first row ahead of that layout (`measureFirst`), not after it.
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
 *         in:branch={{ glyph: ".tree-mark" }} out:branch={{ glyph: ".tree-mark" }}
 *         {@attach nestFrom(".tree-mark")}>
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
  numberOf,
} from "./curves.svelte";
import {
  atTravel,
  BLEED,
  beforeReflow,
  heldToTravel,
  skippedAt,
} from "./rows.svelte";

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
    const up = at.offsetParent as HTMLElement | null;
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

/** One element's layout box on the page, transforms ignored. */
const layoutBox = (element: HTMLElement): Box => layoutBoxes()(element);

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
 *   <ul class="kit-nest" {@attach nestFrom(".tree-mark")}>
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
  // down in drawn boxes read against each other, to the subpixel, a glyph's
  // less its own ride (`restOf`; nothing else here moves vertically on its
  // own transform; see `railsOf`).
  const mark = layoutBox(parent);
  const first =
    node.getBoundingClientRect().top +
    node.clientTop +
    Number.parseFloat(getComputedStyle(node).paddingTop);
  const vars: Record<string, string> = {
    "--nest-x": px(mark.left + mark.width / 2 - layoutBox(node).left),
    "--nest-lead": px(first - (restOf(parent).y + parent.offsetHeight / 2)),
  };
  const row = node.querySelector<HTMLElement>(":scope > li");
  const own = row?.querySelector<HTMLElement>(child);
  if (row && own) {
    vars["--nest-glyph-y"] = px(
      restOf(own).y - row.getBoundingClientRect().top
    );
    vars["--nest-reach"] = px(layoutBox(own).left - layoutBox(row).left);
  }
  return [node, vars];
}

interface Nest {
  host: Element | null;
  kind: string;
  measure: () => Measured | null;
  /** It started out where another list stood; false, at the stylesheet's own insets. */
  seeded: boolean;
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

/**
 * The lists drawn in this update, but those a group holds out of the layout
 * (`open` measures them as it shows them) and those in a list that is not
 * rendered (`skippedAt`): measured there, each read laid out content nobody
 * is shown. Such a list keeps the insets it started out with, and the size
 * observer measures it when it is rendered.
 */
function settleDrawn(): void {
  const lists = [...drawnNow].filter(
    (list) => list.isConnected && !isUnshown(list) && !skippedAt(list)
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

/**
 * A group shown with only the first row of its own list laid out (app.css
 * `[data-branch-probe]`), for `measureFirst`.
 */
const PROBE = "data-branch-probe";

/**
 * A group just shown whose list started at the stylesheet's own insets (the
 * first tree of its kind opened on the page) takes its insets before its
 * rows are styled: read with only its first row laid out, which is all they
 * are read from, then written. Written once every row was styled, as a list
 * that starts out where another stood never needs, the insets (inherited by
 * every row) styled the tree's rows a second time in the task that showed
 * them: 32ms more for a tree of 140, the first time one opened.
 */
function measureFirst(group: HTMLElement): void {
  if (nests.get(group)?.seeded !== false) {
    return;
  }
  const first = group.querySelector(":scope > li");
  group.setAttribute(PROBE, "");
  measureNests(
    [group, ...(first?.querySelectorAll(".kit-nest") ?? [])].filter((list) =>
      nests.has(list)
    )
  );
  group.removeAttribute(PROBE);
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
    const known = (host && byHost.get(host)) ?? byKind.get(kind);
    nests.set(node, {
      host,
      kind,
      measure: () => nestOf(node, glyph, child),
      seeded: known !== undefined,
    });
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

/**
 * A list's line: how far down the group its parent's glyph's centre is,
 * where it starts, and how far along the whole line that is; and the deck
 * the parent stands on, whose cards its first children start as.
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
 * The stretches of line a list item draws, in the group's frame. The fold's
 * heights are read to the subpixel: drawn boxes, against the group's own.
 * Nothing in or around a group but a glyph moves on its own transform while
 * it is measured (a glyph on its way is read less its ride, `restOf`, and a
 * slide that carries the parent's box carries the group with it), so the
 * differences are layout's,
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
  const rail = elbow.x + (corner - radius);
  const arm = elbow.x + corner;
  const length = before + down + arc + Math.max(0, centre.x - arm);
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
          arm - radius * Math.cos(turned) - centre.x,
          turn + radius * Math.sin(turned) - centre.y,
        ];
      }
      return [arm + (along - down - arc) - centre.x, 0];
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
function nestOfItem(
  group: HTMLElement,
  li: HTMLLIElement | null
): HTMLElement | null {
  const list = li?.parentElement;
  return list && group.contains(li) && list.classList.contains("kit-nest")
    ? list
    : null;
}

function measure(group: HTMLElement, options: BranchOptions): Shape {
  const frame = group.getBoundingClientRect();
  // Each list's line. The group's own leaves the parent's glyph; a list
  // open under a child leaves that child's glyph, as far along the whole
  // line as the child is.
  const own = lineFrom(
    frame,
    group.parentElement?.closest("li, [data-nest-host]"),
    options.parent ?? options.glyph,
    0,
    0
  );
  const start = own.at;
  const lines = new Map<Element, Line>([[group, own]]);
  const arrived = new Map<Element, number>();
  const lineOf = (list: Element): Line => {
    let line = lines.get(list);
    if (!line) {
      const host = list.parentElement?.closest("li, [data-nest-host]");
      line = lineFrom(
        frame,
        host,
        options.glyph,
        (host && arrived.get(host)) ?? 0,
        start
      );
      lines.set(list, line);
    }
    return line;
  };
  /** Which child of its list a glyph is, 1 first. */
  const places = new Map<Element, number>();
  const items: Item[] = [];
  const stretches: Stretch[] = [];
  const boxOf = layoutBoxes();
  let trunk = 0;
  for (const el of group.querySelectorAll<HTMLElement>("[data-branch-item]")) {
    const li = el.closest("li");
    const list = nestOfItem(group, li);
    const line = lineOf(list ?? group);
    const item = itemOf(el, options.glyph, frame, line, boxOf);
    const drawn = list && li ? railsOf(li, frame, line) : [];
    stretches.push(...drawn);
    const elbow = drawn.find((stretch) => stretch.pseudo === "::before");
    if (elbow && list === group) {
      trunk = Math.max(trunk, elbow.from + cornerOf(elbow).down);
    }
    if (item.centre) {
      const place = (places.get(list ?? group) ?? 0) + 1;
      places.set(list ?? group, place);
      item.ride = rideOf(item, item.centre, elbow, line, frame, place);
      item.arrive = line.base + item.ride.length;
    } else if (elbow) {
      item.arrive = endOf(elbow);
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
    seen: viewOf(group, frame, boxOf(group).top),
  };
}

/**
 * The viewport in the group's frame, where the group is drawn and where it
 * is laid out: it sits `shift` below its place while a slide carries it.
 */
function viewOf(
  group: HTMLElement,
  frame = group.getBoundingClientRect(),
  laidOut = layoutBox(group).top
): Shape["seen"] {
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
  const rail = dur("--dur-rail");
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
 * Folding from where `now` left it, over --dur-exit: the room closes on the
 * rows' curve, and nothing in it moves. The line's head and every title
 * stand where `now` has them (as shares: the line is taken as 1 long), so an
 * opening that turns the fold back plans from the room alone.
 */
function planFold(now: State, exit: number): Plan {
  return {
    edge: (t) => now.room * (1 - easeInOut(clamp(t / exit, 0, 1))),
    head: () => now.head,
    when: () => 0,
    titles: now.titles.map(
      (v): Seg => ({ from: v, to: v, start: 0, length: 0 })
    ),
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
 * A group cut `below` px up from its foot: the room it still has. Open
 * above as far as its line starts, `lead` px over its top at the foot of
 * its parent's glyph.
 */
const shut = (lead: number, below: number): string =>
  `inset(${px(-(BLEED + lead))} ${px(-BLEED)} ${px(Math.max(0, below))} ${px(-BLEED)})`;

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
  /** An animation over the span of its own, linear: a glyph's ride, its skin's fade, a stretch's cuts. */
  const along = (
    { frames, delay, duration }: Span,
    pseudoElement?: Stretch["pseudo"]
  ): [Keyframe[], KeyframeAnimationOptions] => [
    frames,
    { delay, duration, easing: "linear", fill: "both", pseudoElement },
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
      build: () => [
        stretch.li.animate(...along(railFrames(plan, stretch), stretch.pseudo)),
      ],
    });
  }
  return pieces;
}

/** The pieces now in view, built and taken off the list. */
function buildSeen(pieces: Piece[], seen: Shape["seen"]): Animation[] {
  const made: Animation[] = [];
  for (let i = 0; i < pieces.length; ) {
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
  group: HTMLElement,
  flight: Flight,
  pieces: Piece[],
  landed: () => void
): void {
  const { plan, start } = flight;
  if (!plan || start === null) {
    return;
  }
  const options = { capture: true, passive: true } as const;
  const scrolled = ({ target }: Event) => {
    // Another pane scrolling moves nothing of the group.
    if (target === document || (target as Node).contains(group)) {
      for (const animation of buildSeen(pieces, viewOf(group))) {
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

/** At rest: the room `room` tall, and every piece `value` of the way in. */
const resting = (items: HTMLElement[], room: number, value: number): State => ({
  room,
  head: value,
  titles: items.map(() => value),
});

/**
 * Where the fold in flight on `group` stands now, held there (its pieces
 * paused, to be dropped once the next fold takes over), for `items`. With
 * none in flight, or one that has landed, it is at rest and `now` is null:
 * how tall its room is then is the caller's to read, once it has written
 * everything it writes (`fold`).
 */
function stopFlight(
  group: HTMLElement,
  items: HTMLElement[]
): { held: Animation[]; now: State | null } {
  const flight = flights.get(group);
  flights.delete(group);
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

/** Back in the flow, and out of it: the room the group takes. */
function inFlow(group: HTMLElement): void {
  group.style.position = "";
  group.style.insetBlockStart = "";
  group.style.insetInlineStart = "";
  group.style.inlineSize = "";
}
/**
 * Where it stands in the flow, to the subpixel. Placed by its whole-pixel
 * offsets, a group whose rows start on a fraction of a pixel shifted by that
 * fraction as its fold began, its line's cuts with it, off the pixel grid.
 */
function placeOf(group: HTMLElement): Box {
  const parent = group.offsetParent;
  const box = group.getBoundingClientRect();
  const frame = parent?.getBoundingClientRect();
  return {
    top: frame
      ? box.top - frame.top - (parent?.clientTop ?? 0)
      : group.offsetTop,
    left: frame
      ? box.left - frame.left - (parent?.clientLeft ?? 0)
      : group.offsetLeft,
    width: box.width,
    height: box.height,
  };
}
/** Out of the flow, where it stood in it (`placeOf`). */
function outOfFlow(group: HTMLElement, place: Box): void {
  group.style.position = "absolute";
  group.style.insetBlockStart = `${place.top}px`;
  group.style.insetInlineStart = `${place.left}px`;
  group.style.inlineSize = `${place.width}px`;
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
 * Sessions and its project, the home), and both fold in the one click: read
 * as each was asked, the second one's attributes went on after the first
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
/**
 * A group just mounted whose line has not set off yet: its parent's deck
 * still stands (app.css). The deck goes on the frame the glyphs that were
 * its cards are first drawn, a task and two frames after the mount; gone
 * from the mount, the parent stood bare for those frames.
 */
const WAITS = "data-branch-wait";

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
function unseenTurn(group: HTMLElement, opening: boolean): TransitionConfig {
  const { held } = stopFlight(group, itemsOf(group));
  for (const animation of held) {
    animation.cancel();
  }
  group.removeAttribute(HELD);
  group.removeAttribute(DRAWN);
  group.removeAttribute(WAITS);
  if (opening) {
    inFlow(group);
    group.dataset.state = "open";
  }
  return { duration: 0 };
}

function open(group: HTMLElement, options: BranchOptions): TransitionConfig {
  if (skippedAt(group)) {
    return unseenTurn(group, true);
  }
  const items = itemsOf(group);
  const turning = flights.has(group);
  const stopped = stopFlight(group, items);
  const { held } = stopped;
  const now = stopped.now ?? resting(items, 0, 0);
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
  group.toggleAttribute(WAITS, !turning);
  /** The opening as it was last laid out, and its pieces still to build. */
  let laid: { plan: Plan; shape: Shape; speed: number } | null = null;
  let pieces: Piece[] = [];
  // Its pace is asked for from the room it takes and the glyphs in it
  // (curves `glideSpeed`): --dur-stagger from one row's glyph to the next,
  // --dur-cascade at most for the whole tree; a result with no glyph opens
  // over --dur-panel. Returns the speed it asked for.
  const begin = (): number => {
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
    return pace.speed;
  };
  // Read: measured where every row and rail is placed, and planned at
  // `speed` from where every piece is held.
  const lay = (speed: number) => {
    const shape = measure(group, options);
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
        if (flights.get(group) === flight) {
          lay(begin());
        }
      },
      write: () => {
        if (flights.get(group) === flight && laid) {
          build(laid);
        }
      },
    });
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
      // Every write first, then the one layout its height, the lists'
      // measure and its own shape are read in, and reflow reads it as it
      // stands. A list never measured before takes its insets off its first
      // row alone, ahead of that layout (`measureFirst`).
      show();
      group.dataset.state = "open";
      measureFirst(group);
      const speed = begin();
      measureNestsIn(group);
      build(lay(speed));
    }, 0);
    flight.hold = () => {
      clearTimeout(shown);
      show();
    };
  }
  return { duration: dur("--dur-cascade") + dur("--dur-rail") };

  /** On the batch's frame, at its speed (motion/rows `atTravel`). */
  function takeOff(at: number, speed: number): void {
    // Its list unmounted since it asked (the rail giving way to the drawer
    // as the window narrows, a row leaving with live data): nothing is left
    // to open. Measured off the page, it has no length and no duration, and
    // `fly` asked for a frame on every frame from then on, never landing.
    if (flights.get(group) !== flight || !group.isConnected) {
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
    group.removeAttribute(WAITS);
    // Just mounted, a piece out of view is hidden under the hold until it is
    // built; the hold goes on the frame the opening lands, with the pieces,
    // each then at rest where it ends.
    fly(group, flight, pieces, () => {
      group.removeAttribute(HELD);
      group.removeAttribute(DRAWN);
      for (const animation of flight.animations) {
        animation.cancel();
      }
      flight.animations = [];
    });
  }
}

function fold(group: HTMLElement, options: BranchOptions): TransitionConfig {
  if (skippedAt(group)) {
    return unseenTurn(group, false);
  }
  const items = itemsOf(group);
  const exit = dur("--dur-exit");
  if (!motionOk.current) {
    // Still: they fade where they stand, then the room closes at once.
    const { held, now } = stopFlight(group, items);
    for (const animation of held) {
      animation.cancel();
    }
    group.removeAttribute(HELD);
    group.removeAttribute(DRAWN);
    group.removeAttribute(WAITS);
    const fades = items.map((el) =>
      el.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: exit,
        easing: CURVE.out,
        fill: "forwards",
      })
    );
    flights.set(group, {
      animations: fades,
      items,
      plan: null,
      rest: now ?? resting(items, group.offsetHeight, 1),
      start: null,
    });
    return { duration: exit };
  }
  // The one attribute the fold sets goes on before anything is read, here
  // and in every other group folding in this update (`afterWrites`). Svelte
  // has made the group inert by now, which styles every row in it again at
  // the first read; set between the reads, an attribute styled them once
  // more. reflow hears `data-state` in the update's microtask, by when the
  // group has left the flow (`place`), and holds its box and everything
  // under it until the batch. Whatever an opening it turns back had drawn
  // stays as it stood (`held`, and the group's hold over what was not built
  // yet): the fold closes over it.
  group.dataset.state = "closing";
  const { held, now } = stopFlight(group, items);
  let place: Box | null = null;
  let shuts: Keyframe[] = [];
  let folding: Flight | null = null;
  let room: Animation | null = null;
  afterWrites({
    read: () => {
      // Its box and its parent's glyph: all a fold reads of the tree.
      const frame = group.getBoundingClientRect();
      const mark = parentGlyph(group, options.parent ?? options.glyph);
      // How far over the group's top its line starts, at that glyph's foot.
      const lead = mark
        ? Math.max(0, frame.top - (restOf(mark).y + mark.offsetHeight / 2))
        : 0;
      const state = now ?? resting(items, frame.height, 1);
      const flight: Flight = {
        animations: held,
        items,
        plan: null,
        rest: state,
        start: null,
      };
      flights.set(group, flight);
      // The group closes from its foot with its room, on the room's curve,
      // and on up its line to the parent's glyph; then it stays shut until
      // it unmounts: out of the flow, it stands under the rows that slide
      // up, and would show over them once its parent's box had closed.
      shuts = [
        { clipPath: shut(lead, frame.height - state.room) },
        { clipPath: shut(lead, frame.height + lead) },
      ];
      // From the next frame, the batch the room and every row under it
      // close in.
      flight.hold = atTravel(
        (at) => {
          if (flights.get(group) !== flight) {
            return;
          }
          flight.plan = planFold(state, exit);
          flight.start = at;
          // The clip alone: an opening's pieces stay held where they stood.
          if (room) {
            room.startTime = at;
          }
        },
        { close: true, now: true }
      );
      folding = flight;
      place = placeOf(group);
    },
    // The fold's writes, after every read: its clip, held where the room
    // stands until the batch starts, and the group out of the flow.
    write: () => {
      if (!(place && folding)) {
        return;
      }
      room = group.animate(shuts, {
        duration: exit,
        easing: CURVE.inOut,
        fill: "both",
      });
      room.pause();
      folding.animations = [...held, room];
      outOfFlow(group, place);
    },
  });
  // Unmounted once the last piece has gone: a frame for the batch, and a
  // frame to spare. A fold takes --dur-exit whatever it measures (`planFold`).
  return { duration: exit + FRAME + STEP * 2 };
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
