/**
 * The hand-off tools' shared logic, apart from any harness.
 *
 * A session hands work to another session through six tools — list the fleet,
 * hand a note to a peer, start a new session, delegate to a sub-session, and
 * stop or interrupt one of its own delegates — and their bodies are the same
 * whichever harness exposes them: the roster is read off the hub over HTTP, the
 * note is an envelope the daemon already knows how to send. Each harness wraps
 * these in its own tool mechanism (claude's in-process MCP server, pi's
 * `customTools`), and this file is the body they share.
 */
import type {
  DelegateType,
  Envelope,
  GeneratedImage,
  ImageGenerationRequest,
  InstanceRow,
  PermissionResult,
  PreviewSource,
  SendPayload,
  SpawnPayload,
  WorkflowAction,
} from "@whiffle/core";
import {
  delegateTypeProblem,
  handoffMarker,
  IMAGE_GENERATION_TIMEOUT_MS,
  QUESTION_DISMISSED,
  WHIFFLE_ENV,
  WHIFFLE_HUB_PORT,
} from "@whiffle/core";
import type { WorkItemCheck, WorkItemSubmission } from "./db/schema";

const WS_SCHEME = /^ws/;
const WS_PATH_SUFFIX = /\/ws$/;

/** Where the hub answers REST, derived from the websocket url the daemon uses. */
export const hubHttpUrl = (): string => {
  const ws =
    process.env[WHIFFLE_ENV.hubUrl] ??
    `ws://localhost:${process.env[WHIFFLE_ENV.hubPort] ?? WHIFFLE_HUB_PORT}/ws`;
  return ws.replace(WS_SCHEME, "http").replace(WS_PATH_SUFFIX, "");
};

/**
 * The fleet's delegate types (`@whiffle/core`'s `DelegateType`), read once
 * per session. There is no fleet sync path for them yet (unlike MCP servers
 * and skills) — a daemon fetches this directly from the hub it already knows
 * the address of, right before it builds the `delegate` tool's description,
 * and the caller freezes what comes back for the session's whole life.
 * Failures are logged and passed to the caller for its startup instructions.
 * A valid empty catalog remains distinct from a failed fetch.
 * Descriptions take a startup snapshot. Catalog reads and named dispatch fetch
 * again so saved routing changes apply to sessions already running.
 */
export async function fetchDelegateTypes(
  onError?: (message: string) => void
): Promise<DelegateType[]> {
  try {
    const res = await fetch(`${hubHttpUrl()}/api/delegate-types`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const body = (await res.json()) as { types?: DelegateType[] } | null;
    if (
      !Array.isArray(body?.types) ||
      body.types.some((type) => !type || delegateTypeProblem(type))
    ) {
      throw new Error("Invalid delegate catalog response");
    }
    return body.types;
  } catch (error) {
    const message = `Could not load delegate types: ${error instanceof Error ? error.message : String(error)}`;
    console.warn(`[whiffle] ${message}`);
    onError?.(message);
    return [];
  }
}

/** The last path segment — how the rail names a session, and how the model will. */
const leafOf = (path: string): string =>
  path.split("/").filter(Boolean).pop() ?? path;

interface Peer {
  host: string;
  label: string;
  name: string;
  row: InstanceRow;
}

/** Enough of a UUID to name one session among a fleet's worth. */
const shortId = (id: string): string => id.slice(0, 8);

/** How long ago the row moved, for a reader choosing between identical names. */
const ageOf = (at: InstanceRow["updatedAt"]): string => {
  if (!at) {
    return "age unknown";
  }
  const ms = Date.now() - new Date(at).getTime();
  if (!Number.isFinite(ms) || ms < 0) {
    return "age unknown";
  }
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) {
    return "active now";
  }
  if (minutes < 60) {
    return `active ${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  return hours < 24
    ? `active ${hours}h ago`
    : `active ${Math.round(hours / 24)}d ago`;
};

/** The raw rows behind the roster, before the running/starting narrowing. */
async function fetchInstances(): Promise<{
  rows: InstanceRow[];
  hosts: Map<string, string>;
}> {
  const base = hubHttpUrl();
  const [instancesRes, agentsRes] = await Promise.all([
    fetch(`${base}/api/instances`, { signal: AbortSignal.timeout(5000) }),
    fetch(`${base}/api/agents`, { signal: AbortSignal.timeout(5000) }).catch(
      () => undefined
    ),
  ]);
  if (!instancesRes.ok) {
    throw new Error(`the hub answered ${instancesRes.status}`);
  }
  const rows = (await instancesRes.json()) as InstanceRow[];
  const hosts = new Map<string, string>();
  if (agentsRes?.ok) {
    const agents = (await agentsRes.json()) as {
      machineId: string;
      hostname: string;
    }[];
    for (const agent of agents) {
      hosts.set(agent.machineId, agent.hostname);
    }
  }
  return { rows, hosts };
}

const toPeer = (row: InstanceRow, hosts: Map<string, string>): Peer => {
  const name = leafOf(row.cwd);
  return {
    row,
    name,
    label: `${name}#${shortId(row.id)}`,
    host: hosts.get(row.machineId) ?? row.machineId,
  };
};

/**
 * The fleet, read from the hub rather than from this daemon's own sessions:
 * the whole point is reaching a session that is usually somewhere else.
 */
async function roster(exceptInstanceId: string): Promise<{
  peers: Peer[];
  asleep: Peer[];
  own: InstanceRow | undefined;
}> {
  const { rows, hosts } = await fetchInstances();
  const own = rows.find((row) => row.id === exceptInstanceId);
  const others = rows.filter((row) => row.id !== exceptInstanceId);
  const peers = others
    .filter((row) => row.status === "running" || row.status === "starting")
    .map((row) => toPeer(row, hosts));
  // What a send wakes (the hub's `wakeForSend`): no process, a conversation
  // on record.
  const asleep = others
    .filter(
      (row) =>
        row.sessionId &&
        (row.status === "sleeping" ||
          row.status === "error" ||
          row.status === "stopped")
    )
    .map((row) => toPeer(row, hosts));
  return { peers, asleep, own };
}

/** An `@` prefix on a target name, optional. */
const AT_PREFIX = /^@/;

const needleOf = (target: string): string =>
  target.trim().toLowerCase().replace(AT_PREFIX, "");

/** The one session a full id, or a short id of six or more characters, names. */
function resolveById(peers: Peer[], target: string): Peer | undefined {
  const needle = needleOf(target);
  const byId = peers.find((peer) => peer.row.id === needle);
  if (byId) {
    return byId;
  }
  const idPart = needle.includes("#")
    ? (needle.split("#").pop() ?? "")
    : needle;
  if (idPart.length < 6) {
    return;
  }
  const byShortId = peers.filter((peer) => peer.row.id.startsWith(idPart));
  return byShortId.length === 1 ? byShortId[0] : undefined;
}

/**
 * A hand-off's target: a running session by any name {@link resolve} takes,
 * else a sleeping one by its id. Only by id — a name would match among every
 * session that ever ran here. The hub wakes a sleeping target to read it.
 */
function resolveHandoff(peers: Peer[], asleep: Peer[], target: string): Peer {
  try {
    return resolve(peers, target);
  } catch (error) {
    const sleeping = resolveById(asleep, target);
    if (sleeping) {
      return sleeping;
    }
    throw error;
  }
}

/** Resolves what the model typed to one session; ambiguity is reported, not guessed. */
function resolve(peers: Peer[], target: string): Peer {
  const needle = needleOf(target);
  const byId = resolveById(peers, target);
  if (byId) {
    return byId;
  }

  const exact = peers.filter((peer) => peer.name.toLowerCase() === needle);
  if (exact.length === 1) {
    return exact[0];
  }

  const partial = peers.filter((peer) =>
    peer.name.toLowerCase().includes(needle)
  );
  const candidates = exact.length > 1 ? exact : partial;
  if (candidates.length === 1) {
    return candidates[0];
  }
  if (candidates.length === 0) {
    const known =
      peers.map((peer) => peer.label).join(", ") || "none are running";
    throw new Error(
      `No running session matches "${target}". Running now: ${known}.`
    );
  }
  const listed = candidates
    .map(
      (peer) => `${peer.label} on ${peer.host} (${ageOf(peer.row.updatedAt)})`
    )
    .join(", ");
  throw new Error(
    `"${target}" matches ${candidates.length} sessions: ${listed}. ` +
      "Name one by its short id — and if you cannot tell them apart, ask rather than guess."
  );
}

/**
 * The tools a leaf delegate (`canDelegate === false`) never gets: everything
 * that spawns or steers a spawn. One set for the claude and pi toolsets (the
 * opencode plugin refuses at call time instead, having no per-session
 * toolset). Fixed for the session's life, so the prompt cache is unaffected.
 */
export const SPAWNING_TOOLS: ReadonlySet<string> = new Set([
  "run_workflow",
  "steer_workflow",
  "workflow_read",
  "list_workflows",
  "create_workflow",
  "update_workflow",
  "start_session",
  "continue_session",
  "delegate",
  "stop_delegate",
  "interrupt_delegate",
  "answer_delegate",
  "set_item_checks",
]);

export interface HandoffDeps {
  /**
   * Whether THIS session may spawn sessions of its own. `false` on a leaf
   * delegate (spawned with `can_delegate: false`); absent means allowed.
   */
  readonly canDelegate?: boolean;
  /** What it is working on, so the receiver knows who is calling. */
  readonly cwd: string;
  /**
   * The fleet's delegate types, fetched once via {@link fetchDelegateTypes}
   * before this session's tools were built. Used for descriptions only;
   * dispatch reads the live catalog. delegateTypesError records a failed fetch.
   */
  readonly delegateTypes?: DelegateType[];
  readonly delegateTypesError?: string;
  /** Puts an envelope on the daemon's hub socket. */
  readonly emit: (envelope: Envelope) => void;
  readonly harness?: "claude" | "opencode" | "pi";
  /** The session doing the handing over. */
  readonly instanceId: string;
  readonly workflowRunId?: string;
  readonly workflowStepId?: string;
  /** Whether this session runs a work item with acceptance checks: it gets finish_item. */
  readonly workItem?: boolean;
}

/** The three hand-off actions, each answering with the text the tool returns. */
export interface HandoffActions {
  /**
   * Answers a delegate's parked ask. `answers` is keyed by the exact question
   * text, each value the chosen option label; `deny` refuses it. Neither means
   * "allow with no changes" — the tool ask's own input stands.
   */
  // biome-ignore lint/style/useConsistentMethodSignatures: implemented below; property-style would change parameter variance against that implementation
  answerDelegate(
    target: string,
    requestId: string,
    answers?: Record<string, string>,
    deny?: boolean
  ): Promise<string>;
  /**
   * Summarises a session (this one when `session` is omitted) with the chosen
   * summariser and starts a new session seeded with the summary, through the
   * hub's own continuation.
   */
  readonly continueSession: (input: {
    session?: string;
    summarizer_harness: "claude" | "opencode" | "pi";
    summarizer_model: string;
    target_harness: "claude" | "opencode" | "pi";
    target_model: string;
    note?: string;
  }) => Promise<{
    summariserInstanceId: string | null;
    targetInstanceId: string;
    text: string;
  }>;
  readonly createWorkflow: (name: string, program: string) => Promise<unknown>;
  /**
   * Starts a work item: a fresh session or a fork of this one in a new workspace, or the follow-up
   * in an existing one, on the session that workspace's last item ran. The
   * hub decides and files everything; this is its request.
   */
  // biome-ignore lint/style/useConsistentMethodSignatures: implemented below; property-style would change parameter variance against that implementation
  delegate(
    prompt: string,
    opts: {
      /** What the caller named the work: the item's and its session's title. */
      title: string;
      /** The repository a new workspace is cut from; this session's directory by default. */
      cwd?: string;
      harness?: "claude" | "opencode" | "pi";
      model?: string;
      skills?: string[];
      /**
       * A named preset from the fleet's delegate types. Its harness/model/
       * effort/skills/denyTools apply first; an explicit `harness`/`model`/
       * `skills` above still overrides what the type says.
       */
      type?: string;
      /**
       * Whether the new delegate may itself delegate/start sessions; default
       * false — a delegate is a leaf unless granted.
       */
      canDelegate?: boolean;
      /** An existing workspace's id: the new item is its follow-up. */
      workspace?: string;
      /** The item's session forks this conversation, in a new workspace. */
      fork?: boolean;
      /** The item's acceptance checks, run by the hub at finish_item. */
      checks: WorkItemCheck[];
    }
  ): Promise<DelegateResult>;
  /**
   * Finishes this session's work item: the hub runs its checks, or fails it
   * as blocked. Answers what the hub says of the results.
   */
  readonly finishItem: (request: WorkItemSubmission) => Promise<string>;
  readonly generateImage: (
    request: ImageGenerationRequest
  ) => Promise<GeneratedImage>;
  // biome-ignore lint/style/useConsistentMethodSignatures: implemented below; property-style would change parameter variance against that implementation
  handoff(target: string, message: string, urgent?: boolean): Promise<string>;
  // biome-ignore lint/style/useConsistentMethodSignatures: implemented below; property-style would change parameter variance against that implementation
  interruptDelegate(target: string): Promise<string>;
  readonly listDelegateTypes: () => Promise<{ types: DelegateType[] }>;
  // biome-ignore lint/style/useConsistentMethodSignatures: implemented below; property-style would change parameter variance against that implementation
  listSessions(): Promise<string>;
  readonly listWorkflows: () => Promise<unknown>;
  /** A window into one result of a run this session supervises. */
  readonly readWorkflow: (
    runId: string,
    request: {
      ref: number | "result";
      path?: string;
      offset?: number;
      limit?: number;
    }
  ) => Promise<string>;
  readonly readWorkflowState: (name: string) => Promise<{ value: unknown }>;
  readonly runWorkflow: (
    name: string,
    inputs: Record<string, unknown>,
    options?: { workspace?: { path: string; machineId: string } }
  ) => Promise<{ runId: string }>;
  /** Pushes a note to the owner's Telegram — no peer, no ask, fire-and-forget. */
  // biome-ignore lint/style/useConsistentMethodSignatures: implemented below; property-style would change parameter variance against that implementation
  sendToUser(message: string, attachments?: string[]): Promise<string>;
  /**
   * Replaces the whole list of acceptance checks on one of this session's
   * delegates' running work items. Answers what the hub says it did.
   */
  readonly setItemChecks: (
    target: string,
    checks: WorkItemCheck[]
  ) => Promise<string>;
  readonly showPreview: (source: PreviewSource) => Promise<string>;
  // biome-ignore lint/style/useConsistentMethodSignatures: implemented below; property-style would change parameter variance against that implementation
  startSession(
    cwd: string,
    prompt: string,
    title: string,
    sideQuest?: boolean,
    model?: string
  ): Promise<HandoffResult>;
  readonly steerWorkflow: (
    runId: string,
    action: WorkflowAction
  ) => Promise<unknown>;
  // biome-ignore lint/style/useConsistentMethodSignatures: implemented below; property-style would change parameter variance against that implementation
  stopDelegate(target: string): Promise<string>;
  readonly submitResult: (result: unknown) => Promise<string>;
  readonly updateWorkflow: (name: string, program: string) => Promise<unknown>;
  readonly writeWorkflowState: (
    name: string,
    value: unknown
  ) => Promise<string>;
}

/** The structured result of startSession / delegate — the id, title, and the model-facing prose. */
export interface HandoffResult {
  id: string;
  text: string;
  title: string;
}

/** A delegation's result: its session, and the work item and workspace it runs in. */
export interface DelegateResult extends HandoffResult {
  workItemId: string;
  workspaceId: string;
}

/** A work item as the hub answers for it (`GET /api/work-items/:id`). */
interface WorkItemView {
  id: string;
  state: string;
  title: string;
  workspaceId: string;
}

/** Resolves a target among the caller's own delegates; anything else is refused. */
function resolveDelegate(
  peers: Peer[],
  target: string,
  instanceId: string
): Peer {
  const mine = peers.filter((peer) => peer.row.parentInstanceId === instanceId);
  try {
    return resolve(mine, target);
  } catch (error) {
    let outside = false;
    try {
      resolve(peers, target);
      outside = true;
    } catch {
      outside = false;
    }
    if (outside) {
      throw new Error(
        `"${target}" is not your delegate — you can only stop or interrupt your own delegates.`,
        { cause: error }
      );
    }
    throw error;
  }
}

async function saveWorkflowProgram(
  method: string,
  path: string,
  body: { name?: string; program: string }
): Promise<unknown> {
  const response = await fetch(`${hubHttpUrl()}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    if (response.headers.get("content-type")?.includes("application/json")) {
      const refused = JSON.parse(text) as { problems?: { message: string }[] };
      if (refused.problems) {
        throw new Error(
          refused.problems.map((problem) => problem.message).join("\n")
        );
      }
    }
    throw new Error(text);
  }
  return response.json();
}

export const handoffActions = ({
  instanceId,
  workflowRunId,
  workflowStepId,
  cwd,
  harness: callerHarness,
  emit,
}: HandoffDeps): HandoffActions => ({
  async continueSession(input) {
    let source = instanceId;
    if (input.session) {
      const { rows, hosts } = await fetchInstances();
      source = resolve(
        rows.map((row) => toPeer(row, hosts)),
        input.session
      ).row.id;
    }
    const response = await fetch(
      `${hubHttpUrl()}/api/instances/${encodeURIComponent(source)}/continue`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          summarizer: {
            harness: input.summarizer_harness,
            model: input.summarizer_model,
          },
          target: { harness: input.target_harness, model: input.target_model },
          ...(input.note ? { note: input.note } : {}),
        }),
      }
    );
    if (!response.ok) {
      throw new Error(await response.text());
    }
    // The hub runs the continuation as its own job; this waits for its report.
    const { continuationId } = (await response.json()) as {
      continuationId: string;
    };
    const outcome = await fetch(
      `${hubHttpUrl()}/api/continuations/${encodeURIComponent(continuationId)}/outcome`
    );
    if (!outcome.ok) {
      throw new Error(await outcome.text());
    }
    const done = (await outcome.json()) as {
      summariserInstanceId: string | null;
      targetInstanceId: string;
      opening: string;
    };
    return {
      summariserInstanceId: done.summariserInstanceId,
      targetInstanceId: done.targetInstanceId,
      text:
        `Continued session ${source} in a new ${input.target_harness} session ` +
        `${done.targetInstanceId} on ${input.target_model}. ` +
        (done.summariserInstanceId
          ? `${input.summarizer_harness}/${input.summarizer_model} summarised it. `
          : "It was short enough that no summary was needed. ") +
        `The source session was not touched. The new session opened with:\n\n${done.opening}`,
    };
  },
  createWorkflow(name, program) {
    return saveWorkflowProgram("POST", "/api/workflows", { name, program });
  },
  updateWorkflow(name, program) {
    return saveWorkflowProgram(
      "PUT",
      `/api/workflows/${encodeURIComponent(name)}`,
      { program }
    );
  },
  async readWorkflowState(name) {
    if (!(workflowStepId && workflowRunId)) {
      throw new Error("Workflow state is available only to workflow steps.");
    }
    const response = await fetch(
      `${hubHttpUrl()}/api/workflow-runs/${encodeURIComponent(workflowRunId)}/state/${encodeURIComponent(name)}?instanceId=${encodeURIComponent(instanceId)}`
    );
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return (await response.json()) as { value: unknown };
  },
  async writeWorkflowState(name, value) {
    if (!(workflowStepId && workflowRunId)) {
      throw new Error("Workflow state is available only to workflow steps.");
    }
    const response = await fetch(
      `${hubHttpUrl()}/api/workflow-runs/${encodeURIComponent(workflowRunId)}/state/${encodeURIComponent(name)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instanceId, value }),
      }
    );
    return response.text();
  },
  async submitResult(result) {
    if (!workflowStepId) {
      throw new Error("submit_result is available only to workflow steps.");
    }
    const response = await fetch(
      `${hubHttpUrl()}/api/workflow-steps/${encodeURIComponent(workflowStepId)}/result`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instanceId, result }),
      }
    );
    return response.text();
  },
  async runWorkflow(name, inputs, options) {
    const response = await fetch(
      `${hubHttpUrl()}/api/workflows/${encodeURIComponent(name)}/runs`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          instanceId,
          inputs,
          workspace: options?.workspace,
        }),
      }
    );
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return (await response.json()) as { runId: string };
  },
  async readWorkflow(runId, { ref, path, offset, limit }) {
    const query = new URLSearchParams({ instanceId, ref: String(ref) });
    if (path) {
      query.set("path", path);
    }
    if (offset !== undefined) {
      query.set("offset", String(offset));
    }
    if (limit !== undefined) {
      query.set("limit", String(limit));
    }
    const response = await fetch(
      `${hubHttpUrl()}/api/workflow-runs/${encodeURIComponent(runId)}/read?${query}`
    );
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return response.text();
  },
  async steerWorkflow(runId, action) {
    const response = await fetch(
      `${hubHttpUrl()}/api/workflow-runs/${encodeURIComponent(runId)}/steer`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instanceId, action }),
      }
    );
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return response.json();
  },
  async listWorkflows() {
    const response = await fetch(`${hubHttpUrl()}/api/workflows`);
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return response.json();
  },
  async generateImage(request) {
    const response = await fetch(
      `${hubHttpUrl()}/api/instances/${encodeURIComponent(instanceId)}/generate-image`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(IMAGE_GENERATION_TIMEOUT_MS + 60_000),
      }
    );
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return (await response.json()) as GeneratedImage;
  },
  async showPreview(source) {
    const response = await fetch(
      `${hubHttpUrl()}/api/instances/${encodeURIComponent(instanceId)}/preview`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(source),
      }
    );
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return `Preview opened beside the transcript: ${"port" in source ? `localhost:${source.port}` : source.dir}`;
  },
  async listDelegateTypes() {
    const types = await fetchDelegateTypes((message) => {
      throw new Error(message);
    });
    return { types };
  },
  async listSessions(): Promise<string> {
    const { peers, own } = await roster(instanceId);
    if (peers.length === 0) {
      return "No other sessions are running.";
    }
    return peers
      .map((peer) => {
        const facts = [
          peer.host,
          peer.row.model ?? "default model",
          ageOf(peer.row.updatedAt),
          ...(peer.row.kind === "scratch" ? ["side quest"] : []),
          ...(peer.row.parentInstanceId === instanceId
            ? ["your delegate"]
            : []),
          ...(own?.parentInstanceId && own.parentInstanceId === peer.row.id
            ? ["your parent session"]
            : []),
        ];
        return `- ${peer.label} — ${peer.row.cwd} · ${facts.join(" · ")}`;
      })
      .join("\n");
  },

  async handoff(
    target: string,
    message: string,
    urgent = false
  ): Promise<string> {
    const { peers, asleep } = await roster(instanceId);
    const peer = urgent
      ? resolveDelegate(peers, target, instanceId)
      : resolveHandoff(peers, asleep, target);
    const woken = asleep.includes(peer);
    const from = leafOf(cwd);
    const body = `${handoffMarker(from)}${message}`;
    const payload: SendPayload = {
      instanceId: peer.row.id,
      message: {
        type: "user",
        uuid: crypto.randomUUID(),
        message: { role: "user", content: body },
        parent_tool_use_id: null,
        origin: {
          kind: "peer",
          from: instanceId,
          name: from,
          fromSession: instanceId,
        },
        shouldQuery: false,
      },
      ...(urgent ? { urgent: true, from: instanceId } : {}),
    };
    emit({
      verb: "send",
      machineId: peer.row.machineId,
      instanceId: peer.row.id,
      payload,
    });
    if (urgent) {
      return (
        `Delivered urgently to your delegate ${peer.label}. Its current turn was interrupted to ` +
        "read it now — a claude delegate reads it mid-turn instead."
      );
    }
    if (woken) {
      return `Handed to ${peer.label} (${peer.row.cwd} on ${peer.host}). It was asleep; it is being woken to read it.`;
    }
    return (
      `Handed to ${peer.label} (${peer.row.cwd} on ${peer.host}). It is queued there and will be ` +
      "picked up when that session finishes its current turn — it was not interrupted."
    );
  },

  // biome-ignore lint/suspicious/useAwait: HandoffActions.startSession returns Promise<HandoffResult>; dropping async would need every return wrapped instead
  async startSession(
    workdir: string,
    prompt: string,
    title: string,
    sideQuest = false,
    model?: string
  ): Promise<HandoffResult> {
    const id = crypto.randomUUID();
    const from = leafOf(cwd);
    const payload: SpawnPayload = {
      instanceId: id,
      cwd: workdir,
      title,
      ...(callerHarness ? { harness: callerHarness } : {}),
      ...(model ? { model } : {}),
      ...(sideQuest ? { scratch: { baseCwd: workdir } } : {}),
      // Provenance only — a started session is not a delegate. The hub reads
      // it to hold a leaf to `canDelegate` on this door as well.
      spawnedBy: { instanceId },
    };
    emit({ verb: "spawn", machineId: "", instanceId: id, payload });
    // The marker prefix survives SDK storage (which strips `origin`) so that
    // `mapTranscript` → `handoffFrom()` can still detect the opening prompt as
    // a peer message and render it as `user.peer` instead of the reader's own
    // words — the same marker `handoff()` already uses.
    const body = `${handoffMarker(from)}${prompt}`;
    const opening: SendPayload = {
      instanceId: id,
      message: {
        type: "user",
        uuid: crypto.randomUUID(),
        message: { role: "user", content: body },
        parent_tool_use_id: null,
        origin: {
          kind: "peer",
          from: instanceId,
          name: from,
          fromSession: instanceId,
        },
      },
    };
    emit({ verb: "send", machineId: "", instanceId: id, payload: opening });
    return {
      id,
      title,
      text:
        `Started "${title}" (${leafOf(workdir)})${sideQuest ? " as a side quest" : ""} in ${workdir}. ` +
        "It is in the sidebar now and the user can open its transcript. " +
        `Hand it more work later with handoff("${id}", ...).`,
    };
  },

  async delegate(prompt, opts) {
    const response = await fetch(`${hubHttpUrl()}/api/work-items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...opts, parentInstanceId: instanceId, prompt }),
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const started = (await response.json()) as {
      instanceId: string;
      text: string;
      title: string;
      workItemId: string;
      workspaceId: string;
    };
    return {
      id: started.instanceId,
      title: started.title,
      text: started.text,
      workItemId: started.workItemId,
      workspaceId: started.workspaceId,
    };
  },

  async finishItem(request) {
    const response = await fetch(`${hubHttpUrl()}/api/work-items/finish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...request, instanceId }),
      // The checks may run for hours between them; Bun's fetch would drop a
      // response silent for five minutes.
      timeout: false,
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return ((await response.json()) as { text: string }).text;
  },

  async setItemChecks(target, checks) {
    const { peers } = await roster(instanceId);
    const peer = resolveDelegate(peers, target, instanceId);
    const response = await fetch(`${hubHttpUrl()}/api/work-items/checks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        from: instanceId,
        instanceId: peer.row.id,
        checks,
      }),
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return ((await response.json()) as { text: string }).text;
  },

  async stopDelegate(target: string): Promise<string> {
    const { peers } = await roster(instanceId);
    const peer = resolveDelegate(peers, target, instanceId);
    emit({
      verb: "stop",
      machineId: peer.row.machineId,
      instanceId: peer.row.id,
      payload: { instanceId: peer.row.id, from: instanceId },
    });
    if (!peer.row.workItemId) {
      return `Stopped your delegate ${peer.label}.`;
    }
    const response = await fetch(
      `${hubHttpUrl()}/api/work-items/${encodeURIComponent(peer.row.workItemId)}`
    );
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const item = (await response.json()) as WorkItemView;
    const live = item.state === "starting" || item.state === "running";
    return (
      `Stopped your delegate ${peer.label}. Its work item ${item.id} ` +
      (live ? "is cancelled" : `was already ${item.state}`) +
      `, and its workspace ${item.workspaceId} keeps the checkout. To carry the work on, handoff to it, ` +
      `or delegate(..., workspace: "${item.workspaceId}"): either continues its own session.`
    );
  },

  async interruptDelegate(target: string): Promise<string> {
    const { peers } = await roster(instanceId);
    const peer = resolveDelegate(peers, target, instanceId);
    emit({
      verb: "control",
      machineId: peer.row.machineId,
      instanceId: peer.row.id,
      payload: {
        instanceId: peer.row.id,
        requestId: crypto.randomUUID(),
        method: "interrupt",
        args: [],
        from: instanceId,
      },
    });
    return (
      `Interrupted your delegate ${peer.label}. Its current turn stopped; it keeps all state. ` +
      `Resume or redirect it with handoff("${peer.row.id}", ...).`
    );
  },

  async answerDelegate(
    target: string,
    requestId: string,
    answers?: Record<string, string>,
    deny = false
  ): Promise<string> {
    const { peers } = await roster(instanceId);
    const peer = resolveDelegate(peers, target, instanceId);
    // The answers alone are all this side has: the delegate's tool call never
    // came here, only the question text and its options did. A question's
    // `updatedInput` has to carry the whole call back or the harness refuses it
    // for the `questions` it is missing, so the harness that parked the ask
    // folds these into the input it kept (settledQuestionResult in
    // @whiffle/core, mirroring the dashboard's questionAnswer). A denial says so
    // in words for the same reason: the model is told why, not merely that.
    let result: PermissionResult;
    if (deny) {
      result = { behavior: "deny", message: QUESTION_DISMISSED };
    } else if (answers) {
      result = { behavior: "allow", updatedInput: { answers } };
    } else {
      result = { behavior: "allow" };
    }
    emit({
      verb: "control",
      machineId: peer.row.machineId,
      instanceId: peer.row.id,
      requestId,
      payload: {
        instanceId: peer.row.id,
        requestId,
        method: "resolvePermission",
        args: [requestId, result],
        from: instanceId,
      },
    });
    return deny
      ? `Denied your delegate ${peer.label}'s ask (${requestId}).`
      : `Answered your delegate ${peer.label}'s ask (${requestId}).`;
  },

  // biome-ignore lint/suspicious/useAwait: HandoffActions.sendToUser returns Promise<string>; dropping async would need the return wrapped instead
  async sendToUser(message: string, attachments?: string[]): Promise<string> {
    emit({
      verb: "frames",
      machineId: "",
      instanceId,
      payload: {
        kind: "user_message",
        instanceId,
        text: message,
        ...(attachments?.length ? { attachments } : {}),
      },
    });
    return "Sent to the user — it lands in their Telegram when the hub has a bridge, and is dropped otherwise.";
  },
});
