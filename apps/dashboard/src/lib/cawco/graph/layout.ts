/**
 * The whole set's layout (spec, The whole set): every state of every
 * machine, each machine a box holding its states laid out by dagre
 * (@dagrejs/dagre, MIT) along its own moves, the boxes in the file's
 * order. Down the room where it is tall and narrow, across where it is
 * wide. Each
 * state's card is `c-graph-node-w` wide and as tall as what it holds is
 * estimated to be; the view draws them at 1:1, so nothing is scaled.
 */
import dagre from "@dagrejs/dagre";
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

/** The box round `boxes`, its head above them. */
function around(boxes: Placed[]): Placed {
  const left = Math.min(...boxes.map((b) => b.x)) - PAD;
  const top = Math.min(...boxes.map((b) => b.y)) - PAD - MACHINE_HEAD;
  const right = Math.max(...boxes.map((b) => b.x + b.w)) + PAD;
  const bottom = Math.max(...boxes.map((b) => b.y + b.h)) + PAD;
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** Where each state of one machine stands, from the machine's own top-left, by dagre along the machine's own moves. */
function machineLayout(
  review: Review,
  path: readonly string[],
  direction: "down" | "across",
  marked: (state: string) => boolean,
  measured: Record<string, number>
): Record<string, Placed> {
  const width = numberOf("--c-graph-node-w") || 208;
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: direction === "down" ? "TB" : "LR",
    nodesep: 18,
    ranksep: 48,
    marginx: 0,
    marginy: 0,
  });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const id of path) {
    graph.setNode(id, {
      width,
      height: heightOf(review, id, marked(id), measured),
    });
  }
  for (const move of review.moves) {
    if (path.includes(move.from) && path.includes(move.to)) {
      graph.setEdge(move.from, move.to);
    }
  }
  dagre.layout(graph);
  const placed: Record<string, Placed> = {};
  for (const id of path) {
    const node = graph.node(id) as {
      height: number;
      width: number;
      x: number;
      y: number;
    };
    placed[id] = {
      x: node.x - node.width / 2,
      y: node.y - node.height / 2,
      w: node.width,
      h: node.height,
    };
  }
  return placed;
}

/** The gap between two machines' boxes. */
const BETWEEN = 32;

/**
 * Each machine laid out on its own, then the machines one under another
 * (down) or side by side (across) in the file's order, so no two boxes
 * meet and every state's name stands clear; the moves between machines
 * are drawn across the gaps.
 */
export function layoutOf(
  review: Review,
  direction: "down" | "across",
  marked: (state: string) => boolean,
  /** Each card's height as drawn, once it has been: the estimate stands in until then. */
  measured: Record<string, number> = {}
): Layout {
  const states: Record<string, Placed> = {};
  const machines: Record<string, Placed> = {};
  let along = 0;
  for (const machine of review.machines) {
    const own = machineLayout(
      review,
      machine.path,
      direction,
      marked,
      measured
    );
    const box = around(Object.values(own));
    // From the box's corner: its states inside its pad, under its head.
    const dx = (direction === "across" ? along : 0) - box.x;
    const dy = (direction === "down" ? along : 0) - box.y;
    for (const [id, placed] of Object.entries(own)) {
      states[id] = { ...placed, x: placed.x + dx, y: placed.y + dy };
    }
    machines[machine.name] = { ...box, x: box.x + dx, y: box.y + dy };
    along += (direction === "down" ? box.h : box.w) + BETWEEN;
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
