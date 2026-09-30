import type { WorkflowGraph, WorkflowNode } from "@whiffle/core";
import { JEV_ANSWER_FIELDS, outcomeOnEveryPath } from "@whiffle/core";
import {
  IconBox,
  IconCpu,
  IconHook,
  IconJev,
  IconRocket,
  IconSubagent,
  IconToolQuestion,
  IconToolTodo,
  IconWorkflow,
} from "$lib/icons";
import { newId } from "$lib/whiffle/id";

export const kinds = [
  {
    kind: "start",
    title: "Start",
    group: "Flow",
    meaning: "Inputs for this workflow",
    icon: IconRocket,
  },
  {
    kind: "end",
    title: "End",
    group: "Flow",
    meaning: "Return the final outputs",
    icon: IconBox,
  },
  {
    kind: "branch",
    title: "Branch",
    group: "Flow",
    meaning: "Follow the first matching case",
    icon: IconSubagent,
  },
  {
    kind: "map",
    title: "Map",
    group: "Flow",
    meaning: "Run a graph for each item",
    icon: IconHook,
  },
  {
    kind: "workflow",
    title: "Workflow",
    group: "Flow",
    meaning: "Launch a child workflow",
    icon: IconWorkflow,
  },
  {
    kind: "step",
    title: "Step",
    group: "Work",
    meaning: "Give a model a bounded task",
    icon: IconCpu,
  },
  {
    kind: "check",
    title: "Check",
    group: "Work",
    meaning: "Verify a result with code",
    icon: IconToolTodo,
  },
  {
    kind: "jev",
    title: "Jev",
    group: "Work",
    meaning: "Ask Jev typed questions in one call",
    icon: IconJev,
  },
  {
    kind: "ask",
    title: "Ask",
    group: "People",
    meaning: "Pause for a human choice",
    icon: IconToolQuestion,
  },
] as const;

/**
 * What a **New program** starts from: the two exports the hub requires and
 * nothing else, so the first thing the operator does is write the first step
 * rather than delete a sample.
 */
export const STARTER_PROGRAM = `import { z } from "zod";

export const inputs = z.object({});

export default async function (w: Workflow<typeof inputs>) {
  // Add a step with w.run({ title, harness, model, prompt, output }).
  return {};
}
`;

const LINE_PREFIX = /^Line \d+:\s*/;
/**
 * The hub prefixes a typecheck diagnostic with its line number. The gutter and
 * the Problems chip both already say the line, so the prose drops it.
 */
export const withoutLine = (text: string) => text.replace(LINE_PREFIX, "");

export function newNode(
  kind: WorkflowNode["kind"],
  position = { x: 80, y: 120 }
): WorkflowNode {
  const base = {
    id: `${kind}-${newId().slice(0, 8)}`,
    title: kinds.find((entry) => entry.kind === kind)?.title ?? kind,
    position,
  };
  switch (kind) {
    case "start":
      return { ...base, kind, inputs: [] };
    case "end":
      return { ...base, kind, outputs: {} };
    case "step":
      return {
        ...base,
        kind,
        harness: "claude",
        model: "",
        prompt: "",
        outputSchema: { type: "object", properties: {} },
        retries: 2,
        timeoutMinutes: 60,
      };
    case "check":
      return { ...base, kind, rules: [] };
    case "branch":
      return {
        ...base,
        kind,
        cases: [
          { port: "match", when: { path: "result.pass", op: "truthy" } },
          { port: "else" },
        ],
      };
    case "map":
      return {
        ...base,
        kind,
        over: "",
        concurrency: 4,
        body: { nodes: [newNode("start")], edges: [] },
      };
    case "workflow":
      return { ...base, kind, workflowId: "", inputs: {} };
    case "jev":
      return {
        ...base,
        kind,
        state: "",
        questions: [{ id: "answer", type: "noul", instructions: "" }],
      };
    case "ask":
      return {
        ...base,
        kind,
        question: "",
        options: [{ label: "Continue" }, { label: "Stop" }],
        allowOther: false,
        answeredBy: "operator",
      };
    default:
      throw new Error(`Unknown node kind: ${kind}`);
  }
}

export function upstream(graph: WorkflowGraph, nodeId: string): WorkflowNode[] {
  const seen = new Set<string>([nodeId]);
  const visit = (id: string) => {
    for (const edge of graph.edges.filter((entry) => entry.to.node === id)) {
      if (seen.has(edge.from.node)) {
        continue;
      }
      seen.add(edge.from.node);
      visit(edge.from.node);
    }
  };
  visit(nodeId);
  return graph.nodes.filter((node) => node.id !== nodeId && seen.has(node.id));
}

function schemaPaths(schema: unknown, path: string): string[] {
  if (!schema || typeof schema !== "object") {
    return [path];
  }
  const shape = schema as {
    type?: string;
    properties?: Record<string, unknown>;
    items?: unknown;
  };
  if (shape.type === "array") {
    return [path, `${path}.length`, ...schemaPaths(shape.items, `${path}[*]`)];
  }
  return [
    path,
    ...Object.entries(shape.properties ?? {}).flatMap(([key, value]) =>
      schemaPaths(value, `${path}.${key}`)
    ),
  ];
}
export function templatePaths(graph: WorkflowGraph, nodeId: string): string[] {
  const start = graph.nodes.find((node) => node.kind === "start");
  const above = upstream(graph, nodeId);
  const upstreamIds = new Set(above.map((node) => node.id));
  /** A node failed on the way here only if its `fail` edge leads here. */
  const failedOnTheWay = (id: string) =>
    graph.edges.some(
      (edge) =>
        edge.from.node === id &&
        edge.from.port === "fail" &&
        (edge.to.node === nodeId || upstreamIds.has(edge.to.node))
    );
  return [
    "workspace",
    "attempt.number",
    "attempt.previousError",
    "attempt.gateFindings",
    "supervisor.note",
    ...(start?.kind === "start"
      ? start.inputs.map((input) => `inputs.${input.name}`)
      : []),
    ...above.flatMap((node) => readAs(node.id, "result", resultPaths(node))),
    ...above
      .filter((node) => failedOnTheWay(node.id))
      .flatMap((node) =>
        readAs(node.id, "failure", [
          `steps.${node.id}.failure`,
          `steps.${node.id}.failure.message`,
          `steps.${node.id}.failure.kind`,
        ])
      ),
  ];

  /**
   * The references as the validator takes them: plain where the value is set
   * on every path here, `steps.<id>?.…` where it may be absent.
   */
  function readAs(
    id: string,
    outcome: "result" | "failure",
    references: string[]
  ): string[] {
    return outcomeOnEveryPath(graph, id, nodeId, outcome)
      ? references
      : references.map((path) => path.replace(`steps.${id}.`, `steps.${id}?.`));
  }
}

/** Every path a node's result offers, before it is marked optional or not. */
function resultPaths(node: WorkflowNode): string[] {
  if (node.kind === "step") {
    return schemaPaths(node.outputSchema, `steps.${node.id}.result`);
  }
  if (node.kind === "jev") {
    return jevPaths(node);
  }
  if (node.kind === "map") {
    return [`steps.${node.id}.result`, `steps.${node.id}.result.items`];
  }
  return [`steps.${node.id}.result`];
}

/** A Jev question type as the editor names it. */
export const JEV_TYPE_NAMES = {
  noul: "Noul",
  choice: "Choice",
  score: "Score",
} as const;

/** What a Jev node's result offers downstream: each answer's own fields. */
export function jevPaths(node: Extract<WorkflowNode, { kind: "jev" }>) {
  const result = `steps.${node.id}.result`;
  return [
    result,
    ...node.questions.flatMap((question) =>
      JEV_ANSWER_FIELDS[question.type]
        .filter((field) => field !== "type" && field !== "legend")
        .map((field) => `${result}.answers.${question.id}.${field}`)
    ),
  ];
}
export function duration(
  start: Date | string | null,
  end: Date | string | null,
  now: number
): string {
  if (!start) {
    return "—";
  }
  const ms = Math.max(
    0,
    (end ? new Date(end).getTime() : now) - new Date(start).getTime()
  );
  // A finished span under ten seconds keeps its tenths, so a 0.4s run does
  // not read "0s". A running one counts whole seconds: its clock ticks once
  // a second, and tenths off that tick would claim a precision it lacks.
  if (end && ms < 9950) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const seconds = Math.floor(ms / 1000);
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
