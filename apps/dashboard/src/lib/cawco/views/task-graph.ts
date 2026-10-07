/**
 * A project's tasks as a graph (PRD §5.2, the task file's edges): `after`
 * (it waits for that task), `parent`, `related` and `found_in`. The Canvas
 * view draws it; it stands in the view strip while there is one edge.
 *
 * Layout is dagre's (@dagrejs/dagre, MIT): left to right along `after`, a
 * child ranked right after its parent; `related` and `found_in` are drawn
 * but place nothing. No coordinate is ever stored or set by hand.
 */
import dagre from "@dagrejs/dagre";
import { numberOf } from "#lib/cawco/motion/curves.svelte.js";
import type { TaskSummary } from "#lib/cawco/project-tasks.js";

export type TaskEdgeKind = "after" | "parent" | "related" | "found_in";

export interface TaskEdge {
  id: string;
  kind: TaskEdgeKind;
  /** `after`: the task waited for; `parent`, `found_in`: the parent, the task it was found in. */
  source: string;
  target: string;
}

/** Every edge between two of the project's tasks; `related` once per pair. */
export function taskEdges(tasks: TaskSummary[]): TaskEdge[] {
  const known = new Set(tasks.map((task) => task.id));
  const edges: TaskEdge[] = [];
  const add = (kind: TaskEdgeKind, source: string, target: string) => {
    if (source !== target && known.has(source) && known.has(target)) {
      edges.push({ id: `${kind}:${source}:${target}`, kind, source, target });
    }
  };
  const pairs = new Set<string>();
  for (const task of tasks) {
    for (const waited of task.after) {
      add("after", waited, task.id);
    }
    if (task.parent) {
      add("parent", task.parent, task.id);
    }
    if (task.foundIn) {
      add("found_in", task.foundIn, task.id);
    }
    for (const other of task.related) {
      const pair = [task.id, other].sort().join(":");
      if (!pairs.has(pair)) {
        pairs.add(pair);
        add("related", task.id, other);
      }
    }
  }
  return edges;
}

/** Where each node's box stands, its top-left corner, by task id. */
export type Placement = Map<string, { x: number; y: number }>;

/**
 * The graph laid out left to right: `after` and `parent` rank it (a child
 * just after its parent, kept close), the others ride along. `size` is each
 * node's measured box; the spacing is the space scale's.
 */
export function layoutTasks(
  ids: string[],
  edges: TaskEdge[],
  size: (id: string) => { width: number; height: number }
): Placement {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: "LR",
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
    if (edge.kind === "after") {
      graph.setEdge(edge.source, edge.target, { weight: 2, minlen: 1 });
    } else if (edge.kind === "parent") {
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
