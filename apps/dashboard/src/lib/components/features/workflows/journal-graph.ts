/**
 * The run view for a code-origin run (proposal §13.4). A hand-written program
 * has no graph, so the shape on the canvas is read back out of the effect
 * journal: one node per `run`/`spawn`, `ask`/`exec`/`exists`/`workflow` as
 * their own kinds, and data flow taken from the order the program made the
 * calls in. Nothing here infers a status — the step rows carry those.
 */

import dagre from "@dagrejs/dagre";
import type {
  EffortLevel,
  WorkflowEffect,
  WorkflowEffectKind,
  WorkflowNode,
} from "@whiffle/core";

/** The 260px node of §9.2, and the rank/row gaps that keep edges readable. */
const NODE_WIDTH = 260;
const NODE_HEIGHT = 132;
const RANK_GAP = 96;
const ROW_GAP = 40;

/** The effect kinds that are a node on the canvas. The rest are annotations. */
const NODE_KINDS: WorkflowEffectKind[] = [
  "run",
  "spawn",
  "ask",
  "exec",
  "exists",
  "workflow",
];

/** The step row id the hub gives an effect at this sequence. */
export const journalNodeId = (seq: number) => `seq-${seq}`;

export interface JournalNode {
  id: string;
  kind: WorkflowEffectKind;
  lines: string[];
  /** A real step node when the journal carries the spec; absent otherwise. */
  node?: WorkflowNode;
  position: { x: number; y: number };
  seq: number;
  title: string;
}
export interface JournalEdge {
  from: string;
  id: string;
  to: string;
}
export interface JournalGraph {
  edges: JournalEdge[];
  nodes: JournalNode[];
}
export interface JournalCheckpoint {
  at: string;
  data: unknown;
  label: string;
  /** The node the marker sits on: the step the program checkpointed after. */
  nodeId: string | undefined;
  seq: number;
}
export interface JournalStateTouch {
  /** The slots the calls named, in the order they were first touched. */
  names: string[];
  reads: number;
  writes: number;
}
export interface JournalLogLine {
  at: string;
  kind: "log" | "notify";
  seq: number;
  text: string;
}

interface StepSpec {
  continueFrom?: string;
  denyTools?: string[];
  effort?: EffortLevel;
  harness: "claude" | "opencode" | "pi";
  model: string;
  node?: string;
  outputSchema: Record<string, unknown>;
  prompt: string;
  retries?: number;
  skills?: string[];
  timeoutMinutes?: number;
  title: string;
}

/** The step spec a `run`/`spawn` effect journals beside its value. */
const specOf = (effect: WorkflowEffect): StepSpec | undefined => {
  const result = effect.result as { spec?: StepSpec } | null;
  return result?.spec;
};

/** The node a `run`/`spawn` effect stands for, in either origin's terms. */
export const stepNodeIdOf = (effect: WorkflowEffect): string =>
  specOf(effect)?.node ?? journalNodeId(effect.seq);

const firstLine = (text: string) => text.split("\n").find(Boolean) ?? "";

/** One argument of the call, as journaled beside its result. */
const arg = (effect: WorkflowEffect, name: string): string =>
  String(effect.args?.[name] ?? "");

function describe(effect: WorkflowEffect): { lines: string[]; title: string } {
  const result = effect.result as Record<string, unknown> | null;
  switch (effect.kind) {
    case "ask":
      return {
        title: "Ask",
        lines: [
          arg(effect, "question"),
          typeof result?.choice === "string"
            ? `Answered ${result.choice}`
            : "Waiting for an answer",
        ],
      };
    case "exec":
      return {
        title: "Command",
        lines: [
          firstLine(arg(effect, "cmd")),
          result ? `Exit ${String(result.code)}` : "Running",
        ],
      };
    case "exists": {
      const absent = effect.result === null ? "Running" : "Absent";
      return {
        title: "Path check",
        lines: [arg(effect, "path"), effect.result === true ? "Found" : absent],
      };
    }
    default:
      return { title: "Child workflow", lines: [arg(effect, "slug")] };
  }
}

/**
 * The layout. Consecutive `spawn` calls are one rank — that is what a
 * `Promise.all` fan-out looks like in the journal — and every other call
 * blocks, so it opens a rank of its own.
 */
/** One node, from the call the journal records at this sequence. */
function nodeOf(effect: WorkflowEffect): JournalNode {
  const id = journalNodeId(effect.seq);
  const spec = specOf(effect);
  if (!spec) {
    return {
      id,
      seq: effect.seq,
      kind: effect.kind,
      position: { x: 0, y: 0 },
      ...describe(effect),
    };
  }
  return {
    id,
    seq: effect.seq,
    kind: effect.kind,
    title: spec.title,
    lines: [],
    position: { x: 0, y: 0 },
    node: {
      id,
      title: spec.title,
      position: { x: 0, y: 0 },
      kind: "step",
      harness: spec.harness,
      model: spec.model,
      ...(spec.effort ? { effort: spec.effort } : {}),
      ...(spec.skills ? { skills: spec.skills } : {}),
      ...(spec.denyTools ? { denyTools: spec.denyTools } : {}),
      prompt: spec.prompt,
      outputSchema: spec.outputSchema,
      context: spec.continueFrom
        ? { mode: "continue", from: spec.continueFrom }
        : { mode: "fresh" },
      retries: spec.retries ?? 2,
      timeoutMinutes: spec.timeoutMinutes ?? 60,
    },
  };
}

/**
 * The ranks. Consecutive `spawn` calls share one — that is what a
 * `Promise.all` fan-out looks like in the journal — and every other call
 * blocks, so it opens a rank of its own.
 */
function ranksOf(effects: WorkflowEffect[]): JournalNode[][] {
  const ranks: JournalNode[][] = [];
  for (const effect of effects) {
    if (!NODE_KINDS.includes(effect.kind)) {
      continue;
    }
    const entry = nodeOf(effect);
    const last = ranks.at(-1);
    const fansOut =
      effect.kind === "spawn" &&
      last?.every((item) => item.kind === "spawn") === true;
    if (fansOut && last) {
      last.push(entry);
    } else {
      ranks.push([entry]);
    }
  }
  return ranks;
}

/** Positions every node left-to-right, 260px wide, through dagre. */
function place(nodes: JournalNode[], edges: JournalEdge[]): void {
  const layout = new dagre.graphlib.Graph();
  layout.setGraph({
    rankdir: "LR",
    nodesep: ROW_GAP,
    ranksep: RANK_GAP,
    marginx: 32,
    marginy: 32,
  });
  layout.setDefaultEdgeLabel(() => ({}));
  for (const node of nodes) {
    layout.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    layout.setEdge(edge.from, edge.to);
  }
  dagre.layout(layout);
  for (const node of nodes) {
    const placed = layout.node(node.id);
    node.position = {
      x: Math.round(placed.x - NODE_WIDTH / 2),
      y: Math.round(placed.y - NODE_HEIGHT / 2),
    };
    if (node.node) {
      node.node.position = node.position;
    }
  }
}

/** The canvas a code-origin run is painted on: nodes, edges and positions. */
export function journalGraph(effects: WorkflowEffect[]): JournalGraph {
  const ranks = ranksOf([...effects].sort((a, b) => a.seq - b.seq));
  const edges: JournalEdge[] = [];
  for (const [index, rank] of ranks.entries()) {
    for (const before of ranks[index - 1] ?? []) {
      for (const after of rank) {
        edges.push({
          id: `${before.id}-${after.id}`,
          from: before.id,
          to: after.id,
        });
      }
    }
  }
  const nodes = ranks.flat();
  place(nodes, edges);
  return { nodes, edges };
}

/** Checkpoints, each pinned to the step the program was past when it marked. */
export function journalCheckpoints(
  effects: WorkflowEffect[]
): JournalCheckpoint[] {
  const ordered = [...effects].sort((a, b) => a.seq - b.seq);
  const marks: JournalCheckpoint[] = [];
  let previous: string | undefined;
  for (const effect of ordered) {
    if (NODE_KINDS.includes(effect.kind)) {
      previous = stepNodeIdOf(effect);
      continue;
    }
    if (effect.kind !== "checkpoint") {
      continue;
    }
    marks.push({
      seq: effect.seq,
      label: arg(effect, "label"),
      data: effect.args?.data ?? null,
      at: String(effect.at),
      nodeId: previous,
    });
  }
  return marks;
}

/** The run's own narration: `w.log` lines and the notices it sent. */
export function journalLog(effects: WorkflowEffect[]): JournalLogLine[] {
  return [...effects]
    .sort((a, b) => a.seq - b.seq)
    .filter((effect) => effect.kind === "log" || effect.kind === "notify")
    .map((effect) => ({
      seq: effect.seq,
      kind: effect.kind as "log" | "notify",
      at: String(effect.at),
      text: arg(effect, "text"),
    }));
}

/**
 * How many times the run read or wrote its shared store while a step was the
 * program's most recent call, and which slots by name; the slot values come
 * from `run.state`.
 */
export function journalStateTouches(
  effects: WorkflowEffect[]
): Record<string, JournalStateTouch> {
  const ordered = [...effects].sort((a, b) => a.seq - b.seq);
  const touches: Record<string, JournalStateTouch> = {};
  let previous: string | undefined;
  for (const effect of ordered) {
    if (NODE_KINDS.includes(effect.kind)) {
      previous = stepNodeIdOf(effect);
      continue;
    }
    if (
      !(
        previous &&
        (effect.kind === "state-get" || effect.kind === "state-set")
      )
    ) {
      continue;
    }
    touches[previous] ??= { reads: 0, writes: 0, names: [] };
    const entry = touches[previous];
    const name = arg(effect, "name");
    if (!entry.names.includes(name)) {
      entry.names.push(name);
    }
    if (effect.kind === "state-get") {
      entry.reads += 1;
    } else {
      entry.writes += 1;
    }
  }
  return touches;
}
