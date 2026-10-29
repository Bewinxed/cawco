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

/** One laid out graph: each box's top-left, each edge's points, which way its ranks run, the whole's size. */
export interface Laid {
  boxes: Map<string, Point>;
  dir: "LR" | "TB";
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
  return {
    boxes,
    dir: rankdir,
    edges: drawn,
    w: size.width ?? 0,
    h: size.height ?? 0,
  };
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
    const p1 = {
      x: b.x + ((a.x - b.x) * k) / l1,
      y: b.y + ((a.y - b.y) * k) / l1,
    };
    const p2 = {
      x: b.x + ((c.x - b.x) * k) / l2,
      y: b.y + ((c.y - b.y) * k) / l2,
    };
    d += ` L${p1.x},${p1.y} Q${b.x},${b.y} ${p2.x},${p2.y}`;
  }
  const last = points.at(-1) as Point;
  return `${d} L${last.x},${last.y}`;
}

/** A box by its four sides. */
interface Sides {
  b: number;
  l: number;
  r: number;
  t: number;
}

/** One edge routed: its points, its label's place (the middle of its longest run), and whether it runs back up the ranks. */
export interface Routed {
  at: Point | null;
  back: boolean;
  from: string;
  points: Point[];
  to: string;
}

/** A layout's two axes: the main one runs down its ranks, the cross one across them. */
interface Axes {
  /** A box's far cross side, and its near one. */
  crossFar: (b: Sides) => number;
  crossMid: (b: Sides) => number;
  crossNear: (b: Sides) => number;
  /** A box's near and far sides down the ranks, and its middle. */
  main0: (b: Sides) => number;
  main1: (b: Sides) => number;
  mainMid: (b: Sides) => number;
  point: (main: number, cross: number) => Point;
}

const TOP_DOWN: Axes = {
  main0: (b) => b.t,
  main1: (b) => b.b,
  mainMid: (b) => (b.t + b.b) / 2,
  crossNear: (b) => b.l,
  crossFar: (b) => b.r,
  crossMid: (b) => (b.l + b.r) / 2,
  point: (main, cross) => ({ x: cross, y: main }),
};
const ACROSS: Axes = {
  main0: (b) => b.l,
  main1: (b) => b.r,
  mainMid: (b) => (b.l + b.r) / 2,
  crossNear: (b) => b.t,
  crossFar: (b) => b.b,
  crossMid: (b) => (b.t + b.b) / 2,
  point: (main, cross) => ({ x: main, y: cross }),
};

/** A forward edge: out of its source's far side, one turn at the middle of the gap between the ranks, into its target's near side. */
function forward(S: Sides, T: Sides, ax: Axes): Point[] {
  const mid = (ax.main1(S) + ax.main0(T)) / 2;
  const a = ax.crossMid(S);
  const b = ax.crossMid(T);
  return Math.abs(a - b) < 0.5
    ? [ax.point(ax.main1(S), a), ax.point(ax.main0(T), a)]
    : [
        ax.point(ax.main1(S), a),
        ax.point(mid, a),
        ax.point(mid, b),
        ax.point(ax.main0(T), b),
      ];
}

/** A way back: out of the source's side facing `lane`, along it, and into the target's same side. */
function viaLane(S: Sides, T: Sides, lane: number, ax: Axes): Point[] {
  const near = lane < ax.crossNear(S);
  const side = (b: Sides) => (near ? ax.crossNear(b) : ax.crossFar(b));
  return [
    ax.point(ax.mainMid(S), side(S)),
    ax.point(ax.mainMid(S), lane),
    ax.point(ax.mainMid(T), lane),
    ax.point(ax.mainMid(T), side(T)),
  ];
}

/** The middle of a route's longest run: where its label stands. */
function labelAt(points: Point[]): Point | null {
  let best = 0;
  let at: Point | null = null;
  for (let k = 1; k < points.length; k += 1) {
    const a = points[k - 1] as Point;
    const b = points[k] as Point;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length > best) {
      best = length;
      at = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  }
  return at;
}

/**
 * Every edge of a machine routed between its states' boxes (round 29,
 * section F): a forward edge leaves its source's far side and enters its
 * target's near side through one turn at the middle of the gap between
 * their ranks; a way back (Try again), or a forward edge whose straight run
 * would cross another state, runs out to a lane beside every state and in
 * from that side, each further lane a label's width and a gap out. `sizes`
 * gives each box; `labelW` each edge's label's width.
 */
export function routeEdges(
  placed: Pick<Laid, "boxes" | "dir">,
  sizes: Map<string, { h: number; w: number }>,
  links: { from: string; label: string | null; to: string }[],
  labelW: (label: string) => number,
  gap: number
): Routed[] {
  const ax = placed.dir === "TB" ? TOP_DOWN : ACROSS;
  const sidesOf = (id: string): Sides | null => {
    const at = placed.boxes.get(id);
    const size = sizes.get(id);
    return at && size
      ? { l: at.x, t: at.y, r: at.x + size.w, b: at.y + size.h }
      : null;
  };
  const all = [...placed.boxes.keys()].flatMap((id) => {
    const one = sidesOf(id);
    return one ? [{ id, ...one }] : [];
  });
  const lanes = {
    hi: Math.max(...all.map(ax.crossFar)) + 2 * gap,
    lo: Math.min(...all.map(ax.crossNear)) - 2 * gap,
  };
  /** Whether a run across the ranks at `m`, from cross `a` to `b`, passes over a state other than `skip`'s. */
  const blocked = (m: number, a: number, b: number, skip: string[]) =>
    all.some(
      (x) =>
        !skip.includes(x.id) &&
        ax.main0(x) < m &&
        ax.main1(x) > m &&
        Math.min(ax.crossFar(x), Math.max(a, b)) >
          Math.max(ax.crossNear(x), Math.min(a, b))
    );
  /** Whether a straight run from S to T would cross another state. */
  const crosses = (S: Sides, T: Sides, skip: string[]) =>
    Math.abs(ax.crossMid(S) - ax.crossMid(T)) < 0.5 &&
    all.some(
      (x) =>
        !skip.includes(x.id) &&
        ax.main0(x) > ax.main1(S) - 0.5 &&
        ax.main1(x) < ax.main0(T) + 0.5 &&
        ax.crossNear(x) < ax.crossMid(S) &&
        ax.crossFar(x) > ax.crossMid(S)
    );
  /** The lane a way back takes: beside the far side unless a state stands in the way there, then the near side. */
  const laneFor = (S: Sides, T: Sides, words: number, skip: string[]) => {
    const hi = lanes.hi + words / 2;
    const hiFree = !(
      blocked(ax.mainMid(S), ax.crossFar(S), hi, skip) ||
      blocked(ax.mainMid(T), ax.crossFar(T), hi, skip)
    );
    if (hiFree) {
      lanes.hi = hi + words / 2 + 2 * gap;
      return hi;
    }
    const lo = lanes.lo - words / 2;
    lanes.lo = lo - words / 2 - 2 * gap;
    return lo;
  };
  return links.flatMap((link) => {
    const S = sidesOf(link.from);
    const T = sidesOf(link.to);
    if (!(S && T)) {
      return [];
    }
    const skip = [link.from, link.to];
    const back = ax.main0(T) < ax.main1(S) - 0.5 || crosses(S, T, skip);
    const words = link.label ? labelW(link.label) + 2 * gap : 0;
    const points = back
      ? viaLane(S, T, laneFor(S, T, words, skip), ax)
      : forward(S, T, ax);
    return [
      {
        from: link.from,
        to: link.to,
        points,
        back,
        at: link.label ? labelAt(points) : null,
      },
    ];
  });
}

/** An open chevron at an edge's tip: two legs of `leg` at a right angle, meeting at the tip, pointing along the last run. */
export function headPath(tip: Point, from: Point, leg: number): string {
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  const n = Math.hypot(dx, dy) || 1;
  const ux = dx / n;
  const uy = dy / n;
  const k = leg * Math.SQRT1_2;
  const a = { x: tip.x - k * ux - k * uy, y: tip.y - k * uy + k * ux };
  const b = { x: tip.x - k * ux + k * uy, y: tip.y - k * uy - k * ux };
  return `M${a.x},${a.y} L${tip.x},${tip.y} L${b.x},${b.y}`;
}

/** The box a set of routes and boxes reaches, for the region to hold it whole. */
export function reachOf(
  routes: Routed[],
  w: number,
  h: number,
  labelW: (label: string) => number,
  labels: Map<string, string>,
  badgeH: number,
  pad: number
): { b: number; l: number; r: number; t: number } {
  const ext = { l: 0, t: 0, r: w, b: h };
  for (const route of routes) {
    for (const p of route.points) {
      ext.l = Math.min(ext.l, p.x - pad);
      ext.t = Math.min(ext.t, p.y - pad);
      ext.r = Math.max(ext.r, p.x + pad);
      ext.b = Math.max(ext.b, p.y + pad);
    }
    const label = labels.get(`${route.from}>${route.to}`);
    if (route.at && label) {
      const half = labelW(label) / 2 + pad;
      ext.l = Math.min(ext.l, route.at.x - half);
      ext.r = Math.max(ext.r, route.at.x + half);
      ext.t = Math.min(ext.t, route.at.y - badgeH / 2 - pad);
      ext.b = Math.max(ext.b, route.at.y + badgeH / 2 + pad);
    }
  }
  return ext;
}
