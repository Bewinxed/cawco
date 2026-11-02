/**
 * The whole set's layout (spec, The whole set): every state of every
 * machine as a card, each machine a group round its cards, the moves
 * between them read down. Layout is dagre's (@dagrejs/dagre, as the
 * project's Canvas lays its tasks out, views/task-graph.ts), as a compound
 * graph: each machine a cluster, so its cards stand together and no other
 * machine's card stands inside it, and the moves rank the cards top to
 * bottom; a machine's path in the file's order ranks them too, where no
 * move joins two of its states. Each card is placed from its measured box,
 * and each group is sized from its cards as placed, its head above them.
 * No coordinate is stored or set by hand.
 */
import dagre from "@dagrejs/dagre";
import { numberOf } from "#lib/cawco/motion/curves.svelte.js";
import type { Review } from "./model";

interface Box {
  h: number;
  w: number;
  x: number;
  y: number;
}

export interface WholeLayout {
  /** Each machine's group, its head inside its top. */
  machines: Record<string, Box>;
  /** Each state's card, by its id. */
  states: Record<string, Box>;
}

/** A group's own room: round its cards, and its head over them. */
interface GroupRoom {
  head: number;
  pad: number;
}

/**
 * Every card placed, every group round its cards. `size` is a card's box
 * (measured once it has been drawn).
 */
export function layoutWhole(
  review: Review,
  size: (id: string) => { height: number; width: number },
  room: GroupRoom
): WholeLayout {
  const graph = new dagre.graphlib.Graph({ compound: true });
  graph.setGraph({
    rankdir: "TB",
    // Between two groups: each one's pad, and the gap between them.
    nodesep: numberOf("--space-6") + 2 * room.pad,
    // Between two ranks: room for a group's pad and head under the rank above.
    ranksep: numberOf("--space-6") + 2 * room.pad + room.head,
    marginx: 0,
    marginy: 0,
  });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const machine of review.machines) {
    const cluster = `machine:${machine.name}`;
    graph.setNode(cluster, {});
    for (const id of machine.path) {
      graph.setNode(id, size(id));
      graph.setParent(id, cluster);
    }
  }
  for (const move of review.moves) {
    if (
      move.from !== move.to &&
      graph.hasNode(move.from) &&
      graph.hasNode(move.to)
    ) {
      graph.setEdge(move.from, move.to, { weight: 2, minlen: 1 });
    }
  }
  for (const machine of review.machines) {
    for (const [at, id] of machine.path.entries()) {
      const next = machine.path[at + 1];
      if (next && !graph.hasEdge(id, next) && !graph.hasEdge(next, id)) {
        graph.setEdge(id, next, { weight: 1, minlen: 1 });
      }
    }
  }
  dagre.layout(graph);

  const states: Record<string, Box> = {};
  for (const id of review.order) {
    const node = graph.node(id);
    if (node) {
      states[id] = {
        x: Math.round(node.x - node.width / 2),
        y: Math.round(node.y - node.height / 2),
        w: node.width,
        h: node.height,
      };
    }
  }
  const machines: Record<string, Box> = {};
  for (const machine of review.machines) {
    const cards = machine.path
      .map((id) => states[id])
      .filter((box) => box !== undefined);
    if (cards.length === 0) {
      continue;
    }
    const left = Math.min(...cards.map((box) => box.x));
    const top = Math.min(...cards.map((box) => box.y));
    const right = Math.max(...cards.map((box) => box.x + box.w));
    const bottom = Math.max(...cards.map((box) => box.y + box.h));
    machines[machine.name] = {
      x: left - room.pad,
      y: top - room.pad - room.head,
      w: right - left + 2 * room.pad,
      h: bottom - top + 2 * room.pad + room.head,
    };
  }
  return { machines, states };
}
