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
import { briefTitle } from "./brief-title";

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
async function roster(
  exceptInstanceId: string
): Promise<{ peers: Peer[]; own: InstanceRow | undefined }> {
  const { rows, hosts } = await fetchInstances();
  const own = rows.find((row) => row.id === exceptInstanceId);
  const peers = rows
    .filter(
      (row) =>
        row.id !== exceptInstanceId &&
        (row.status === "running" || row.status === "starting")
    )
    .map((row) => toPeer(row, hosts));
  return { peers, own };
}

/**
 * Resolves `fork_of` against every row the caller owns, regardless of
 * status — `stopDelegate`'s own text promises "delegate again to resume from
 * it", so a stopped delegate has to still be forkable. Unlike `roster()`,
 * this is not filtered to running/starting; only `delegate()`'s fork lookup
 * uses it.
 */
async function resolveForkSource(
  instanceId: string,
  target: string
): Promise<Peer> {
  const { rows, hosts } = await fetchInstances();
  const mine = rows
    .filter((row) => row.parentInstanceId === instanceId)
    .map((row) => toPeer(row, hosts));
  try {
    return resolve(mine, target);
  } catch (error) {
    let outside = false;
    try {
      resolve(
        rows.map((row) => toPeer(row, hosts)),
        target
      );
      outside = true;
    } catch {
      outside = false;
    }
    if (outside) {
      throw new Error(
        `"${target}" is not your delegate — you can only fork your own delegates.`,
        { cause: error }
      );
    }
    throw error;
  }
}

/** An `@` prefix on a target name, optional. */
const AT_PREFIX = /^@/;

/** Resolves what the model typed to one session; ambiguity is reported, not guessed. */
function resolve(peers: Peer[], target: string): Peer {
  const needle = target.trim().toLowerCase().replace(AT_PREFIX, "");
  const byId = peers.find((peer) => peer.row.id === needle);
  if (byId) {
    return byId;
  }

  const idPart = needle.includes("#")
    ? (needle.split("#").pop() ?? "")
    : needle;
  if (idPart.length >= 6) {
    const byShortId = peers.filter((peer) => peer.row.id.startsWith(idPart));
    if (byShortId.length === 1) {
      return byShortId[0];
    }
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
  "list_workflows",
  "create_workflow",
  "update_workflow",
  "start_session",
  "continue_session",
  "delegate",
  "stop_delegate",
  "interrupt_delegate",
  "answer_delegate",
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
}

/** The three hand-off actions, each answering with the text the tool returns. */
export interface HandoffActions {
  /**
   * Records what the session did about a concern the user raised, or about a
   * rule reply that asked for an acknowledgement. It is session-scoped: the
   * reply asks the session to acknowledge but never names the rule, so the
   * caller has no id to pass — the hub settles everything outstanding for the
   * session from the note alone.
   */
  // biome-ignore lint/style/useConsistentMethodSignatures: this interface is implemented by the handoffActions object literal below; property-style would change parameter variance against that implementation
  acknowledgeConcern(note: string): Promise<string>;
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
  // biome-ignore lint/style/useConsistentMethodSignatures: implemented below; property-style would change parameter variance against that implementation
  delegate(
    prompt: string,
    opts?: {
      cwd?: string;
      harness?: "claude" | "opencode" | "pi";
      model?: string;
      skills?: string[];
      /** An earlier delegate's instanceId — the new one forks its full conversation. */
      forkOf?: string;
      /** Default true: run in its own git worktree of `cwd`. Ignored by a fork. */
      worktree?: boolean;
      /**
       * A named preset from `HandoffDeps.delegateTypes`. Its harness/model/
       * effort/skills/denyTools apply first; an explicit `harness`/`model`/
       * `skills` above still overrides what the type says.
       */
      type?: string;
      /**
       * Whether the new delegate may itself delegate/start sessions; default
       * false — a delegate is a leaf unless granted.
       */
      canDelegate?: boolean;
    }
  ): Promise<HandoffResult>;
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
  readonly readWorkflowState: (name: string) => Promise<{ value: unknown }>;
  readonly runWorkflow: (
    name: string,
    inputs: Record<string, unknown>,
    options?: { workspace?: { path: string; machineId: string } }
  ) => Promise<{ runId: string }>;
  /** Pushes a note to the owner's Telegram — no peer, no ask, fire-and-forget. */
  // biome-ignore lint/style/useConsistentMethodSignatures: implemented below; property-style would change parameter variance against that implementation
  sendToUser(message: string, attachments?: string[]): Promise<string>;
  readonly showPreview: (source: PreviewSource) => Promise<string>;
  // biome-ignore lint/style/useConsistentMethodSignatures: implemented below; property-style would change parameter variance against that implementation
  startSession(
    cwd: string,
    prompt: string,
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
    // NDJSON: stage and heartbeat lines while it runs, then one `result` or `error`.
    const lines = (await response.text()).trim().split("\n");
    const last = JSON.parse(lines.at(-1) ?? "{}") as {
      result?: {
        summariserInstanceId: string | null;
        targetInstanceId: string;
        opening: string;
      };
      error?: string;
    };
    if (!last.result) {
      throw new Error(last.error);
    }
    const { result: done } = last;
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
    const { peers } = await roster(instanceId);
    const peer = urgent
      ? resolveDelegate(peers, target, instanceId)
      : resolve(peers, target);
    const from = leafOf(cwd);
    const body = `${handoffMarker(from)}${message}`;
    const payload: SendPayload = {
      instanceId: peer.row.id,
      message: {
        type: "user",
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
    return (
      `Handed to ${peer.label} (${peer.row.cwd} on ${peer.host}). It is queued there and will be ` +
      "picked up when that session finishes its current turn — it was not interrupted."
    );
  },

  // biome-ignore lint/suspicious/useAwait: HandoffActions.startSession returns Promise<HandoffResult>; dropping async would need every return wrapped instead
  async startSession(
    workdir: string,
    prompt: string,
    sideQuest = false,
    model?: string
  ): Promise<HandoffResult> {
    const id = crypto.randomUUID();
    const from = leafOf(cwd);
    const payload: SpawnPayload = {
      instanceId: id,
      cwd: workdir,
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
      title: leafOf(workdir),
      text:
        `Started ${leafOf(workdir)}${sideQuest ? " as a side quest" : ""} in ${workdir}. ` +
        "It is in the sidebar now and the user can open its transcript. " +
        `Hand it more work later with handoff("${id}", ...).`,
    };
  },

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: resolves a delegate type, a fork source, and every spawn option in one pass, so the model gets one refusal naming exactly what's wrong
  async delegate(
    prompt: string,
    opts?: {
      cwd?: string;
      harness?: "claude" | "opencode" | "pi";
      model?: string;
      skills?: string[];
      forkOf?: string;
      worktree?: boolean;
      type?: string;
      canDelegate?: boolean;
    }
  ): Promise<HandoffResult> {
    const id = crypto.randomUUID();
    let workdir = opts?.cwd ?? cwd;
    const from = leafOf(cwd);
    // The brief is the only thing that says what this session is for, and the
    // rail would otherwise have nothing to call it but its directory and its id.
    const title = briefTitle(prompt);

    // A named type resolves first; an explicit harness/model/skills below
    // still overrides what it says. Unknown name: a clear refusal listing
    // what is actually available, never a spawn with half-applied settings.
    let resolvedType: DelegateType | undefined;
    if (opts?.type) {
      // Resolve at dispatch so a saved model/effort change reaches existing sessions.
      const types = await fetchDelegateTypes((message) => {
        throw new Error(message);
      });
      resolvedType = types.find((type) => type.name === opts.type);
      if (!resolvedType) {
        const known =
          types.map((type) => type.name).join(", ") || "none are configured";
        throw new Error(
          `No delegate type "${opts.type}". Available: ${known}.`
        );
      }
    }

    // A fork resumes the source delegate's own stored session, so its sessionKey
    // has to come from the fleet — the only place this session's own daemon
    // reports another instance's harness session id.
    let resume: SpawnPayload["resume"];
    let modelNote = "";
    let harness = opts?.harness ?? resolvedType?.harness;
    if (opts?.forkOf) {
      const source = await resolveForkSource(instanceId, opts.forkOf);
      if (!source.row.sessionId) {
        throw new Error(
          `Your delegate ${source.label} has no session yet to fork — it never started, or hasn't ` +
            "emitted one. Delegate fresh instead of forking it."
        );
      }
      // A fork resumes the source's own stored transcript; that transcript
      // belongs to one harness, so the spawn has to land on the same one.
      const sourceHarness = source.row.harness ?? undefined;
      if (opts.harness && sourceHarness && opts.harness !== sourceHarness) {
        throw new Error(
          `cannot fork a ${sourceHarness} delegate into ${opts.harness} — transcripts don't transfer ` +
            "across harnesses."
        );
      }
      harness = opts.harness ?? (sourceHarness as typeof harness);
      resume = { sessionKey: source.row.sessionId, fork: true };
      // The directory its init reported: the source's worktree, where its
      // uncommitted work and its transcript both are.
      workdir = source.row.cwd;
      if (source.row.model && opts.model && source.row.model !== opts.model) {
        modelNote =
          ` Forked from a ${source.row.model} delegate onto ${opts.model} — the conversation carries ` +
          "over, but the prompt cache does not; the transcript re-ingests at full cost.";
      }
    }

    const model = opts?.model ?? resolvedType?.model;
    const canDelegate = opts?.canDelegate ?? resolvedType?.canDelegate ?? false;
    const skills = opts?.skills?.length ? opts.skills : resolvedType?.skills;
    const worktree = !resume && (opts?.worktree ?? true);
    const payload: SpawnPayload = {
      instanceId: id,
      cwd: workdir,
      ...(harness ? { harness } : {}),
      ...(model ? { model } : {}),
      ...(resolvedType?.effort ? { effort: resolvedType.effort } : {}),
      ...(title ? { title } : {}),
      ...(skills?.length ? { skills } : {}),
      ...(resolvedType?.denyTools?.length
        ? { denyTools: resolvedType.denyTools }
        : {}),
      ...(resume ? { resume } : {}),
      scratch: { baseCwd: workdir, worktree },
      parent: { instanceId },
      spawnedBy: { instanceId },
      // Always explicit for a delegate: the call's word, else the type's
      // default, else a leaf.
      canDelegate,
      // A delegate is autonomous by definition: it must never sit waiting on a
      // tool-permission prompt nobody is watching for. Questions still ask.
      permissionMode: "bypassPermissions",
    };
    emit({ verb: "spawn", machineId: "", instanceId: id, payload });

    // Same marker as `handoff()` and `startSession()` — survives SDK storage so
    // stored transcripts render the opening as `user.peer` and `mergePeerMessage`
    // deduplicates against the live echo that carries `origin`.
    // The daemon adds `withWorktreeLine` if it actually made a worktree.
    const body = `${handoffMarker(from)}${prompt}`;
    const opening: SendPayload = {
      instanceId: id,
      message: {
        type: "user",
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
      title: title || `${leafOf(workdir)}#${shortId(id)}`,
      text:
        `Delegated to ${harness ?? "claude"} session ${leafOf(workdir)}#${shortId(id)}.` +
        (resume
          ? " It starts with the full conversation of the forked delegate."
          : "") +
        modelNote +
        " It runs as a temporary session nested under this one; its report arrives here automatically " +
        `when each of its turns completes. Guide it or send follow-ups with handoff("${id}", ...).` +
        (canDelegate
          ? " It may spawn delegates of its own."
          : " It is a leaf: it cannot delegate further."),
    };
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
    return `Stopped your delegate ${peer.label}. Its transcript is preserved; delegate again to resume from it.`;
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

  async acknowledgeConcern(note: string): Promise<string> {
    const res = await fetch(`${hubHttpUrl()}/api/rules/ack`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instanceId, note }),
      signal: AbortSignal.timeout(5000),
    });
    // A refusal comes back as the hub's own bare sentence; it says the useful
    // thing better than anything this side could invent, so pass it through.
    if (res.status === 400) {
      return await res.text();
    }
    if (!res.ok) {
      throw new Error(`the hub answered ${res.status}`);
    }
    return "Recorded. The user sees this note in their dashboard.";
  },
});
