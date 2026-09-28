/**
 * Route motion: which way a navigation moves, and the Svelte transitions
 * that move the outgoing and incoming page. The Shell's content slot keys
 * its page on the route and Configure keys its pane on the section; both
 * stack the two pages in one grid cell while they overlap, and both read
 * the plan `onNavigate` (routes/+layout.svelte) writes here before the DOM
 * changes.
 *
 * Distances are percentages of the page's own box, so a phone and a desk
 * travel the same share of the screen.
 */
import { easeDrawer, motionOk } from "./curves.svelte";

interface End {
  opacity: number;
  x: number;
  y: number;
}

export interface Travel {
  /** Where the incoming page starts from. */
  enter: End;
  /** Where the outgoing page ends up. */
  leave: End;
  /** A pop keeps the page being taken off on top of the one it uncovers. */
  leavingOnTop: boolean;
  ms: number;
}

const nudge = (x: number, y: number, ms = 120): Travel => ({
  leave: { x: -x, y: -y, opacity: 0 },
  enter: { x, y, opacity: 0 },
  ms,
  leavingOnTop: false,
});

/** The sidebar's spokes, top to bottom: a move between two slides that way. */
const SPOKE_ORDER = ["session", "workflows", "usage", "config"];

const spokeIndex = (pathname: string) =>
  SPOKE_ORDER.indexOf(pathname.split("/").find(Boolean) ?? "session");

/** How many segments a path runs: `/config` is 1, an editor under it 3. */
const depth = (pathname: string) => pathname.split("/").filter(Boolean).length;

const CONFIG = /^\/config(\/|$)/;

export interface Plan {
  from: string;
  /** The browser's own back (-1) or forward (1); 0 for a link. */
  history: number;
  narrow: boolean;
  rtl: boolean;
  /** Configure's sections, in the rail's order. */
  sections: readonly string[];
  to: string;
}

/**
 * - Between two sidebar spokes: vertical, ±8%, the way the sidebar runs.
 * - Configure on a phone is a stack: a deeper page pushes in from the inline
 *   end over the one it leaves, which falls back 30% and dims to 0.6
 *   (280ms); back pops it off the same way, on a shorter 240ms.
 * - Between two Configure sections on a wide screen: the section rises or
 *   drops in 4% the way the rail runs (150ms) while the rail holds still.
 * - Anything else deeper or shallower: a horizontal ±8% nudge (120ms).
 * Browser back and forward go by the history step, not the path.
 */
export function plan({
  from,
  to,
  history,
  rtl,
  narrow,
  sections,
}: Plan): Travel {
  const fromSpoke = spokeIndex(from);
  const toSpoke = spokeIndex(to);
  if (fromSpoke >= 0 && toSpoke >= 0 && fromSpoke !== toSpoke) {
    return nudge(0, toSpoke > fromSpoke ? 8 : -8);
  }
  const side = rtl ? -1 : 1;
  const step = history || Math.sign(depth(to) - depth(from));
  const inConfig =
    CONFIG.test(from) && CONFIG.test(to)
      ? configTravel(from, to, step, side, narrow, sections)
      : null;
  return inConfig ?? nudge(step < 0 ? -8 * side : 8 * side, 0);
}

/** Configure's own moves: a phone's stack, and a wide section change. */
function configTravel(
  from: string,
  to: string,
  step: number,
  side: number,
  narrow: boolean,
  sections: readonly string[]
): Travel | null {
  if (narrow && step > 0) {
    return {
      leave: { x: -30 * side, y: 0, opacity: 0.6 },
      enter: { x: 100 * side, y: 0, opacity: 1 },
      ms: 280,
      leavingOnTop: false,
    };
  }
  if (narrow && step < 0) {
    return {
      leave: { x: 100 * side, y: 0, opacity: 1 },
      enter: { x: -30 * side, y: 0, opacity: 0.6 },
      ms: 240,
      leavingOnTop: true,
    };
  }
  if (narrow || depth(from) !== 2 || depth(to) !== 2) {
    return null;
  }
  const section = (path: string) => sections.indexOf(path.split("/")[2] ?? "");
  return {
    leave: { x: 0, y: 0, opacity: 0 },
    enter: { x: 0, y: section(to) > section(from) ? 4 : -4, opacity: 0 },
    ms: 150,
    leavingOnTop: false,
  };
}

/**
 * The plan for the navigation in flight, and the last page shown outside a
 * project home (the spoke a project was opened from, where forgetting the
 * project goes back to); `onNavigate` writes both.
 */
export const route = $state<{ spoke: string; travel: Travel }>({
  spoke: "/session",
  travel: nudge(8, 0),
});

const PROJECT = /^\/project(\/|$)/;

/** Remember where a navigation leaves from, unless it is a project home. */
export function leaving(from: URL): void {
  if (!PROJECT.test(from.pathname)) {
    route.spoke = `${from.pathname}${from.search}`;
  }
}

/** Reduced motion: a 120ms cross-fade in place, nothing travels. */
const STILL: End = { x: 0, y: 0, opacity: 0 };
const STILL_MS = 120;

export function pageOut(node: HTMLElement) {
  const { leave, ms, leavingOnTop } = route.travel;
  const to = motionOk.current ? leave : STILL;
  // The page going away takes no input and, on a pop, stays on top.
  node.inert = true;
  if (leavingOnTop) {
    node.style.zIndex = "1";
  }
  return {
    duration: motionOk.current ? ms : STILL_MS,
    easing: easeDrawer,
    css: (_t: number, u: number) =>
      `transform: translate(${to.x * u}%, ${to.y * u}%); opacity: ${1 - (1 - to.opacity) * u}`,
  };
}

export function pageIn(_node: HTMLElement) {
  const { enter, ms } = route.travel;
  const from = motionOk.current ? enter : STILL;
  return {
    duration: motionOk.current ? ms : STILL_MS,
    easing: easeDrawer,
    css: (t: number, u: number) =>
      `transform: translate(${from.x * u}%, ${from.y * u}%); opacity: ${from.opacity + (1 - from.opacity) * t}`,
  };
}
