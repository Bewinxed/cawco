/**
 * The whole set's layout (spec, The whole set): every state of every
 * machine, each machine a box holding its states, the moves drawn between
 * them by Svelte Flow. Each state's card is `c-graph-node-w` wide and as tall as what it holds is
 * estimated to be; the view draws them at 1:1, so nothing is scaled.
 */
import { numberOf } from "#lib/cawco/motion/curves.svelte.js";
import type { Review } from "./model";

interface Placed {
  h: number;
  w: number;
  x: number;
  y: number;
}

export interface Layout {
  /** The whole drawing. */
  bounds: Placed;
  /** Each machine's box, its title in its head. */
  machines: Record<string, Placed>;
  /** Each state's card, from its machine's box. */
  states: Record<string, Placed>;
}

/** A machine's head: its title's line and the gap under it. */
const MACHINE_HEAD = 36;
const PAD = 14;
/** A card's lines: its pad, its name, a note's two lines, a mark's line, a variants row. */
const LINE = { pad: 18, name: 18, note: 32, marks: 20, variants: 34 } as const;
/** Variant chips a row of a card holds. */
const CHIPS_A_ROW = 2;

/** A state's card's height, from what it holds. */
function heightOf(
  review: Review,
  id: string,
  marked: boolean,
  measured: Record<string, number>
): number {
  const drawn = measured[id];
  if (drawn) {
    return drawn;
  }
  const state = review.states[id];
  if (!state) {
    return 0;
  }
  const rows = Math.ceil(state.variants.length / CHIPS_A_ROW);
  return (
    LINE.pad +
    LINE.name +
    (state.note ? LINE.note : 0) +
    (marked ? LINE.marks : 0) +
    (state.variants.length > 1 ? rows * LINE.variants : 0)
  );
}

/** The gap between two cards of a machine, and between two machines' boxes. */
const GAP = 25;
const BETWEEN = 32;

/**
 * Each machine a column of its states in its path's order (the journey's
 * order, read down), the columns side by side in the file's order, a new
 * line of them where the room's width runs out (`wrap`, none: one line
 * that scrolls sideways). Every card stands whole at 1:1, so a room as
 * narrow as one card holds the set in one column, and a wide one fills
 * with columns, nothing cut at its edge.
 */
export function layoutOf(
  review: Review,
  marked: (state: string) => boolean,
  /** Each card's height as drawn, once it has been: the estimate stands in until then. */
  measured: Record<string, number>,
  wrap: number | null
): Layout {
  const width = numberOf("--c-graph-node-w") || 208;
  const states: Record<string, Placed> = {};
  const machines: Record<string, Placed> = {};
  let x = 0;
  let y = 0;
  let line = 0;
  for (const machine of review.machines) {
    const w = width + 2 * PAD;
    if (wrap !== null && x > 0 && x + w > wrap) {
      x = 0;
      y += line + BETWEEN;
      line = 0;
    }
    let at = y + MACHINE_HEAD + PAD;
    for (const id of machine.path) {
      const h = heightOf(review, id, marked(id), measured);
      states[id] = { x: x + PAD, y: at, w: width, h };
      at += h + GAP;
    }
    const h = at - GAP + PAD - y;
    machines[machine.name] = { x, y, w, h };
    line = Math.max(line, h);
    x += w + BETWEEN;
  }
  const all = Object.values(machines);
  return {
    machines,
    states,
    bounds: {
      x: 0,
      y: 0,
      w: Math.max(0, ...all.map((b) => b.x + b.w)),
      h: Math.max(0, ...all.map((b) => b.y + b.h)),
    },
  };
}
