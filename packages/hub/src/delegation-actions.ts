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
  CanvasChoices,
  DelegateType,
  Envelope,
  GeneratedImage,
  ImageGenerationRequest,
  InstanceRow,
  LandsMode,
  PermissionMode,
  PermissionResult,
  PreviewSource,
  SendPayload,
  SpawnPayload,
  WorkflowAction,
} from "@cawco/core";
import {
  CAWCO_ENV,
  CAWCO_HUB_PORT,
  delegateTypeProblem,
  handoffMarker,
  IMAGE_GENERATION_TIMEOUT_MS,
  machineLabel,
  QUESTION_DISMISSED,
} from "@cawco/core";
import type {
  WorkBudget,
  WorkItemCheck,
  WorkItemSubmission,
} from "./db/schema";
import { type KeepAliveRow, promptCacheExpiresAt } from "./keep-alive";
import { resolveSpawnType } from "./work-items";

const WS_SCHEME = /^ws/;
const WS_PATH_SUFFIX = /\/ws$/;

/** Where the hub answers REST, derived from the websocket url the daemon uses. */
export const hubHttpUrl = (): string => {
  const ws =
    process.env[CAWCO_ENV.hubUrl] ??
    `ws://localhost:${process.env[CAWCO_ENV.hubPort] ?? CAWCO_HUB_PORT}/ws`;
  return ws.replace(WS_SCHEME, "http").replace(WS_PATH_SUFFIX, "");
};

/**
 * The fleet's delegate types (`@cawco/core`'s `DelegateType`), read once
 * per session. There is no fleet sync path for them yet (unlike MCP servers
 * and skills) — a daemon fetches this directly from the hub it already knows
 * the address of, right before it builds the `delegate` tool's description,
 * and the caller freezes what comes back for the session's whole life.
 * Failures are logged and passed to the caller for its startup instructions.
 * A valid empty catalog remains distinct from a failed fetch.
 * Descriptions take a startup snapshot. Catalog reads and named dispatch fetch
 * again so saved routing changes apply to sessions already running.
 *
 * With `projectId`, the catalog a session of that project sees: the project's
 * own types (the `delegates/` files in its folder) shadowing fleet types of
 * the same name (project-delegate-types.ts).
 */
export async function fetchDelegateTypes(
  onError?: (message: string) => void,
  projectId?: string
): Promise<DelegateType[]> {
  try {
    const path = projectId
      ? `/api/projects/${encodeURIComponent(projectId)}/delegate-types`
      : "/api/delegate-types";
    const res = await fetch(`${hubHttpUrl()}${path}`, {
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
    console.warn(`[cawco] ${message}`);
    onError?.(message);
    return [];
  }
}

/**
 * What a type the caller named adds to a started session. Denied tools come
 * only with a named type: the default type picks what runs, but its deny
 * list is a delegate's (browser checks in isolated chrome-devtools, not the
 * owner's Chrome); a started session is not a delegate and keeps Claude in
 * Chrome. And its toolset (§5.3): the type's `role:`, kept on the row.
 */
const namedTypeSettings = (
  type: DelegateType | undefined
): Pick<SpawnPayload, "denyTools" | "role"> => ({
  denyTools: type?.denyTools,
  ...(type?.role ? { role: type.role } : {}),
});

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

/** A machine of the fleet as the hub's registry has it (`GET /api/agents`). */
interface Machine {
  hostname: string;
  machineId: string;
  /** `online` while its daemon holds a socket to the hub. */
  status: string;
}

/** Every machine the hub knows, online or not. */
async function fetchMachines(): Promise<Machine[]> {
  const response = await fetch(`${hubHttpUrl()}/api/agents`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`the hub answered ${response.status} for its machines`);
  }
  return (await response.json()) as Machine[];
}

/** The machines work can start on now, by the names delegate and start_session take. */
const onlineNames = (machines: Machine[]): string =>
  machines
    .filter((machine) => machine.status === "online")
    .map((machine) => machineLabel(machine.hostname))
    .join(", ") || "none";

/**
 * The one machine `target` names: its machineId, its hostname, or that
 * hostname as the fleet shows it (without `.local`), case aside. An unknown,
 * ambiguous or offline name is refused with the machines online now.
 */
function resolveMachine(machines: Machine[], target: string): Machine {
  const needle = target.trim().toLowerCase();
  const matches = machines.filter(
    (machine) =>
      machine.machineId.toLowerCase() === needle ||
      machine.hostname.toLowerCase() === needle ||
      machineLabel(machine.hostname).toLowerCase() === needle
  );
  if (matches.length === 0) {
    throw new Error(
      `No machine in the fleet is named "${target}". Online now: ${onlineNames(machines)}.`
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `"${target}" names ${matches.length} machines: ${matches.map((machine) => `${machineLabel(machine.hostname)} (${machine.machineId})`).join(", ")}. Name one by its machineId.`
    );
  }
  const [found] = matches;
  if (found.status !== "online") {
    throw new Error(
      `${machineLabel(found.hostname)} is offline. Online now: ${onlineNames(machines)}.`
    );
  }
  return found;
}

/** The raw rows behind the roster, before the running/starting narrowing. */
async function fetchInstances(): Promise<{
  rows: InstanceRow[];
  hosts: Map<string, string>;
}> {
  const base = hubHttpUrl();
  const [instancesRes, machines] = await Promise.all([
    fetch(`${base}/api/instances`, { signal: AbortSignal.timeout(5000) }),
    fetchMachines().catch(() => [] as Machine[]),
  ]);
  if (!instancesRes.ok) {
    throw new Error(`the hub answered ${instancesRes.status}`);
  }
  const rows = (await instancesRes.json()) as InstanceRow[];
  const hosts = new Map(
    machines.map((machine) => [
      machine.machineId,
      machineLabel(machine.hostname),
    ])
  );
  return { rows, hosts };
}

/**
 * The permission mode the calling session runs in, if it has one: the
 * fallback a session it starts takes when nothing else is named. The hub
 * settles it (`settleMode`): a harness with modes needs one, one without
 * takes none.
 */
const callerMode = (
  rows: InstanceRow[],
  instanceId: string
): PermissionMode | undefined =>
  (rows.find((row) => row.id === instanceId)?.permissionMode ?? undefined) as
    | PermissionMode
    | undefined;

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
  // `unknown` is a live session whose machine is not connected right now —
  // an agent restart, the two seconds between its socket closing and its
  // register — and a send to it waits for that register at the hub.
  const peers = others
    .filter(
      (row) =>
        row.status === "running" ||
        row.status === "starting" ||
        row.status === "unknown"
    )
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

/** The sessions a bare name picks out: those it names exactly, else those whose name holds it. */
function named(peers: Peer[], target: string): Peer[] {
  const needle = needleOf(target);
  const exact = peers.filter((peer) => peer.name.toLowerCase() === needle);
  return exact.length
    ? exact
    : peers.filter((peer) => peer.name.toLowerCase().includes(needle));
}

/**
 * How many sessions a refused name lists by id. A directory's name can match
 * hundreds of sessions that ever ran there; the rest are counted.
 */
const LISTED_AT_MOST = 12;

/**
 * The refusal of a name more than one session answers to: the sessions by
 * id, in the order given, and how many more there are.
 */
function ambiguous(
  target: string,
  candidates: Peer[],
  asleep: ReadonlySet<Peer> = new Set()
): Error {
  const listed = candidates
    .slice(0, LISTED_AT_MOST)
    .map(
      (peer) =>
        `${peer.label} on ${peer.host} (${asleep.has(peer) ? "asleep, " : ""}${ageOf(peer.row.updatedAt)})`
    )
    .join(", ");
  const more = candidates.length - LISTED_AT_MOST;
  return new Error(
    `"${target}" matches ${candidates.length} sessions: ${listed}${more > 0 ? `, and ${more} more, less recent` : ""}. ` +
      "Name one by its short id — and if you cannot tell them apart, ask rather than guess."
  );
}

/** When a row last moved, for ordering: the most recent first. */
const movedAt = (peer: Peer) =>
  peer.row.updatedAt ? new Date(peer.row.updatedAt).getTime() || 0 : 0;

/**
 * A hand-off's target, running or asleep. An id — full, or a short id of six
 * or more characters — names one session. A bare name is looked up among
 * both: the caller's own parent when it answers to the name, else the one
 * session that does. A name more than one session answers to is refused with
 * every one of them by id; it is never guessed. The hub wakes a sleeping
 * target to read it.
 */
function resolveHandoff(
  peers: Peer[],
  asleep: Peer[],
  target: string,
  own: InstanceRow | undefined
): Peer {
  const all = [...peers, ...asleep];
  const byId = resolveById(all, target);
  if (byId) {
    return byId;
  }
  const candidates = named(all, target);
  const parent = candidates.find(
    (peer) => peer.row.id === own?.parentInstanceId
  );
  if (parent) {
    return parent;
  }
  if (candidates.length === 1) {
    return candidates[0];
  }
  if (candidates.length === 0) {
    const known =
      peers.map((peer) => peer.label).join(", ") || "none are running";
    throw new Error(
      `No session, running or asleep, matches "${target}". Running now: ${known}.`
    );
  }
  const sleeping = new Set(asleep);
  throw ambiguous(
    target,
    candidates.toSorted(
      (a, b) =>
        Number(sleeping.has(a)) - Number(sleeping.has(b)) ||
        movedAt(b) - movedAt(a)
    ),
    sleeping
  );
}

/** Resolves what the model typed to one session; ambiguity is reported, not guessed. */
function resolve(peers: Peer[], target: string): Peer {
  const byId = resolveById(peers, target);
  if (byId) {
    return byId;
  }
  const candidates = named(peers, target);
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
  throw ambiguous(target, candidates);
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
  /** This invocation's session credential; never a tool argument or persisted metadata. */
  readonly authorization?: string;
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
  /** Exact-id lookup includes ended/archived rows outside the live roster. */
  readonly instanceById: (id: string) => InstanceRow | undefined;
  /** The session doing the handing over. */
  readonly instanceId: string;
  /** Where this session's work item lands, which finish_item's description follows; `main` when unknown. */
  readonly lands?: LandsMode;
  /** Whether this session leads the project of the work item a session runs: it may steer, answer and stop it. */
  readonly ledBy?: (instanceId: string) => boolean;
  /** The session's project: its delegate types shadow the fleet's. */
  readonly projectId?: string;
  readonly workflowRunId?: string;
  readonly workflowStepId?: string;
  /** Delegate role: finish_item is available even before an item has checks. */
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
      /** The machine it runs on, by hostname or machineId; the caller's by default. */
      machine?: string;
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
      /** Where its commits go once its checks pass; `main` by default. */
      lands?: LandsMode;
      /** Files in its workspace the hub copies into the project's folder. */
      outputs?: string[];
      /** Its group under this session: one combined report once all have ended. */
      group?: string;
      /** Globs of the repository's files it owns. */
      owns?: string[];
      /** What it may spend before the hub stops it. */
      budget?: WorkBudget;
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
  /** The person's choices on the session's preview, or on a decision page of its project. */
  readonly readChoices: (page?: string) => Promise<string>;
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
  /** Names this session; refused, in the hub's words, once the owner has named it. */
  readonly setTitle: (title: string) => Promise<string>;
  /** A dev server or folder; or a decision page in the session's project folder, published from `dir` first when given. */
  readonly showPreview: (
    source:
      | Exclude<PreviewSource, { project: string }>
      | { page: string; dir?: string }
  ) => Promise<string>;
  // biome-ignore lint/style/useConsistentMethodSignatures: implemented below; property-style would change parameter variance against that implementation
  startSession(
    cwd: string,
    prompt: string,
    title: string,
    options: {
      sideQuest?: boolean;
      /** A delegate type; `medium` (work-items' DEFAULT_DELEGATE_TYPE) when omitted. */
      type?: string;
      /** Overrides the type's model. */
      model?: string;
      /** This session's own mode when omitted. */
      permissionMode?: PermissionMode;
      /** The machine it runs on, by hostname or machineId; the caller's by default. */
      machine?: string;
    }
  ): Promise<HandoffResult>;
  /** A supervisor's action on its run; answers one line saying what it did. */
  readonly steerWorkflow: (
    runId: string,
    action: WorkflowAction
  ) => Promise<string>;
  // biome-ignore lint/style/useConsistentMethodSignatures: implemented below; property-style would change parameter variance against that implementation
  stopDelegate(target: string): Promise<string>;
  readonly submitResult: (result: unknown) => Promise<string>;
  readonly updateWorkflow: (name: string, program: string) => Promise<unknown>;
  readonly waitItem: (minutes: number, reason: string) => Promise<string>;
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

/**
 * A delegation's result: its session, and the work item and workspace it
 * runs in; all three null while it waits, queued, for files a live item owns.
 */
export interface DelegateResult {
  id: string | null;
  /** The queued request's id, while it waits for owned files. */
  queued: string | null;
  text: string;
  title: string;
  workItemId: string | null;
  workspaceId: string | null;
}

/** A work item as the hub answers for it (`GET /api/work-items/:id`). */
interface WorkItemView {
  id: string;
  state: string;
  title: string;
  workspaceId: string;
}

/**
 * Resolves a target among the caller's own delegates, and the work items of
 * a project it leads (`ledBy`); anything else is refused.
 */
function resolveDelegate(
  peers: Peer[],
  target: string,
  instanceId: string,
  ledBy?: (instanceId: string) => boolean
): Peer {
  const mine = peers.filter(
    (peer) =>
      peer.row.parentInstanceId === instanceId || ledBy?.(peer.row.id) === true
  );
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

const coldRefusals = new Map<string, string>();

async function checkCold(
  instanceId: string | undefined,
  workspace: string | undefined,
  caller: string
): Promise<void> {
  const response = await fetch(`${hubHttpUrl()}/api/followup-state`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ instanceId, workspace }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const { row, midTurn, hasTurns, lastTurnAt, activityBound } =
    (await response.json()) as {
      row: KeepAliveRow | null;
      midTurn: boolean;
      hasTurns: boolean;
      lastTurnAt: string | null;
      activityBound: boolean;
    };
  if (!row) {
    return;
  }
  row.lastRequestAt = row.lastRequestAt ? new Date(row.lastRequestAt) : null;
  const expires = promptCacheExpiresAt(row, lastTurnAt);
  const now = Date.now();
  const prefix = `${row.id}:`;
  if (midTurn || expires === null || expires > now) {
    for (const key of coldRefusals.keys()) {
      if (key.startsWith(prefix)) {
        coldRefusals.delete(key);
      }
    }
    return;
  }
  const key = `${prefix}${caller}`;
  const turn = `${row.lastRequestAt?.getTime() ?? ""}:${lastTurnAt ?? ""}`;
  if (coldRefusals.get(key) === turn) {
    coldRefusals.delete(key);
    return;
  }
  // Bound warnings in memory; a newer turn also invalidates an unused repeat.
  if (coldRefusals.size >= 256) {
    coldRefusals.delete(coldRefusals.keys().next().value as string);
  }
  coldRefusals.set(key, turn);
  if (row.contextTokens === null) {
    try {
      const measured = await fetch(
        `${hubHttpUrl()}/api/instances/${encodeURIComponent(row.id)}/context-size`,
        { method: "POST", signal: AbortSignal.timeout(3000) }
      );
      if (measured.ok) {
        const reading = (await measured.json()) as { tokens?: number | null };
        row.contextTokens = reading.tokens ?? null;
      }
    } catch {
      // A context read cannot keep a cold-session refusal waiting on an offline machine.
    }
  }
  throw new Error(
    coldRefusalText(row, lastTurnAt as string, activityBound, hasTurns)
  );
}

export function coldRefusalText(
  row: KeepAliveRow,
  lastTurnAt: string,
  activityBound: boolean,
  hasTurns: boolean,
  now = Date.now()
): string {
  const title = row.title ?? row.derivedTitle ?? row.cwd;
  const measured = !!(row.cacheTtl && row.lastRequestAt);
  const idle = Math.floor(
    (now -
      (
        (measured ? row.lastRequestAt : new Date(lastTurnAt as string)) as Date
      ).getTime()) /
      60_000
  );
  const lifetime = row.cacheTtl === "1h" ? "1 hour" : "5 minutes";
  let age = `Its last recorded turn ended ${idle} minutes ago`;
  if (activityBound) {
    age = `Its last model activity was at least ${idle} minutes ago`;
  }
  if (!hasTurns) {
    age = `Its last recorded activity was ${Math.floor((now - new Date(row.updatedAt).getTime()) / 60_000)} minutes ago`;
  }
  if (measured) {
    age = `Its last request was ${idle} minutes ago`;
  }
  const cache = measured ? lifetime : "not measured, at most 1 hour";
  const size =
    row.contextTokens === null
      ? "size not recorded"
      : `about ${(Math.round(row.contextTokens / 1000) * 1000).toLocaleString("en-US")} tokens as of its last request`;
  return `Refused: "${title}" (${row.id}) is cold. ${age} and its prompt cache (${cache}) has expired, so the next message makes it re-read its whole transcript (${size}) at full price. Nothing was sent.\n\nCheck first:\n1. Does this task need context that session already holds, which a brief could not carry?\n2. Would a fresh delegate with a tight brief cost less than that transcript?\n3. Is the message still needed at all, or was it meant for a session that has moved on?\n\nThen: if a fresh delegate fits, start one with delegate and no workspace. If no message is needed, stop. If this session is the right one, make the same call again and it will be delivered.`;
}

export const handoffActions = ({
  instanceId,
  instanceById,
  workflowRunId,
  workflowStepId,
  cwd,
  emit,
  authorization,
  projectId,
  ledBy,
}: HandoffDeps): HandoffActions => ({
  async continueSession(input) {
    let source = instanceId;
    const { rows, hosts } = await fetchInstances();
    if (input.session) {
      source = resolve(
        rows.map((row) => toPeer(row, hosts)),
        input.session
      ).row.id;
    }
    // The new session answers permissions as the caller does, where its
    // harness has modes; the hub settles it, never the machine's default.
    const fallbackPermissionMode = callerMode(rows, instanceId);
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
          target: {
            harness: input.target_harness,
            model: input.target_model,
            ...(fallbackPermissionMode ? { fallbackPermissionMode } : {}),
          },
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
    return ((await response.json()) as { message: string }).message;
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
    if ("page" in source) {
      return `Decision page decisions/${source.page}/ ${source.dir ? "published to your project's folder and " : ""}opened beside the transcript. The person's picks come back with read_choices, and as one message when they send them.`;
    }
    return `Preview opened beside the transcript: ${"port" in source ? `localhost:${source.port}` : source.dir}`;
  },
  async readChoices(page) {
    const query = page ? `?${new URLSearchParams({ page })}` : "";
    const response = await fetch(
      `${hubHttpUrl()}/api/instances/${encodeURIComponent(instanceId)}/preview/choices${query}`
    );
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const state = (await response.json()) as CanvasChoices;
    return JSON.stringify({
      ...state,
      choices: Object.entries(state.choices).map(([id, entry]) => ({
        id,
        ...entry,
        ...(state.pageHash && entry.pageHash !== state.pageHash
          ? { earlierRevision: true }
          : {}),
      })),
    });
  },
  async listDelegateTypes() {
    const types = await fetchDelegateTypes((message) => {
      throw new Error(message);
    }, projectId);
    return { types };
  },
  async listSessions(): Promise<string> {
    const [{ peers, own }, machines] = await Promise.all([
      roster(instanceId),
      fetchMachines(),
    ]);
    const where = `Machines online (\`machine\` on delegate and start_session): ${onlineNames(machines)}.`;
    if (peers.length === 0) {
      return `No other sessions are running.\n\n${where}`;
    }
    const listed = peers
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
    return `${listed}\n\n${where}`;
  },

  async handoff(
    target: string,
    message: string,
    urgent = false
  ): Promise<string> {
    const { peers, asleep, own } = await roster(instanceId);
    const peer = urgent
      ? resolveDelegate(peers, target, instanceId, ledBy)
      : resolveHandoff(peers, asleep, target, own);
    if (peer.row.id !== own?.parentInstanceId) {
      await checkCold(peer.row.id, undefined, instanceId);
    }
    const woken = asleep.includes(peer);
    const whose =
      peer.row.id === own?.parentInstanceId ? ", your parent session" : "";
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
      return `Handed to ${peer.label} (${peer.row.cwd} on ${peer.host}${whose}). It was asleep; it is being woken to read it.`;
    }
    if (peer.row.status === "unknown") {
      return (
        `Handed to ${peer.label} (${peer.row.cwd} on ${peer.host}${whose}). Its machine is not connected ` +
        "right now; the message goes to it when the machine registers again, and fails if it is not back within a minute."
      );
    }
    return (
      `Handed to ${peer.label} (${peer.row.cwd} on ${peer.host}${whose}). It is queued there and will be ` +
      "picked up when that session finishes its current turn — it was not interrupted."
    );
  },

  async startSession(
    workdir: string,
    prompt: string,
    title: string,
    { sideQuest = false, type: typeName, model: modelName, machine, ...opts }
  ): Promise<HandoffResult> {
    // Named: that machine, which must be online. Unnamed: "" is the caller's
    // own, which the hub's forwarder fills in.
    const target = machine
      ? resolveMachine(await fetchMachines(), machine)
      : undefined;
    const machineId = target?.machineId ?? "";
    // Nothing is left to the machine's defaults: the type (or `medium`) says
    // what runs, and the caller's own mode is how it answers permissions.
    // The caller's project's catalog: its own types shadow the fleet's.
    const [types, { rows }] = await Promise.all([
      fetchDelegateTypes((message) => {
        throw new Error(message);
      }, projectId),
      fetchInstances(),
    ]);
    const { type, harness, model } = resolveSpawnType(types, {
      type: typeName,
      model: modelName,
    });
    const id = crypto.randomUUID();
    const from = leafOf(cwd);
    // The mode asked for, if any, and the caller's own to fall back on; the
    // hub settles them by the harness's modes (none at all for pi).
    const payload: SpawnPayload & { fallbackPermissionMode?: PermissionMode } =
      {
        instanceId: id,
        cwd: workdir,
        title,
        harness,
        model,
        permissionMode: opts.permissionMode,
        fallbackPermissionMode: callerMode(rows, instanceId),
        ...(type?.effort ? { effort: type.effort } : {}),
        ...(type?.skills?.length ? { skills: type.skills } : {}),
        ...(typeName ? namedTypeSettings(type) : {}),
        ...(sideQuest ? { scratch: { baseCwd: workdir } } : {}),
        // The machine answers it once the session is in place, or with why it
        // is not; the hub holds the relay until then, so a failed spawn is this
        // tool's error rather than a "Started" for a session that never was.
        requestId: crypto.randomUUID(),
      };
    emit({ verb: "spawn", machineId, instanceId: id, payload });
    // The marker prefix survives SDK storage (which strips `origin`) so that
    // the transcript builder (`sentRow`, @cawco/core) can still detect the
    // opening prompt as a peer message and render it as `user.peer` instead of
    // the reader's own words — the same marker `handoff()` already uses.
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
    emit({ verb: "send", machineId, instanceId: id, payload: opening });
    const on = target ? ` on ${machineLabel(target.hostname)}` : "";
    return {
      id,
      title,
      text:
        `Started "${title}" (${leafOf(workdir)})${sideQuest ? " as a side quest" : ""}${on} in ${workdir}, ` +
        `on ${harness} ${model}${type?.effort ? ` at ${type.effort} effort` : ""}${type ? ` (type '${type.name}')` : ""}, ` +
        `in ${opts.permissionMode ?? "this session's own"} permission mode where its harness has modes. ` +
        "It is in the sidebar now and the user can open its transcript. " +
        `Hand it more work later with handoff("${id}", ...).`,
    };
  },

  async delegate(prompt, opts) {
    const { machine, ...request } = opts;
    const target = machine
      ? resolveMachine(await fetchMachines(), machine)
      : undefined;
    if (opts.workspace) {
      await checkCold(undefined, opts.workspace, instanceId);
    }
    const response = await fetch(`${hubHttpUrl()}/api/work-items`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: JSON.stringify({
        ...request,
        machineId: target?.machineId,
        parentInstanceId: instanceId,
        prompt,
      }),
      // A fresh remote fetch and, on failure, its acknowledged discard take minutes.
      timeout: false,
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const started = (await response.json()) as {
      instanceId: string | null;
      queued: string | null;
      text: string;
      title: string;
      workItemId: string | null;
      workspaceId: string | null;
    };
    return {
      id: started.instanceId,
      queued: started.queued,
      title: started.title,
      text: target
        ? `${started.text} It runs on ${machineLabel(target.hostname)}.`
        : started.text,
      workItemId: started.workItemId,
      workspaceId: started.workspaceId,
    };
  },

  async finishItem(request) {
    const response = await fetch(`${hubHttpUrl()}/api/work-items/finish`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(authorization ? { Authorization: authorization } : {}),
      },
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

  async waitItem(minutes, reason) {
    const response = await fetch(`${hubHttpUrl()}/api/work-items/wait`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: JSON.stringify({ instanceId, minutes, reason }),
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return ((await response.json()) as { text: string }).text;
  },

  async setItemChecks(target, checks) {
    const { peers } = await roster(instanceId);
    const peer = resolveDelegate(peers, target, instanceId, ledBy);
    const response = await fetch(`${hubHttpUrl()}/api/work-items/checks`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(authorization ? { Authorization: authorization } : {}),
      },
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
    const { peers, asleep } = await roster(instanceId);
    const ended =
      instanceById(needleOf(target)) ?? resolveById(asleep, target)?.row;
    const peer = resolveDelegate(
      ended ? [toPeer(ended, new Map())] : peers,
      target,
      instanceId,
      ledBy
    );
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
    const peer = resolveDelegate(peers, target, instanceId, ledBy);
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
    const peer = resolveDelegate(peers, target, instanceId, ledBy);
    // The answers alone are all this side has: the delegate's tool call never
    // came here, only the question text and its options did. A question's
    // `updatedInput` has to carry the whole call back or the harness refuses it
    // for the `questions` it is missing, so the harness that parked the ask
    // folds these into the input it kept (settledQuestionResult in
    // @cawco/core, mirroring the dashboard's questionAnswer). A denial says so
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

  async setTitle(title) {
    const response = await fetch(
      `${hubHttpUrl()}/api/instances/${encodeURIComponent(instanceId)}/title`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      }
    );
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text);
    }
    return text;
  },
});
