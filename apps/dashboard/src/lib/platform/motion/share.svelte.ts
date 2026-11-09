/**
 * Shared elements: what exists on both sides of a change travels to its new
 * place instead of vanishing on one side and appearing on the other. A
 * section row's title and icon become the editor's header when you drill in
 * and go back into the row on the way out; a sidebar row becomes the tab it
 * opens; a fleet row opens into its conversation.
 *
 * A source carries `data-share="<key>"`. It departs — its rect is taken —
 * when it is clicked, and every source on the page departs when a
 * navigation starts (routes/(app)/+layout.svelte), so a page going away hands its
 * shared pieces to the page arriving. A destination lands with
 * `{@attach land(() => key)}`: when it mounts, or its key changes, and a
 * fresh departure waits under that key, it flies from the source's rect to
 * its own on the Web Animations API (FLIP, transform only) while the source
 * is hidden, so there is one object, never two. `mode: "clip"` opens a large
 * destination out of a small source by clipping instead of scaling, so a
 * transcript never squashes. `mode: "grow"` is for a destination somewhere
 * else that the source becomes (a field that opens into a palette): it
 * starts moved onto the source, cut to the source's box around its `anchor`
 * (the part of it that is the source), and travels home as the cut opens.
 * `mode: "move"` only moves it: a row that changed width or height on the
 * way (a regroup's new indent, a line it gained) is drawn at its new size
 * from the first frame, so its words never squash.
 *
 * A regroup (`regroup`: a list's groupings changed) departs every
 * `[data-regroup]` box under its root under that box's own key, and each
 * lands where it is drawn next with `landRegroup`: the same row, group
 * parent or heading moves to its new place, never closing and opening
 * again. Its keys are its own (`regroup:`), apart from a row's tab flight
 * (`session:`) and Jump's (`jump`), so a session opened just after a regroup
 * flies its tab from where its row is now.
 */
import { tick } from "svelte";
import { frameObserver } from "../frame-observer";
import { CURVE, dur, ease, motionOk } from "./curves.svelte";
import { reflowsFrom, handOver as restReflow } from "./rows.svelte";

interface Departure {
  at: number;
  /** A click on the source took it, or a navigation sweeping the page did. */
  by: "click" | "navigation";
  radius: string;
  rect: DOMRect;
  source: HTMLElement;
  /** The source stays drawn while its content travels (see `departBox`). */
  stays?: boolean;
  ttl: number;
}

const departures = new Map<string, Departure>();

/** A departure waits this long for its destination to mount. */
const TTL = 1200;

export function depart(
  source: HTMLElement,
  by: Departure["by"] = "click"
): void {
  const key = source.dataset.share;
  if (!key) {
    return;
  }
  // A source clicked on its way out was taken where it stood when it was
  // clicked. By the time the navigation it caused starts, it may be inside
  // a surface that has already left (a dialog after its exit): that later,
  // drawn-anywhere box does not replace the one the click took.
  const taken = departures.get(key);
  if (
    by === "navigation" &&
    taken?.by === "click" &&
    performance.now() - taken.at < taken.ttl
  ) {
    return;
  }
  departures.set(key, {
    by,
    rect: source.getBoundingClientRect(),
    radius: getComputedStyle(source).borderRadius,
    source,
    at: performance.now(),
    ttl: Number(source.dataset.shareTtl ?? TTL),
  });
}

/**
 * The source under `key` departs, as a click on it would: `source` when the
 * caller holds it (a card being dragged), else the one drawn on the page.
 */
export function departShared(key: string, source?: HTMLElement): void {
  const drawn =
    source ?? document.querySelector<HTMLElement>(`[data-share="${key}"]`);
  if (drawn) {
    depart(drawn);
  }
}

/**
 * A source that departs under a key it does not carry, the one its
 * destination names. By default it stays where it is while what it held
 * travels: the composer's field, emptied into a send, stays drawn and ready
 * for the next message while its text flies into the row it became. A source
 * that is leaving (`stays: false` — a failed send's words, sent again) is
 * hidden while they travel, so there is one object, never two. `rect` is
 * where it was last drawn, for a source already gone from the page (a row a
 * long list has just unmounted).
 */
export function departBox(
  key: string,
  source: HTMLElement,
  stays = true,
  rect: DOMRect = source.getBoundingClientRect(),
  radius: string = getComputedStyle(source).borderRadius
): void {
  departures.set(key, {
    by: "click",
    rect,
    radius,
    source,
    stays,
    at: performance.now(),
    ttl: TTL,
  });
}

/** The id every flight runs under: see `carry`. */
const FLIGHT = "share-flight";

/**
 * A flight is a path on the screen: from where the source was drawn to where
 * the destination is. Scrolling the destination's container mid-flight moves
 * the destination, and the flight — a transform off the destination's own
 * place — with it: one frame, the whole distance. A container that scrolls
 * itself (a transcript pinning its tail as rows land in it) says so here, with
 * how far its content moved on screen, and every flight under way inside it
 * is carried: put back where it was drawn and taken to the destination's new
 * place over the rest of the flight, on the flight's own curve, added to the
 * flight, which goes on as it was.
 */
export function carry(within: Element, by: number): void {
  // A flight is one or two effects (its move and its cut): each target carried once.
  const carried = new Set<Element>();
  for (const flight of within.getAnimations({ subtree: true })) {
    const effect = flight.effect as KeyframeEffect | null;
    const target = effect?.target;
    const total = Number(effect?.getComputedTiming().duration);
    const at = Number(flight.currentTime);
    if (
      flight.id !== FLIGHT ||
      flight.playState !== "running" ||
      !target ||
      carried.has(target) ||
      at >= total
    ) {
      continue;
    }
    carried.add(target);
    target.animate([{ translate: `0 ${-by}px` }, { translate: "0 0" }], {
      duration: total - at,
      easing: CURVE.drawer,
      composite: "add",
    });
  }
}

/**
 * Whether a fresh departure waits under `key`: a destination deciding how
 * to arrive (out of what was clicked, or on its own) asks before it lands.
 */
export function waiting(key: string): boolean {
  const from = departures.get(key);
  return !!from && performance.now() - from.at < from.ttl;
}

/**
 * A departure handed from one key to another. A Start is pressed before the
 * session it starts has an id, so it departs as `session:new`; once the
 * session exists, its departure becomes that session's, and only that
 * session's tab lands it — not whichever tab happens to mount first.
 */
export function handOver(from: string, to: string): void {
  const taken = departures.get(from);
  if (taken) {
    departures.delete(from);
    departures.set(to, taken);
  }
}

/** Every shared source on the page departs: a navigation is starting. */
export function departAll(): void {
  for (const source of document.querySelectorAll<HTMLElement>("[data-share]")) {
    if (source.offsetParent !== null) {
      depart(source, "navigation");
    }
  }
}

/** A click on a shared source departs it before whatever the click opens. */
if (typeof document !== "undefined") {
  document.addEventListener(
    "click",
    (event) => {
      const source = (event.target as Element | null)?.closest?.<HTMLElement>(
        "[data-share]"
      );
      if (source) {
        depart(source);
      }
    },
    { capture: true }
  );
}

export interface LandOptions {
  /** For `grow`: the part of the destination that the source is (a selector inside it). */
  anchor?: string;
  /**
   * The flight's curve, the drawer's unless the motion it shares a clock
   * with runs on another (a decision card's page-length fold on
   * `--ease-crossfade`).
   */
  easing?: string;
  /**
   * `clip` opens the destination out of the source's box instead of scaling
   * it; `grow` also moves it there first (see above); `move` only moves it,
   * from the source's inline-start top corner to its own.
   */
  mode?: "scale" | "clip" | "grow" | "move";
  ms?: number;
  /**
   * Fly in the task that mounted the destination rather than at its first
   * frame: a destination mounted beside motion started in that same task (a
   * decision card folding to the line it lands on) shares that motion's
   * start, one clock.
   */
  now?: boolean;
  /** Scale both axes by the height ratio, so text keeps its shape. */
  uniform?: boolean;
}

/**
 * Where the destination rests: its box with its own entrance (a CSS
 * animation, a dialog's rise) read at its end. The flight's transform
 * replaces the entrance's while it runs, so a box read on the entrance's
 * first frame (a dialog 6px low) started the flight that far off its source.
 */
function restingRect(node: HTMLElement): DOMRect {
  const entering = node
    .getAnimations()
    .filter(
      (animation) =>
        animation instanceof CSSAnimation &&
        Number.isFinite(Number(animation.effect?.getComputedTiming().endTime))
    );
  const was = entering.map((animation) => animation.currentTime);
  for (const animation of entering) {
    animation.currentTime = Number(
      animation.effect?.getComputedTiming().endTime
    );
  }
  const rect = node.getBoundingClientRect();
  entering.forEach((animation, at) => {
    animation.currentTime = was[at];
  });
  return rect;
}

/**
 * A move from the source's inline-start top corner to the destination's
 * (the right edges under right-to-left), translation only: the destination
 * is drawn at its own size all the way.
 */
function moveFrames(rtl: boolean, from: DOMRect, to: DOMRect): Keyframe[] {
  const dx = rtl ? from.right - to.right : from.left - to.left;
  return [
    { transform: `translate(${dx}px, ${from.top - to.top}px)` },
    { transform: "none" },
  ];
}

function fly(node: HTMLElement, from: Departure, options: LandOptions) {
  const to = restingRect(node);
  if (to.width === 0 || to.height === 0) {
    return;
  }
  const {
    mode = "scale",
    uniform = false,
    ms = dur("--duration-panel"),
    easing = CURVE.drawer,
    anchor,
  } = options;
  if (!from.stays) {
    from.source.style.visibility = "hidden";
  }
  const reveal = () => {
    if (!from.stays && from.source.isConnected) {
      from.source.style.visibility = "";
    }
  };
  // A flight is its effects on one timing: what it moves, and what cuts it,
  // never one effect that does both (house/no-clip-with-move): a tab's slide
  // over a flight that cut and moved took the renderer down.
  const effects: Keyframe[][] = [];
  if (mode === "grow") {
    // The source's box laid over the anchor, their starts and middles lined
    // up, in the destination's own coordinates.
    const part = anchor
      ? (node.querySelector(anchor) as HTMLElement).getBoundingClientRect()
      : to;
    const left = part.left - to.left;
    const top = part.top - to.top + (part.height - from.rect.height) / 2;
    const right = to.width - left - from.rect.width;
    const bottom = to.height - top - from.rect.height;
    effects.push(
      [
        {
          transform: `translate(${from.rect.left - to.left - left}px, ${from.rect.top - to.top - top}px)`,
        },
        { transform: "none" },
      ],
      [
        {
          clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px round ${from.radius})`,
        },
        {
          clipPath: `inset(0px 0px 0px 0px round ${getComputedStyle(node).borderRadius})`,
        },
      ]
    );
  } else if (mode === "move") {
    effects.push(
      moveFrames(getComputedStyle(node).direction === "rtl", from.rect, to)
    );
  } else if (mode === "clip") {
    const top = from.rect.top - to.top;
    const left = from.rect.left - to.left;
    const bottom = to.bottom - from.rect.bottom;
    const right = to.right - from.rect.right;
    effects.push([
      {
        clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px round ${from.radius})`,
        opacity: 0.6,
      },
      { clipPath: "inset(0px 0px 0px 0px round 0px)", opacity: 1 },
    ]);
  } else {
    const sy = from.rect.height / to.height;
    const sx = uniform ? sy : from.rect.width / to.width;
    effects.push([
      {
        transformOrigin: "0 0",
        transform: `translate(${from.rect.left - to.left}px, ${from.rect.top - to.top}px) scale(${sx}, ${sy})`,
      },
      { transformOrigin: "0 0", transform: "none" },
    ]);
    // Scaled by its height, a destination wider for its height than its
    // source would start out wider than the source; its inline end is cut
    // back to the source's width, so the flight starts on the source's box
    // exactly and opens to its own as it lands.
    const spare = to.width - from.rect.width / sy;
    if (uniform && spare > 0.5) {
      const rtl = getComputedStyle(node).direction === "rtl";
      const cut = rtl ? `0 0 0 ${spare}px` : `0 ${spare}px 0 0`;
      const radius = getComputedStyle(node).borderRadius;
      effects.push([
        { clipPath: `inset(${cut} round ${from.radius})` },
        { clipPath: `inset(0px 0px 0px 0px round ${radius})` },
      ]);
    }
  }
  const runs = effects.map((frames) =>
    node.animate(frames, { id: FLIGHT, duration: ms, easing })
  );
  Promise.allSettled(runs.map((run) => run.finished)).then(reveal);
}

/** Land a destination from the departure waiting under its key. */
export function land(key: () => string | undefined, options: LandOptions = {}) {
  return (node: HTMLElement) => {
    $effect(() => {
      const name = key();
      if (!name) {
        return;
      }
      const from = departures.get(name);
      // A box that moves stays itself: drawn again where it now stands, it
      // flies from where it stood (a regroup that kept its group's list).
      if (!from || (from.source === node && options.mode !== "move")) {
        return;
      }
      departures.delete(name);
      if (!motionOk.current || performance.now() - from.at > from.ttl) {
        return;
      }
      if (options.mode === "move") {
        moveLater(node, from, options);
        return;
      }
      if (options.now) {
        fly(node, from, options);
        return;
      }
      // The flight starts with the first frame that draws the destination:
      // a destination mounted during a long task (a whole page arriving) would
      // otherwise play its flight out before anything is painted, and first be
      // seen already landed. The callback runs before that frame is painted,
      // so the destination is never drawn at rest before it flies.
      requestAnimationFrame(() => {
        if (node.isConnected) {
          fly(node, from, options);
        }
      });
    });
  };
}

/**
 * The other direction: a floating surface closes into what it just made
 * (a popover's form into the row it added). The surface shrinks onto the
 * made thing's box — its full box, even while that box is still opening —
 * and fades as it goes, on the same curve as a landing; the returned
 * animation finishes when the surface is gone, so the caller closes it
 * then. With reduced motion there is no travel and nothing to wait for.
 */
export function closeInto(
  surface: HTMLElement,
  target: HTMLElement,
  ms = dur("--duration-panel"),
  easing: string = CURVE.drawer
): Animation | undefined {
  if (!motionOk.current) {
    return;
  }
  const from = surface.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  if (from.width === 0 || from.height === 0 || to.width === 0) {
    return;
  }
  const height = Math.max(to.height, target.scrollHeight);
  return surface.animate(
    [
      { transformOrigin: "0 0", transform: "none", opacity: 1 },
      {
        transformOrigin: "0 0",
        transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width}, ${height / from.height})`,
        opacity: 0,
      },
    ],
    { duration: ms, easing, fill: "forwards" }
  );
}

/* ── Moves, in one batch a frame ───────────────────────────────────── */

interface Move {
  from: Departure;
  node: HTMLElement;
  options: LandOptions;
}

/** The moves waiting for the next frame. */
let moves: Move[] = [];
/** Called once a batch's flights have all landed. */
let landed: (() => void)[] = [];

/**
 * Starts a move with the next frame, beside every other one that frame:
 * every destination is read first, then every flight started, so a regroup
 * of forty rows lays the rail out once rather than once a row.
 */
function moveLater(node: HTMLElement, from: Departure, options: LandOptions) {
  if (moves.length === 0) {
    requestAnimationFrame(flyMoves);
  }
  moves.push({ node, from, options });
}

/** The box a node scrolls in: its nearest ancestor that scrolls, else the window. */
function scrollBoxOf(node: HTMLElement, known: Map<Element, DOMRect>): DOMRect {
  for (let at = node.parentElement; at; at = at.parentElement) {
    const held = known.get(at);
    if (held) {
      return held;
    }
    const { overflowY } = getComputedStyle(at);
    if (overflowY === "auto" || overflowY === "scroll") {
      const rect = at.getBoundingClientRect();
      known.set(at, rect);
      return rect;
    }
  }
  return new DOMRect(0, 0, innerWidth, innerHeight);
}

const meets = (a: DOMRect, b: DOMRect): boolean =>
  a.bottom > b.top && a.top < b.bottom && a.right > b.left && a.left < b.right;

function flyMoves(): void {
  const batch = moves.filter(({ node }) => node.isConnected);
  moves = [];
  const done = landed;
  landed = [];
  // Every read first.
  const boxes = new Map<Element, DOMRect>();
  const reads = batch.map((move) => ({
    ...move,
    to: move.node.getBoundingClientRect(),
    box: scrollBoxOf(move.node, boxes),
    rtl: getComputedStyle(move.node).direction === "rtl",
  }));
  // The list's own travel (motion/rows `travel`): a regroup moves rows as
  // a reflow would.
  const timing = { duration: dur("--duration-panel"), easing: CURVE.inOut };
  // Then every flight. One whose old and new places are both out of its
  // box's sight lands with no flight: nobody sees it travel.
  const flights: Promise<unknown>[] = [];
  for (const { node, from, options, to, box, rtl } of reads) {
    if (to.width === 0 || to.height === 0) {
      continue;
    }
    if (!(meets(from.rect, box) || meets(to, box))) {
      continue;
    }
    // Where it stood: nothing to travel.
    if (
      Math.abs(from.rect.top - to.top) < 0.5 &&
      Math.abs(from.rect.left - to.left) < 0.5 &&
      Math.abs(from.rect.right - to.right) < 0.5
    ) {
      continue;
    }
    const run = node.animate(moveFrames(rtl, from.rect, to), {
      id: FLIGHT,
      duration: options.ms ?? timing.duration,
      easing: options.easing ?? timing.easing,
    });
    flights.push(run.finished);
  }
  Promise.allSettled(flights).then(() => {
    for (const settle of done) {
      settle();
    }
  });
}

/* ── A regroup ─────────────────────────────────────────────────────── */

/** Bumped by every regroup, so a box that stays mounted lands again. */
let generation = $state(0);

/** Where a regroup's boxes stood, and the root they stand in. */
interface Boxes {
  base: DOMRect;
  boxes: { box: HTMLElement; key: string; rect: DOMRect }[];
  scrolled: number;
}

/**
 * Every `[data-regroup]` box under `root` where it is drawn, the root's own
 * box and its scroll: what a regroup departs from. Read where the layout
 * is the last frame's (`regroupPrimer`), it costs nothing; read in the
 * press that regroups, it laid out and restyled the page the press had just
 * changed (a menu item ticked): 60 to 412ms of forced style at 4x.
 */
function boxesIn(root: HTMLElement): Boxes {
  const boxes: Boxes["boxes"] = [];
  for (const box of root.querySelectorAll<HTMLElement>("[data-regroup]")) {
    const key = box.dataset.regroup;
    if (key) {
      boxes.push({ box, key, rect: box.getBoundingClientRect() });
    }
  }
  return {
    base: root.getBoundingClientRect(),
    scrolled: root.scrollTop,
    boxes,
  };
}

/** The boxes read on the last frame's layout, for the root they were read in, while they stand. */
let ready: (Boxes & { root: HTMLElement }) | null = null;

/** Boxes read for `root` that still stand where they were read, taken. */
function readyBoxes(root: HTMLElement): Boxes | null {
  const read = ready;
  ready = null;
  return read?.root === root ? read : null;
}

/**
 * While a regrouping menu is open (GroupMenu `onopenchange`): the boxes of
 * the list it regroups are read inside a frame's size delivery
 * (frameObserver `readNext`), on the layout that frame has just done, and
 * read again whenever anything under the root comes, goes or moves, the
 * root scrolls, or a regroup lands. A press then regroups from them,
 * reading nothing. Closed, nothing is read.
 */
export function regroupPrimer(
  rootOf: () => HTMLElement | null
): (open: boolean) => void {
  let stop: (() => void) | null = null;
  return (open) => {
    stop?.();
    stop = null;
    const root = rootOf();
    if (!(open && root)) {
      ready = null;
      return;
    }
    const reader = frameObserver(() => undefined, {
      read: () => {
        ready = root.isConnected ? { root, ...boxesIn(root) } : null;
      },
    });
    const again = () => {
      ready = null;
      reader.readNext();
    };
    const moved = new MutationObserver(again);
    moved.observe(root, { childList: true, subtree: true });
    root.addEventListener("scroll", again, { passive: true });
    window.addEventListener("resize", again);
    landedHooks.add(again);
    again();
    stop = () => {
      reader.disconnect();
      moved.disconnect();
      root.removeEventListener("scroll", again);
      window.removeEventListener("resize", again);
      landedHooks.delete(again);
    };
  };
}

/** What reads again once a regroup's flights have landed (`regroupPrimer`). */
const landedHooks = new Set<() => void>();

/** A regroup's own update is under way: what it mounts and unmounts simply comes and goes. */
let regroupingNow = false;

/**
 * Whether the update under way is a regroup's: a tree's fold (motion/branch)
 * never plays for the rows a regroup brings or takes away, which fade or
 * move here instead.
 */
export const regrouping = (): boolean => regroupingNow;

/** A group parent's own box: a copy fades out where one went. */
const PARENT = "[data-regroup-parent]";

/**
 * A regroup under `root`: every `[data-regroup]` box departs under its own
 * key, every `reflow` container around it or around another list of
 * `[data-regroup]` boxes is handed the change (none of its rows' coming and
 * going is a change for it to draw), and `change` regroups.
 * Then a group parent that went fades out where it stood, one that is new
 * fades in where it stands, and once the flights have landed `settled`
 * runs. A tree keeps its rows as one flat list (tree-lines.ts), so a row
 * that changes group is the same node, moved: its lines are its own and
 * stand at its new place from the first frame, and only its box flies.
 */
export function regroup(
  root: HTMLElement,
  change: () => void,
  settled?: () => void
): void {
  const before = new Set<string>();
  const parents: { key: string; copy: HTMLElement; rect: DOMRect }[] = [];
  // Where every box stands, and the root: read on the last frame's layout
  // while the menu that regroups is open (`regroupPrimer`), or here.
  const { base, scrolled, boxes } = readyBoxes(root) ?? boxesIn(root);
  for (const { box, key, rect } of boxes) {
    before.add(key);
    // Moved only (`landRegroup`): its corner's radius is never read.
    departBox(key, box, true, rect, "");
    if (box.matches(PARENT) && motionOk.current) {
      parents.push({ key, copy: box.cloneNode(true) as HTMLElement, rect });
    }
  }
  // Every list a grouping draws regroups with it (the rail's Recent and the
  // home board's read one grouping): each `reflow` around any of them is
  // handed the change. Handed only the one around `root`, the home's list
  // took the rail's regroup for rows leaving and arriving, and drew forty
  // closing copies and thirty slides under it in the click's frame.
  const lists = new Set<HTMLElement>(reflowsFrom(root));
  for (const container of document.querySelectorAll<HTMLElement>(
    "[data-reflow]"
  )) {
    if (container.querySelector("[data-regroup]")) {
      lists.add(container);
    }
  }
  for (const container of lists) {
    restReflow(container);
  }
  generation += 1;
  regroupingNow = true;
  change();
  tick().then(() => {
    regroupingNow = false;
    const now = new Set<string>();
    const fadeIn = {
      duration: dur("--duration-panel"),
      easing: ease("--ease-out"),
    };
    const fadeOut = {
      duration: dur("--duration-exit"),
      easing: ease("--ease-out"),
      fill: "forwards" as const,
    };
    for (const box of root.querySelectorAll<HTMLElement>("[data-regroup]")) {
      const key = box.dataset.regroup;
      if (!key) {
        continue;
      }
      now.add(key);
      // New here: it fades in where it stands, on the flights' clock.
      if (!before.has(key) && motionOk.current) {
        box.animate([{ opacity: 0 }, { opacity: 1 }], fadeIn);
      }
    }
    for (const { key, copy, rect } of parents) {
      if (now.has(key)) {
        continue;
      }
      // Gone: a copy of it fades out where it stood, over what is there now.
      copy.removeAttribute("data-regroup");
      copy.setAttribute("aria-hidden", "true");
      copy.inert = true;
      Object.assign(copy.style, {
        position: "absolute",
        insetInlineStart: "auto",
        left: `${rect.left - base.left}px`,
        top: `${rect.top - base.top + scrolled}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        margin: "0",
        pointerEvents: "none",
      });
      root.append(copy);
      copy
        .animate([{ opacity: 1 }, { opacity: 0 }], fadeOut)
        .finished.finally(() => copy.remove());
    }
    const done = () => {
      settled?.();
      for (const hook of landedHooks) {
        hook();
      }
    };
    if (moves.length > 0) {
      landed.push(done);
    } else {
      done();
    }
  });
}

/**
 * Lands a regroup's box (`data-regroup={key}`) where it is drawn now, from
 * where it stood: moved only, its own size from the first frame.
 */
export const landRegroup = (key: () => string) =>
  land(
    // `generation` is read, so a box that stays mounted lands again after
    // each regroup; it is never below 0.
    () => (generation >= 0 ? key() : undefined),
    { mode: "move" }
  );
