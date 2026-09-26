import type { EffortLevel } from "./harness";

export type WorkflowRunStatus =
  | "running"
  | "waiting"
  | "done"
  | "failed"
  | "cancelled";
export type WorkflowStepStatus =
  | "pending"
  | "running"
  | "waiting"
  | "passed"
  | "failed"
  | "skipped"
  | "cancelled";
export type WorkflowAttemptStatus = "running" | "passed" | "failed";
export type WorkflowOrigin = "editor" | "code";

/** Every effect kind the bridge can carry. One row in `workflow_effects`. */
export type WorkflowEffectKind =
  | "run"
  | "spawn"
  | "await"
  | "ask"
  | "exec"
  | "exists"
  | "workflow"
  | "state-get"
  | "state-set"
  | "checkpoint"
  | "sleep"
  | "now"
  | "notify"
  | "notes"
  | "log"
  | "trace";

/**
 * The journal row. `argsHash` pins the call's arguments so a replay that asks
 * something different at the same `seq` is refused as non-deterministic rather
 * than silently answered from another call's outcome.
 */
export interface WorkflowEffect {
  /** The call's arguments as made; null for `run`/`spawn`, whose spec is on `result`. */
  args: Record<string, unknown> | null;
  argsHash: string;
  at: Date | string;
  failure: string | null;
  kind: WorkflowEffectKind;
  result: unknown;
  runId: string;
  seq: number;
}

/** How a typed rejection crosses the worker boundary and comes back. */
export interface WorkflowFailure {
  attempts?: number;
  childRunId?: string;
  kind?: string;
  message: string;
  name: "StepError" | "AskError" | "ChildError" | "Error";
  stepId?: string;
}

/**
 * The question a `waiting` run is parked on. Self-contained on purpose: a
 * code-origin run has no graph to read the question off, so the hub sends the
 * whole thing, on the run detail and on the frame that announces the wait.
 */
export interface WorkflowAsk {
  allowOther: boolean;
  answeredBy: "operator" | "supervisor";
  options: { description?: string; label: string }[];
  parkedAt: Date | string;
  question: string;
  stepId: string;
}

/** Hub-originated run transition, separate from a harness's session frames. */
export interface WorkflowFrame {
  /** Present while the run is `waiting`: everything needed to answer it. */
  ask?: WorkflowAsk;
  attempt?: WorkflowAttempt;
  /** The marker a `w.checkpoint` call just recorded. */
  checkpoint?: { data?: unknown; label: string };
  kind: "workflow";
  run: WorkflowRun;
  runId: string;
  step?: WorkflowStep;
}
export interface Workflow {
  createdAt: Date | string;
  description: string;
  /** The editor's model. Null for a program written by hand or by an agent. */
  graph: WorkflowGraph | null;
  id: string;
  /** The program's `inputs` export, as the launch dialog and stubs need it. */
  inputs: WorkflowInput[];
  name: string;
  origin: WorkflowOrigin;
  /** The executable form: what the hub actually runs (§13.1). */
  program: string;
  slug: string;
  updatedAt: Date | string;
}
export interface WorkflowRun {
  edges: Record<string, Record<string, "fired" | "skipped">>;
  endedAt: Date | string | null;
  failure: string | null;
  graph: WorkflowGraph | null;
  id: string;
  inputs: Record<string, unknown>;
  launchedBy: string;
  loops: Record<string, Record<string, number>>;
  machineId: string;
  parentRunId: string | null;
  parentStepId: string | null;
  program: string;
  rerunOfRunId: string | null;
  result: unknown;
  startedAt: Date | string;
  state: Record<string, unknown>;
  status: WorkflowRunStatus;
  supervisorInstanceId: string | null;
  workflowId: string;
  workspace: string;
}
export interface WorkflowStep {
  childRunId: string | null;
  endedAt: Date | string | null;
  failure: string | null;
  id: string;
  instanceId: string | null;
  kind: WorkflowNode["kind"];
  mapIndex: number | null;
  nodeId: string;
  result: unknown;
  runId: string;
  startedAt: Date | string | null;
  status: WorkflowStepStatus | "unknown";
}
export interface WorkflowAttempt {
  endedAt: Date | string | null;
  failure: string | null;
  id: string;
  number: number;
  renderedPrompt: string;
  result: unknown;
  startedAt: Date | string;
  stepId: string;
}
export type WorkflowSchema = Record<string, unknown>;
export interface WorkflowWhen {
  op: "eq" | "neq" | "gt" | "lt" | "contains" | "matches" | "truthy" | "falsy";
  path: string;
  value?: unknown;
}
export interface WorkflowEdge {
  from: { node: string; port: string };
  id: string;
  maxIterations?: number;
  to: { node: string };
  when?: WorkflowWhen;
}
export interface WorkflowNodeBase {
  failedPorts?: string[];
  id: string;
  notes?: string;
  position: { x: number; y: number };
  title: string;
}
export interface WorkflowInput {
  default?: string;
  label: string;
  name: string;
  options?: string[];
  required: boolean;
  type: "text" | "path" | "select";
}
export type WorkflowCheckRule =
  | { kind: "schema"; schema: WorkflowSchema }
  | { kind: "regex"; path: string; pattern: string; mustMatch: boolean }
  | { kind: "forbidden-words"; path: string; words: string[] }
  | { kind: "file-exists"; path: string }
  | { kind: "command"; cmd: string; expectExit: number };
export type WorkflowNode = WorkflowNodeBase &
  (
    | { kind: "workflow"; workflowId: string; inputs: Record<string, string> }
    | { kind: "start"; inputs: WorkflowInput[] }
    | {
        kind: "step";
        harness: "claude" | "opencode" | "pi";
        model: string;
        effort?: EffortLevel;
        delegateType?: string;
        skills?: string[];
        denyTools?: string[];
        prompt: string;
        outputSchema: WorkflowSchema;
        context: { mode: "fresh" } | { mode: "continue"; from: string };
        retries?: number;
        timeoutMinutes?: number;
      }
    | { kind: "check"; rules: WorkflowCheckRule[] }
    | { kind: "branch"; cases: { port: string; when?: WorkflowWhen }[] }
    | { kind: "map"; over: string; body: WorkflowGraph; concurrency: number }
    | {
        kind: "ask";
        question: string;
        options: { label: string; description?: string }[];
        allowOther: boolean;
        answeredBy?: "operator" | "supervisor";
        waitFor?: number;
      }
    | { kind: "end"; outputs: Record<string, string> }
  );
export interface WorkflowGraph {
  edges: WorkflowEdge[];
  nodes: WorkflowNode[];
  settings?: {
    concurrency?: number;
    defaultProject?: string;
    defaultMachine?: string;
    defaultSupervisor?:
      | { delegateType: string }
      | { instanceId: string }
      | null;
  };
}
export interface Problem {
  edgeId?: string;
  line?: number;
  message: string;
  nodeId?: string;
}
export type WorkflowAction =
  | { type: "note"; text: string }
  | { type: "retry"; stepId: string }
  | { type: "answer"; stepId: string; choice: string; note?: string }
  | { type: "cancel" };

const TEMPLATE = /\{\{\s*([^{}]+?)\s*\}\}/g;
const PATH_PART = /^(?:[\w-]+|\d+)$/;
const ARRAY_PATH = /\[(\d+|\*)\]/g;
const ARRAY_INDEX = /^\d+$/;
export function workflowPath(scope: unknown, path: string): unknown {
  const parts = path.replace(ARRAY_PATH, ".$1").split(".");
  const read = (value: unknown, remaining: string[]): unknown => {
    if (!remaining.length) {
      return value;
    }
    const [key, ...rest] = remaining;
    if (key === "*" && Array.isArray(value)) {
      return value.map((item) => read(item, rest));
    }
    if (
      !PATH_PART.test(key) ||
      ["__proto__", "prototype", "constructor"].includes(key) ||
      value === null ||
      value === undefined
    ) {
      throw new Error(`Unresolved workflow path: ${path}`);
    }
    if (
      (typeof value === "object" || typeof value === "string") &&
      Object.hasOwn(new Object(value), key)
    ) {
      return read((value as Record<string, unknown>)[key], rest);
    }
    throw new Error(`Unresolved workflow path: ${path}`);
  };
  return read(scope, parts);
}
export function renderPrompt(template: string, scope: unknown): string {
  return template.replace(TEMPLATE, (_, path: string) => {
    const value = workflowPath(scope, path.trim());
    if (value === undefined) {
      throw new Error(`Unresolved workflow path: ${path}`);
    }
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
  });
}
export function evaluateWhen(
  cond: WorkflowWhen | undefined,
  result: unknown
): boolean {
  if (!cond) {
    return true;
  }
  const actual =
    cond.path === "result"
      ? result
      : workflowPath(
          cond.path.startsWith("result.") ? { result } : result,
          cond.path
        );
  switch (cond.op) {
    case "eq":
      return JSON.stringify(actual) === JSON.stringify(cond.value);
    case "neq":
      return JSON.stringify(actual) !== JSON.stringify(cond.value);
    case "gt":
      return (
        typeof actual === "number" &&
        typeof cond.value === "number" &&
        actual > cond.value
      );
    case "lt":
      return (
        typeof actual === "number" &&
        typeof cond.value === "number" &&
        actual < cond.value
      );
    case "contains":
      return typeof actual === "string"
        ? actual.includes(String(cond.value))
        : Array.isArray(actual) &&
            actual.some(
              (value) => JSON.stringify(value) === JSON.stringify(cond.value)
            );
    case "matches":
      return (
        typeof actual === "string" &&
        new RegExp(String(cond.value)).test(actual)
      );
    case "truthy":
      return Boolean(actual);
    case "falsy":
      return !actual;
    default:
      throw new Error("Unknown workflow condition operation");
  }
}
export function workflowPorts(node: WorkflowNode): string[] {
  switch (node.kind) {
    case "start":
      return ["out"];
    case "step":
    case "map":
    case "workflow":
      return ["out", "fail"];
    case "check":
      return ["pass", "fail"];
    case "branch":
      return node.cases.map((entry) => entry.port);
    case "ask":
      return [
        ...node.options.map((option) => option.label),
        ...(node.allowOther ? ["other"] : []),
      ];
    case "end":
      return [];
    default:
      return [];
  }
}
function schemaPath(schema: unknown, parts: string[]): boolean {
  if (!parts.length) {
    return true;
  }
  if (!schema || typeof schema !== "object") {
    return false;
  }
  const value = schema as WorkflowSchema;
  const [key, ...rest] = parts;
  if (value.type === "array") {
    return key === "length"
      ? !rest.length
      : (key === "*" || ARRAY_INDEX.test(key)) && schemaPath(value.items, rest);
  }
  const properties = value.properties as Record<string, unknown> | undefined;
  return (
    !!properties &&
    Object.hasOwn(properties, key) &&
    schemaPath(properties[key], rest)
  );
}
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: this validator accumulates all graph authoring problems instead of stopping at the first invalid node or edge.
export function validateWorkflow(
  graph: WorkflowGraph,
  options: {
    supervised?: boolean;
    inMap?: boolean;
    inputNames?: string[];
    workflowId?: string;
    resolveWorkflow?: (
      id: string
    ) => { id: string; name: string; graph: WorkflowGraph | null } | undefined;
    /**
     * Compiles the graph and typechecks the program, pinning each diagnostic
     * back onto the node that produced its line. Injected by the hub —
     * `workflowProgramCheck` in `@whiffle/core/workflow-sandbox` — so the
     * editor can run the graph rules without loading a TypeScript compiler.
     */
    checkProgram?: (graph: WorkflowGraph) => Problem[];
  } = {}
): Problem[] {
  const problems: Problem[] = [];
  if (!(graph && Array.isArray(graph.nodes) && Array.isArray(graph.edges))) {
    return [{ message: "A workflow needs nodes and edges arrays." }];
  }
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const add = (message: string, nodeId?: string, edgeId?: string) =>
    problems.push({ message, nodeId, edgeId });
  if (
    graph.settings?.concurrency !== undefined &&
    (!Number.isInteger(graph.settings.concurrency) ||
      graph.settings.concurrency < 1)
  ) {
    add("Workflow concurrency must be a positive integer.");
  }
  if (nodes.size !== graph.nodes.length) {
    add("Node ids must be unique.");
  }
  const starts = graph.nodes.filter((node) => node.kind === "start");
  if (starts.length !== 1) {
    add("Exactly one Start is required.");
  }
  const outgoing = (id: string) =>
    graph.edges.filter((edge) => edge.from.node === id);
  const reaches = (
    from: string,
    to: string,
    seen = new Set<string>()
  ): boolean => {
    if (from === to) {
      return true;
    }
    if (seen.has(from)) {
      return false;
    }
    seen.add(from);
    return outgoing(from).some((edge) => reaches(edge.to.node, to, seen));
  };
  if (starts[0]) {
    for (const node of graph.nodes) {
      if (!reaches(starts[0].id, node.id)) {
        add("Node is not reachable from Start.", node.id);
      }
    }
    if (
      !graph.nodes.some(
        (node) => node.kind === "end" && reaches(starts[0].id, node.id)
      )
    ) {
      add("An End must be reachable from Start.");
    }
  }
  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) {
      add("Edge ids must be unique.", undefined, edge.id);
    }
    edgeIds.add(edge.id);
    const from = nodes.get(edge.from.node);
    const to = nodes.get(edge.to.node);
    if (!(from && to)) {
      add("Edge names a missing node.", undefined, edge.id);
      continue;
    }
    if (!workflowPorts(from).includes(edge.from.port) || to.kind === "start") {
      add("Edge names an invalid port.", undefined, edge.id);
    }
    if (
      edge.maxIterations !== undefined &&
      (!Number.isInteger(edge.maxIterations) || edge.maxIterations < 1)
    ) {
      add("Max iterations must be a positive integer.", undefined, edge.id);
    }
  }
  // Removing bounded edges must leave a DAG; every remaining cycle needs a bound.
  const visited = new Set<string>();
  const stack = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id)) {
      return;
    }
    stack.add(id);
    for (const edge of outgoing(id).filter(
      (entry) => entry.maxIterations === undefined
    )) {
      if (stack.has(edge.to.node)) {
        add("Cycle-closing edge requires maxIterations.", undefined, edge.id);
      } else {
        visit(edge.to.node);
      }
    }
    stack.delete(id);
    visited.add(id);
  };
  for (const node of graph.nodes) {
    visit(node.id);
  }
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: each template namespace has its own structural contract and upstream check.
  const validPath = (path: string, node: WorkflowNode): boolean => {
    const parts = path.replace(ARRAY_PATH, ".$1").split(".");
    if (
      [
        "workspace",
        "attempt.number",
        "attempt.previousError",
        "attempt.gateFindings",
        "supervisor.note",
      ].includes(path)
    ) {
      return true;
    }
    if (parts[0] === "map") {
      return !!options.inMap && ["item", "index"].includes(parts[1]);
    }
    if (parts[0] === "inputs") {
      return (
        parts.length === 2 &&
        (!!starts[0]?.inputs.some((input) => input.name === parts[1]) ||
          !!options.inputNames?.includes(parts[1]))
      );
    }
    if (parts[0] !== "steps" || parts[2] !== "result") {
      return false;
    }
    const source = nodes.get(parts[1]);
    if (!source || source.id === node.id || !reaches(source.id, node.id)) {
      return false;
    }
    if (source.kind === "step") {
      return schemaPath(source.outputSchema, parts.slice(3));
    }
    if (parts.length === 3) {
      return true;
    }
    if (source.kind === "ask") {
      return parts.length === 4 && ["choice", "note"].includes(parts[3]);
    }
    if (source.kind === "map") {
      return ["items", "failed"].includes(parts[3]);
    }
    return true;
  };
  for (const node of graph.nodes) {
    const templates: string[] = [];
    if (["step", "check", "branch", "ask", "workflow"].includes(node.kind)) {
      for (const port of workflowPorts(node)) {
        if (
          !(
            outgoing(node.id).some((edge) => edge.from.port === port) ||
            node.failedPorts?.includes(port)
          )
        ) {
          add(
            `Output port "${port}" must be wired or marked as ending the run as failed.`,
            node.id
          );
        }
      }
    }
    if (node.kind === "workflow") {
      const child = options.resolveWorkflow?.(node.workflowId);
      if (child?.graph) {
        const childStart = child.graph.nodes.find(
          (entry) => entry.kind === "start"
        );
        if (childStart?.kind === "start") {
          for (const input of childStart.inputs) {
            if (input.required && !Object.hasOwn(node.inputs, input.name)) {
              add(`Child input ${input.name} must be mapped.`, node.id);
            }
          }
        }
      } else {
        add(`Workflow target ${node.workflowId} does not exist.`, node.id);
      }
      for (const value of Object.values(node.inputs)) {
        if (value.includes("{{")) {
          templates.push(value);
        } else if (!validPath(value, node)) {
          add(`Unresolved workflow path: ${value}`, node.id);
        }
      }
    } else if (node.kind === "step") {
      if (
        !(
          ["claude", "opencode", "pi"].includes(node.harness) &&
          node.model?.trim()
        )
      ) {
        add("A step needs a supported harness and a model.", node.id);
      }
      if (
        !(node.context && ["fresh", "continue"].includes(node.context.mode))
      ) {
        add("A step needs a fresh or continue context policy.", node.id);
      }
      templates.push(node.prompt);
      if (node.outputSchema?.type !== "object") {
        add("Result schema must have an object root.", node.id);
      }
      if (
        node.retries !== undefined &&
        (!Number.isInteger(node.retries) ||
          node.retries < 0 ||
          node.retries > 5)
      ) {
        add("Retries must be between 0 and 5.", node.id);
      }
      if (node.timeoutMinutes !== undefined && !(node.timeoutMinutes > 0)) {
        add("Timeout must be positive.", node.id);
      }
      if (node.denyTools?.length && node.harness !== "claude") {
        add("Denied tools are supported only by Claude.", node.id);
      }
      if (node.harness === "pi" && node.effort) {
        add("The pi harness cannot enforce an effort level.", node.id);
      }
      if (node.context?.mode === "continue") {
        const source = nodes.get(node.context.from);
        if (
          source?.kind !== "step" ||
          source.harness !== node.harness ||
          source.id === node.id ||
          !reaches(source.id, node.id)
        ) {
          add(
            "Continue requires an upstream step using the same harness.",
            node.id
          );
        }
      }
    } else if (node.kind === "ask") {
      if (
        node.waitFor !== undefined &&
        (!Number.isFinite(node.waitFor) || node.waitFor <= 0)
      ) {
        add("Ask expiry must be a positive number of hours.", node.id);
      }
      templates.push(
        node.question,
        ...node.options.map((option) => option.label)
      );
      if (options.inMap) {
        add("Map bodies cannot contain Ask nodes.", node.id);
      }
      if (
        node.answeredBy === "supervisor" &&
        !(options.supervised ?? !!graph.settings?.defaultSupervisor)
      ) {
        add("This Ask requires a supervisor.", node.id);
      }
    } else if (node.kind === "map") {
      if (!Number.isInteger(node.concurrency) || node.concurrency < 1) {
        add("Map concurrency must be a positive integer.", node.id);
      }
      if (!validPath(node.over, node)) {
        add(`Unresolved workflow path: ${node.over}`, node.id);
      }
      problems.push(
        ...validateWorkflow(node.body, {
          ...options,
          inMap: true,
          inputNames:
            options.inputNames ?? starts[0]?.inputs.map((input) => input.name),
        })
      );
    } else if (node.kind === "branch") {
      if (
        !node.cases.length ||
        node.cases.at(-1)?.when ||
        node.cases.slice(0, -1).some((entry) => !entry.when)
      ) {
        add("Branch needs ordered conditions and a final else case.", node.id);
      }
    } else if (node.kind === "end") {
      for (const path of Object.values(node.outputs)) {
        if (!validPath(path, node)) {
          add(`Unresolved workflow path: ${path}`, node.id);
        }
      }
    } else if (node.kind === "check") {
      for (const rule of node.rules) {
        if (rule.kind === "command") {
          templates.push(rule.cmd);
        }
        if (rule.kind === "file-exists") {
          templates.push(rule.path);
        }
        if (rule.kind === "schema" && rule.schema?.type !== "object") {
          add("Check schema must have an object root.", node.id);
        }
      }
    }
    for (const template of templates) {
      if (typeof template !== "string") {
        add("Templates must be text.", node.id);
        continue;
      }
      const remaining = template.replace(TEMPLATE, "");
      if (remaining.includes("{{") || remaining.includes("}}")) {
        add("Malformed workflow placeholder.", node.id);
      }
      for (const match of template.matchAll(TEMPLATE)) {
        if (!validPath(match[1].trim(), node)) {
          add(`Unresolved workflow path: ${match[1].trim()}`, node.id);
        }
      }
    }
  }
  if (options.workflowId && options.resolveWorkflow) {
    const calls = (
      candidate: WorkflowGraph
    ): Extract<WorkflowNode, { kind: "workflow" }>[] =>
      candidate.nodes.flatMap((node) => {
        if (node.kind === "workflow") {
          return [node];
        }
        if (node.kind === "map") {
          return calls(node.body);
        }
        return [];
      });
    const walk = (candidate: WorkflowGraph, ids: string[], names: string[]) => {
      for (const call of calls(candidate)) {
        const child = options.resolveWorkflow?.(call.workflowId);
        if (!child?.graph) {
          continue;
        }
        if (ids.includes(child.id)) {
          add(
            `Workflow call cycle: ${[...names, child.name].join(" → ")}`,
            call.id
          );
          continue;
        }
        walk(
          child.id === options.workflowId ? graph : child.graph,
          [...ids, child.id],
          [...names, child.name]
        );
      }
    };
    walk(
      graph,
      [options.workflowId],
      [options.resolveWorkflow(options.workflowId)?.name ?? options.workflowId]
    );
  }
  if (!(problems.length || options.inMap) && options.checkProgram) {
    problems.push(...options.checkProgram(graph));
  }
  return problems;
}
