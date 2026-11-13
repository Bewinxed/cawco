/**
 * The whole set's layout (spec, The whole set): every state of every
 * machine as a card, each machine a group round its cards, the moves
 * between them read down, each move an arrow routed round the cards with
 * its act's label where no card stands. Layout is dagre's (@dagrejs/dagre, as the
 * project's Canvas lays its tasks out, views/task-graph.ts), as a compound
 * graph: each machine a cluster, so its cards stand together and no other
 * machine's card stands inside it, and the moves rank the cards top to
 * bottom; a machine's path in the file's order ranks them too, where no
 * move joins two of its states. Each card is placed from its measured box,
 * and each group is sized from its cards as placed, its head above them.
 * No coordinate is stored or set by hand.
 */
import dagre, {
  type Graph as DagreGraph,
  type EdgeLabel,
  type GraphLabel,
  type NodeLabel,
} from "@dagrejs/dagre";
import { numberOf } from "#lib/platform/motion/curves.svelte.js";
import type { Review } from "./model";

interface Box {
  h: number;
  w: number;
  x: number;
  y: number;
}

/** A move's arrow as dagre routes it: round the cards, its act's label placed where no card stands. */
interface Route {
  from: string;
  /** Where its label's centre stands, when it has one. */
  label: { x: number; y: number } | null;
  points: { x: number; y: number }[];
  to: string;
}

export interface WholeLayout {
  /** Each machine's group, its head inside its top. */
  machines: Record<string, Box>;
  /** Each move's arrow, by `from->to`. */
  routes: Record<string, Route>;
  /** Each state's card, by its id. */
  states: Record<string, Box>;
}

/** A group's own room: round its cards, and its head over them. */
interface GroupRoom {
  head: number;
  pad: number;
}

type Size = (key: string) => { height: number; width: number };
/** The graph dagre lays out: its nodes' and edges' labels as dagre fills them. */
type Graph = DagreGraph<GraphLabel, NodeLabel, EdgeLabel>;

/** The compound graph dagre lays out: each machine a cluster round its cards, every move an edge with room for its act. */
function graphOf(
  review: Review,
  size: Size,
  room: GroupRoom,
  labelSize: Size
): Graph {
  const graph: Graph = new dagre.graphlib.Graph({ compound: true });
  graph.setGraph({
    rankdir: "TB",
    // Between two groups: each one's pad, and the gap between them.
    nodesep: numberOf("--spacing-space-6") + 2 * room.pad,
    // Between two ranks: room for a group's pad and head under the rank above.
    ranksep: numberOf("--spacing-space-6") + 2 * room.pad + room.head,
    marginx: 0,
    marginy: 0,
  });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const machine of review.machines) {
    const cluster = `machine:${machine.name}`;
    graph.setNode(cluster, { width: 0, height: 0 });
    for (const id of machine.path) {
      graph.setNode(id, size(id));
      graph.setParent(id, cluster);
    }
  }
  // Every move, those between machines too; an act's label is laid out
  // as dagre lays a node, so no card or other label stands on it.
  for (const move of review.moves) {
    if (
      move.from !== move.to &&
      graph.hasNode(move.from) &&
      graph.hasNode(move.to)
    ) {
      graph.setEdge(move.from, move.to, {
        weight: 2,
        minlen: 1,
        ...(move.label ? { ...labelSize(move.label), labelpos: "c" } : {}),
      });
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
  return graph;
}

/** Each machine's group round its cards as placed, its head above them. */
function groupsOf(
  review: Review,
  states: Record<string, Box>,
  room: GroupRoom
): Record<string, Box> {
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
  return machines;
}

/** Each move's route as dagre laid it, and where its act's label stands. */
function routesOf(review: Review, graph: Graph): Record<string, Route> {
  const routes: Record<string, Route> = {};
  for (const move of review.moves) {
    const edge = graph.hasEdge(move.from, move.to)
      ? graph.edge(move.from, move.to)
      : null;
    const points: { x: number; y: number }[] = edge?.points ?? [];
    if (!edge || points.length === 0 || move.from === move.to) {
      continue;
    }
    routes[`${move.from}->${move.to}`] = {
      from: move.from,
      to: move.to,
      points: points.map((point) => ({ x: point.x, y: point.y })),
      label:
        move.label && edge.x !== undefined && edge.y !== undefined
          ? { x: edge.x, y: edge.y }
          : null,
    };
  }
  return routes;
}

/**
 * Every card placed, every group round its cards, every move routed.
 * `size` is a card's box (measured once it has been drawn), `labelSize` an
 * act's label's.
 */
export function layoutWhole(
  review: Review,
  size: Size,
  room: GroupRoom,
  labelSize: Size
): WholeLayout {
  const graph = graphOf(review, size, room, labelSize);
  dagre.layout(graph);
  const states: Record<string, Box> = {};
  for (const id of review.order) {
    const node = graph.node(id);
    // dagre places every node it lays out: x and y are set once `layout` returns.
    if (node.x !== undefined && node.y !== undefined) {
      states[id] = {
        x: Math.round(node.x - node.width / 2),
        y: Math.round(node.y - node.height / 2),
        w: node.width,
        h: node.height,
      };
    }
  }
  return {
    machines: groupsOf(review, states, room),
    routes: routesOf(review, graph),
    states,
  };
}
