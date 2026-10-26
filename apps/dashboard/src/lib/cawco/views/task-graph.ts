/**
 * A project's tasks as a graph (PRD §5.2, the task file's edges between
 * tasks): `waits_on` (it waits on that task), `part_of` and `found_in`. A
 * wait on a card, a pin, a pull request, a run or a session is no edge
 * here; the task's pane lists it. The Canvas view draws the graph; it
 * stands in the view strip while there is one edge.
 *
 * Layout is dagre's (@dagrejs/dagre, MIT): along `waits_on`, a part ranked
 * right after its whole, left to right or top to bottom (`Flow`, whichever
 * the canvas holds larger); `found_in` is drawn but places nothing. No
 * coordinate is ever stored or set by hand.
 */
import dagre from "@dagrejs/dagre";
import { numberOf } from "#lib/cawco/motion/curves.svelte.js";
import type { TaskSummary } from "#lib/cawco/project-tasks.js";

export type TaskEdgeKind = "waits_on" | "part_of" | "found_in";

export interface TaskEdge {
  id: string;
  kind: TaskEdgeKind;
  /** `waits_on`: the task waited on; `part_of`, `found_in`: the whole, the task it was found in. */
  source: string;
  target: string;
}

/** A wait on a task, as the hub keeps it: `tsk-12`. */
const TASK_ID = /^tsk-\d+$/u;

/** Every edge between two of the project's tasks. */
export function taskEdges(tasks: TaskSummary[]): TaskEdge[] {
  const known = new Set(tasks.map((task) => task.id));
  const edges: TaskEdge[] = [];
  const add = (kind: TaskEdgeKind, source: string, target: string) => {
    if (source !== target && known.has(source) && known.has(target)) {
      edges.push({ id: `${kind}:${source}:${target}`, kind, source, target });
    }
  };
  for (const task of tasks) {
    for (const waited of task.waitsOn.filter((one) => TASK_ID.test(one))) {
      add("waits_on", waited, task.id);
    }
    if (task.partOf) {
      add("part_of", task.partOf, task.id);
    }
    if (task.foundIn && TASK_ID.test(task.foundIn)) {
      add("found_in", task.foundIn, task.id);
    }
  }
  return edges;
}

/** Where each node's box stands, its top-left corner, by task id. */
export type Placement = Map<string, { x: number; y: number }>;

/** Which way the graph runs: left to right, or top to bottom. */
export type Flow = "LR" | "TB";

/**
 * The edges that order the graph (`waits_on`, `part_of`) meet a card on its
 * flow's two ends; the side relation (`found_in`) on the cross axis, so it
 * never shares an arrowhead or a trunk with them.
 */
export const handlesOf = (
  kind: TaskEdgeKind
): { sourceHandle: string; targetHandle: string } =>
  kind === "waits_on" || kind === "part_of"
    ? { sourceHandle: "flow-out", targetHandle: "flow-in" }
    : { sourceHandle: "side-out", targetHandle: "side-in" };

/** The box a placement covers, from each node's size. */
export function extentOf(
  placed: Placement,
  size: (id: string) => { width: number; height: number }
): { width: number; height: number } {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const [id, at] of placed) {
    const box = size(id);
    left = Math.min(left, at.x);
    top = Math.min(top, at.y);
    right = Math.max(right, at.x + box.width);
    bottom = Math.max(bottom, at.y + box.height);
  }
  return placed.size === 0
    ? { width: 0, height: 0 }
    : { width: right - left, height: bottom - top };
}

/**
 * The graph laid out along `flow`: `waits_on` and `part_of` rank it (a part
 * just after its whole, kept close), `found_in` rides along. `size` is each
 * node's measured box; the spacing is the space scale's.
 */
export function layoutTasks(
  ids: string[],
  edges: TaskEdge[],
  size: (id: string) => { width: number; height: number },
  flow: Flow = "LR"
): Placement {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: flow,
    nodesep: numberOf("--space-5"),
    ranksep: numberOf("--space-8") * 2,
    marginx: 0,
    marginy: 0,
  });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const id of ids) {
    graph.setNode(id, size(id));
  }
  for (const edge of edges) {
    if (edge.kind === "waits_on") {
      graph.setEdge(edge.source, edge.target, { weight: 2, minlen: 1 });
    } else if (edge.kind === "part_of") {
      graph.setEdge(edge.source, edge.target, { weight: 3, minlen: 1 });
    }
  }
  dagre.layout(graph);
  const placed: Placement = new Map();
  for (const id of ids) {
    const node = graph.node(id);
    placed.set(id, {
      x: Math.round(node.x - node.width / 2),
      y: Math.round(node.y - node.height / 2),
    });
  }
  return placed;
}
