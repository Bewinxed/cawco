/**
 * The design graph laid out by dagre (@dagrejs/dagre, MIT), from the moves
 * alone (pin 3: "who decides vertical or horizontal"): each machine's
 * states inside its region, left to right or top to bottom, whichever fits
 * the room and stands shorter; then the regions, led one into another by
 * the links between them, and stacked top to bottom in their order where
 * they don't fit side by side. Sizes are the drawn ones, measured before
 * this runs, so nothing is guessed.
 */
import dagre from "@dagrejs/dagre";

export interface Sized {
  h: number;
  id: string;
  w: number;
}

export interface Point {
  x: number;
  y: number;
}

/** One laid out graph: each box's top-left, each edge's points, the whole's size. */
export interface Laid {
  boxes: Map<string, Point>;
  edges: { from: string; points: Point[]; to: string }[];
  h: number;
  w: number;
}

/** The gaps between states, ranks and edges, as the mockup's round 28 drew them. */
const GAPS = { nodesep: 22, ranksep: 46, edgesep: 12 };

function laid(
  items: Sized[],
  edges: [string, string][],
  rankdir: "LR" | "TB",
  margin: number,
  extra: Partial<typeof GAPS> = {},
  hidden: [string, string][] = []
): Laid {
  const graph = new dagre.graphlib.Graph({ multigraph: false });
  graph.setGraph({
    rankdir,
    ...GAPS,
    ...extra,
    marginx: margin,
    marginy: margin,
    align: "UL",
  });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const item of items) {
    graph.setNode(item.id, { width: item.w, height: item.h });
  }
  const known = new Set(items.map((one) => one.id));
  for (const [from, to] of edges) {
    if (known.has(from) && known.has(to)) {
      graph.setEdge(from, to);
    }
  }
  for (const [from, to] of hidden) {
    if (known.has(from) && known.has(to) && !graph.hasEdge(from, to)) {
      graph.setEdge(from, to, { hidden: true });
    }
  }
  dagre.layout(graph);
  const boxes = new Map<string, Point>();
  for (const id of graph.nodes()) {
    const node = graph.node(id);
    boxes.set(id, { x: node.x - node.width / 2, y: node.y - node.height / 2 });
  }
  const drawn = graph
    .edges()
    .filter((one) => !(graph.edge(one) as { hidden?: boolean }).hidden)
    .map((one) => ({
      from: one.v,
      to: one.w,
      points: (graph.edge(one).points ?? []).map((p: Point) => ({
        x: p.x,
        y: p.y,
      })),
    }));
  const size = graph.graph();
  return { boxes, edges: drawn, w: size.width ?? 0, h: size.height ?? 0 };
}

/** Left to right or top to bottom: the one that fits `room`, the shorter where both do, else the narrower. */
export function fitted(
  items: Sized[],
  edges: [string, string][],
  room: number,
  margin = 0
): Laid {
  const across = laid(items, edges, "LR", margin);
  const down = laid(items, edges, "TB", margin);
  const fits = (one: Laid) => one.w <= room;
  if (fits(across) && fits(down)) {
    return across.h <= down.h ? across : down;
  }
  if (fits(across)) {
    return across;
  }
  if (fits(down)) {
    return down;
  }
  return across.w <= down.w ? across : down;
}

/**
 * The regions laid out: led by the links between them where that fits
 * `room`; else one under another in their order, the links still drawn
 * (each order step a hidden edge, so dagre keeps the order).
 */
export function regions(
  items: Sized[],
  between: [string, string][],
  room: number,
  margin: number
): Laid {
  const led = fitted(items, between, room, margin);
  if (led.w <= room) {
    return led;
  }
  const order: [string, string][] = items
    .slice(1)
    .map((one, at) => [items[at]?.id ?? "", one.id]);
  return laid(
    items,
    between,
    "TB",
    margin,
    { nodesep: margin, edgesep: 4 },
    order
  );
}

/** A path through dagre's points with every bend rounded by `r` (React Flow's smoothstep), the last run kept straight into its head. */
export function rounded(points: Point[], r: number): string {
  const [first] = points;
  if (!first) {
    return "";
  }
  if (points.length < 3) {
    return `M${points.map((p) => `${p.x},${p.y}`).join(" L")}`;
  }
  let d = `M${first.x},${first.y}`;
  for (let at = 1; at < points.length - 1; at += 1) {
    const a = points[at - 1] as Point;
    const b = points[at] as Point;
    const c = points[at + 1] as Point;
    const l1 = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const l2 = Math.hypot(c.x - b.x, c.y - b.y) || 1;
    const k = Math.min(r, l1 / 2, l2 / 2);
    const p1 = { x: b.x + ((a.x - b.x) * k) / l1, y: b.y + ((a.y - b.y) * k) / l1 };
    const p2 = { x: b.x + ((c.x - b.x) * k) / l2, y: b.y + ((c.y - b.y) * k) / l2 };
    d += ` L${p1.x},${p1.y} Q${b.x},${b.y} ${p2.x},${p2.y}`;
  }
  const last = points.at(-1) as Point;
  return `${d} L${last.x},${last.y}`;
}

/** The point halfway along a run of points, by length: where an edge's label stands. */
export function midway(points: Point[]): Point {
  const runs = points.slice(1).map((b, at) => {
    const a = points[at] as Point;
    return { a, b, length: Math.hypot(b.x - a.x, b.y - a.y) };
  });
  let left = runs.reduce((sum, one) => sum + one.length, 0) / 2;
  for (const run of runs) {
    if (left <= run.length) {
      const t = run.length === 0 ? 0 : left / run.length;
      return {
        x: run.a.x + (run.b.x - run.a.x) * t,
        y: run.a.y + (run.b.y - run.a.y) * t,
      };
    }
    left -= run.length;
  }
  return points[0] ?? { x: 0, y: 0 };
}
