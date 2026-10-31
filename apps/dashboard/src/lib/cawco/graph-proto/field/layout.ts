/**
 * The field laid out by dagre (@dagrejs/dagre, compound): every state a
 * box at its drawn size (the kept one at the live card's size), each group
 * a cluster round its states, every move and link an edge, left to right.
 * The kept card grows where it stands, so its neighbours make room for it
 * and the field reflows on each keep.
 */
import dagre from "@dagrejs/dagre";

export interface Box {
  h: number;
  w: number;
  x: number;
  y: number;
}

export function laidField(
  states: { group: string; h: number; id: string; w: number }[],
  edges: { from: string; to: string }[],
  gaps: { node: number; rank: number; margin: number; pad: number }
): { groups: Map<string, Box>; states: Map<string, Box> } {
  const graph = new dagre.graphlib.Graph({ compound: true, multigraph: false });
  graph.setGraph({
    rankdir: "LR",
    nodesep: gaps.node,
    ranksep: gaps.rank,
    marginx: gaps.margin,
    marginy: gaps.margin,
  });
  graph.setDefaultEdgeLabel(() => ({}));
  const groups = new Set(states.map((one) => one.group));
  for (const group of groups) {
    graph.setNode(`g:${group}`, { label: group });
  }
  for (const one of states) {
    graph.setNode(one.id, { width: one.w, height: one.h });
    graph.setParent(one.id, `g:${one.group}`);
  }
  for (const edge of edges) {
    graph.setEdge(edge.from, edge.to);
  }
  dagre.layout(graph);
  const boxOf = (id: string): Box => {
    const node = graph.node(id) as {
      height: number;
      width: number;
      x: number;
      y: number;
    };
    return {
      x: node.x - node.width / 2,
      y: node.y - node.height / 2,
      w: node.width,
      h: node.height,
    };
  };
  const placed = new Map(states.map((one) => [one.id, boxOf(one.id)]));
  // Each region hugs its own states (dagre's cluster box carries its border ranks' room).
  const regionOf = (group: string): Box => {
    const mine = states
      .filter((one) => one.group === group)
      .map((one) => placed.get(one.id) as Box);
    const x = Math.min(...mine.map((one) => one.x)) - gaps.pad;
    const y = Math.min(...mine.map((one) => one.y)) - gaps.pad;
    const right = Math.max(...mine.map((one) => one.x + one.w)) + gaps.pad;
    const foot = Math.max(...mine.map((one) => one.y + one.h)) + gaps.pad;
    return { x, y, w: right - x, h: foot - y };
  };
  return {
    states: placed,
    groups: new Map([...groups].map((group) => [group, regionOf(group)])),
  };
}
