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
  | "ask"
  | "exec"
  | "exists"
  | "jev"
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
/**
 * One question on a Jev node, as the editor holds it. Choice options are rows
 * (name + meaning) so a half-typed option can exist while it is edited; the
 * compiler turns them into the API's `{ name: meaning }` criteria.
 */
export type JevNodeQuestion =
  | {
      id: string;
      type: "noul";
      instructions: string;
      criteria?: { true?: string; false?: string };
    }
  | {
      id: string;
      type: "choice";
      instructions: string;
      criteria: { option: string; meaning: string }[];
    }
  | { id: string; type: "score"; instructions: string; criteria: string[] };
/** The fields each Jev answer type carries, for paths and the editor. */
export const JEV_ANSWER_FIELDS: Record<JevNodeQuestion["type"], string[]> = {
  noul: ["type", "noul"],
  choice: ["type", "choice", "probabilities", "confidence"],
  score: ["type", "score", "legend", "probabilities", "confidence"],
};
/** TypeSafe's limits on a question's criteria (https://docs.typesafe.ai/api.md). */
export const JEV_CHOICE_MAX = 255;
export const JEV_SCORE_LEVELS = [2, 10] as const;
export type WorkflowNode = WorkflowNodeBase &
  (
    | { kind: "workflow"; workflowId: string; inputs: Record<string, string> }
    | {
        kind: "jev";
        /** A template; text that parses as a JSON object or array goes as structured state. */
        state: string;
        questions: JevNodeQuestion[];
        model?: string;
      }
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
    case "jev":
      // `fail` is taken when the node's call rejects: a step out of retries,
      // a failed child run, a Jev error. Unwired, the failure fails the run.
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
/** The schema node a result path lands on, or undefined when it names none. */
function schemaAt(
  schema: unknown,
  parts: string[]
): WorkflowSchema | undefined {
  if (!schema || typeof schema !== "object") {
    return undefined;
  }
  const value = schema as WorkflowSchema;
  if (!parts.length) {
    return value;
  }
  const [key, ...rest] = parts;
  if (value.type === "array") {
    return key === "*" || ARRAY_INDEX.test(key)
      ? schemaAt(value.items, rest)
      : undefined;
  }
  const properties = value.properties as Record<string, unknown> | undefined;
  return properties && Object.hasOwn(properties, key)
    ? schemaAt(properties[key], rest)
    : undefined;
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
/**
 * Whether `sourceId`'s outcome is set wherever `nodeId` runs: its result when
 * every path from Start to `nodeId` leaves `sourceId` by a port other than
 * `fail`, its failure when every such path leaves it by `fail`. A plain
 * `steps.<source>.result…` / `.failure…` reference needs this; one written
 * `steps.<source>?.…` accepts that the value may be absent.
 */
export function outcomeOnEveryPath(
  graph: WorkflowGraph,
  sourceId: string,
  nodeId: string,
  outcome: "result" | "failure"
): boolean {
  const start = graph.nodes.find((node) => node.kind === "start");
  if (!start || sourceId === nodeId) {
    return false;
  }
  const carries = (edge: WorkflowEdge) =>
    outcome === "failure"
      ? edge.from.port === "fail"
      : edge.from.port !== "fail";
  // Walk from Start without ever leaving the source with that outcome: any
  // way that still arrives at the node is a path on which it is unset.
  const seen = new Set<string>();
  const pending = [start.id];
  while (pending.length) {
    const id = pending.pop() as string;
    if (id === nodeId) {
      return false;
    }
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    for (const edge of graph.edges) {
      if (edge.from.node === id && !(id === sourceId && carries(edge))) {
        pending.push(edge.to.node);
      }
    }
  }
  return true;
}

/**
 * A `steps.` reference taken apart: the node, whether it is written as an
 * optional read (`steps.<id>?.…`), and the rest of the path.
 */
export function stepReference(parts: string[]): {
  id: string;
  optional: boolean;
} {
  const optional = parts[1]?.endsWith("?") ?? false;
  return { id: optional ? parts[1].slice(0, -1) : (parts[1] ?? ""), optional };
}

const JEV_ID = /^[A-Za-z][\w-]*$/;
const JEV_USAGE = ["inputTokens", "outputTokens", "costUsd"];

/** Whether `steps.<jev>.result.<parts>` names something a Jev call returns. */
function jevPath(
  node: Extract<WorkflowNode, { kind: "jev" }>,
  parts: string[]
): boolean {
  const [head, id, field, key, ...rest] = parts;
  if (head === undefined) {
    return true;
  }
  if (head === "model") {
    return id === undefined;
  }
  if (head === "usage") {
    return id === undefined || (JEV_USAGE.includes(id) && field === undefined);
  }
  if (head !== "answers") {
    return false;
  }
  if (id === undefined) {
    return true;
  }
  const question = node.questions.find((entry) => entry.id === id);
  if (!question) {
    return false;
  }
  if (field === undefined) {
    return true;
  }
  if (!JEV_ANSWER_FIELDS[question.type].includes(field)) {
    return false;
  }
  if (key === undefined) {
    return true;
  }
  if (rest.length) {
    return false;
  }
  if (question.type === "choice") {
    return (
      field === "probabilities" &&
      question.criteria.some((entry) => entry.option === key)
    );
  }
  if (question.type === "score") {
    return (
      (field === "probabilities" || field === "legend") &&
      ARRAY_INDEX.test(key) &&
      Number(key) < question.criteria.length
    );
  }
  return false;
}

/** A Jev node's question rules: what TypeSafe would refuse, said up front. */
export function jevProblems(questions: JevNodeQuestion[]): string[] {
  const problems: string[] = [];
  if (!questions.length) {
    problems.push("A Jev node needs at least one question.");
  }
  const ids = new Set<string>();
  for (const question of questions) {
    const name = question.id || "(unnamed)";
    if (!JEV_ID.test(question.id)) {
      problems.push(
        `Question id "${name}" must start with a letter and use only letters, digits, _ or -.`
      );
    }
    if (ids.has(question.id)) {
      problems.push(`Question id "${name}" is used twice.`);
    }
    ids.add(question.id);
    if (!question.instructions.trim()) {
      problems.push(`Question "${name}" needs instructions.`);
    }
    problems.push(...criteriaProblems(question, name));
  }
  return problems;
}

/** What each question type's criteria must hold. */
function criteriaProblems(question: JevNodeQuestion, name: string): string[] {
  const problems: string[] = [];
  if (question.type === "noul") {
    if (
      !question.criteria?.true?.trim() !== !question.criteria?.false?.trim()
    ) {
      problems.push(
        `Noul "${name}" needs both what yes means and what no means, or neither.`
      );
    }
  } else if (question.type === "choice") {
    const options = question.criteria.map((entry) => entry.option.trim());
    if (options.length < 2 || options.length > JEV_CHOICE_MAX) {
      problems.push(
        `Choice "${name}" needs between 2 and ${JEV_CHOICE_MAX} options.`
      );
    }
    if (options.some((option) => !option)) {
      problems.push(`Every option of "${name}" needs a name.`);
    }
    if (new Set(options).size !== options.length) {
      problems.push(`Choice "${name}" names an option twice.`);
    }
  } else {
    const [min, max] = JEV_SCORE_LEVELS;
    if (question.criteria.length < min || question.criteria.length > max) {
      problems.push(`Score "${name}" needs between ${min} and ${max} levels.`);
    }
    if (question.criteria.some((level) => !level.trim())) {
      problems.push(`Every level of "${name}" needs a description.`);
    }
  }
  return problems;
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
  /**
   * `steps.<source>.failure[.message|.kind]`: only where the source's `fail`
   * edge leads, since only there did the source fail.
   */
  const failurePath = (
    sourceId: string,
    rest: string[],
    node: WorkflowNode
  ): boolean =>
    sourceId !== node.id &&
    graph.edges.some(
      (edge) =>
        edge.from.node === sourceId &&
        edge.from.port === "fail" &&
        reaches(edge.to.node, node.id)
    ) &&
    (rest.length === 0 ||
      (rest.length === 1 && ["message", "kind"].includes(rest[0])));
  /**
   * A map goes over an array. Launch inputs are text, so never one; a step's
   * result is one where its schema says `array` at that path.
   */
  const mapOverProblem = (over: string): string | undefined => {
    const parts = over.replace(ARRAY_PATH, ".$1").split(".");
    if (parts[0] === "inputs") {
      return `Map needs an array to go over; the input ${parts[1]} is text. Map over a step result's array.`;
    }
    const source =
      parts[0] === "steps" ? nodes.get(stepReference(parts).id) : undefined;
    if (source?.kind === "step" && parts[2] === "result") {
      const at = schemaAt(source.outputSchema, parts.slice(3));
      if (at?.type !== "array") {
        return `Map needs an array to go over; ${over} is not an array in ${source.title}'s result schema.`;
      }
    }
    return undefined;
  };
  /**
   * What is wrong with a path at this node, if anything: a path that names
   * nothing, or a plain step reference to a value that some path to the node
   * leaves unset — that one must be written as an optional read.
   */
  const pathProblem = (
    path: string,
    node: WorkflowNode
  ): string | undefined => {
    if (!validPath(path, node)) {
      return `Unresolved workflow path: ${path}`;
    }
    const parts = path.replace(ARRAY_PATH, ".$1").split(".");
    if (parts[0] !== "steps") {
      return undefined;
    }
    const { id, optional } = stepReference(parts);
    const outcome = parts[2] === "failure" ? "failure" : "result";
    if (optional || outcomeOnEveryPath(graph, id, node.id, outcome)) {
      return undefined;
    }
    const rest = parts.slice(2).join(".");
    return outcome === "failure"
      ? `steps.${id} fails only on some paths to "${node.title}"; read it as steps.${id}?.${rest} to accept that it may be absent.`
      : `steps.${id} runs only on some paths to "${node.title}"; read it as steps.${id}?.${rest} to accept that it may be absent.`;
  };
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
    const { id } = stepReference(parts);
    if (parts[0] === "steps" && parts[2] === "failure") {
      return failurePath(id, parts.slice(3), node);
    }
    if (parts[0] !== "steps" || parts[2] !== "result") {
      return false;
    }
    const source = nodes.get(id);
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
      // What the compiler returns for a map: `{ items }`, one per item.
      return parts[3] === "items";
    }
    if (source.kind === "jev") {
      return jevPath(source, parts.slice(3));
    }
    return true;
  };
  for (const node of graph.nodes) {
    const templates: string[] = [];
    /** Every path this node reads, bare or from inside its templates. */
    const paths: string[] = [];
    if (
      ["step", "check", "branch", "ask", "workflow", "jev"].includes(node.kind)
    ) {
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
        } else {
          paths.push(value);
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
    } else if (node.kind === "jev") {
      templates.push(node.state);
      for (const message of jevProblems(node.questions)) {
        add(message, node.id);
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
      paths.push(node.over);
      const overProblem = mapOverProblem(node.over);
      if (overProblem) {
        add(overProblem, node.id);
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
      paths.push(...Object.values(node.outputs));
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
        paths.push(match[1].trim());
      }
    }
    for (const path of paths) {
      const problem = pathProblem(path, node);
      if (problem) {
        add(problem, node.id);
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
