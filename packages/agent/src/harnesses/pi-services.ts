/** Pi metadata, history and fleet profile. Shared with the host; no turn factory. */
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  AuthState,
  FleetHoldings,
  FleetItemState,
  FleetMcpConfig,
  FleetSyncReport,
  HarnessCapabilities,
  HarnessReport,
  ModelInfo,
  NeutralAssistantBlock,
  NeutralContentBlock,
  NeutralSessionInfo,
  PlacedFleetConfig,
  SessionMessage,
  TranscriptWindow,
  WindowAsk,
} from "@cawco/core";
import {
  CONTROL_MODEL_CATALOG,
  CONTROL_PI_DEFAULT_MODEL,
  type ToolSpec,
  toolSpec,
} from "@cawco/core";
import { piAgentDir, piMemoryFile, piSkillsDir } from "@cawco/core/paths";
import { hostEnvironment } from "@cawco/core/session-env";
import { type LocatedRecord, readSpans } from "@cawco/jsonl-parser";
import type {
  ImageContent,
  Model,
  TextContent,
} from "@earendil-works/pi-ai/compat";
import {
  type AgentSessionServices,
  CURRENT_SESSION_VERSION,
  createAgentSessionServices,
  getAgentDir,
  type McpServerConfig,
  type ModelRuntime,
  resolveCliModel,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { hashText, heldSkills, skillDrift, skillRecords, syncMemory, syncSkillFiles } from "../fleet";
import {
  hookStatesInSet,
  hookStatesOn,
  readFleetHarnessSet,
} from "../fleet-harness-set";
import { apartSignedOut, readFleetMcpSet } from "../fleet-mcp-set";
import type { TranscriptSpan } from "../harness";
import { readSettledOnce } from "../mcp-status";
import { probeStarted } from "../probe-count";
import { toolGate } from "../tools";
import { readSidecar, writeJson } from "./fleet-common";
import { machineWithAccountsRuntime } from "./pi-accounts";
import { checkPiCredential, type PiCredentialState } from "./pi-auth";
import { piMcpEntry, piMcpList } from "./pi-mcp";
import { piOpenTurns } from "./pi-sessiond";
import {
  LineIndexes,
  unlessGone,
  windowCuts,
  windowRange,
} from "./transcript-index";

const PI_TOOL = toolSpec("pi");
if (!PI_TOOL) {
  throw new Error("The tool catalog names no pi");
}
/** The pi CLI's catalog entry: its version gate (tools.ts `toolGate`) reads it. */
export const PI_SPEC: ToolSpec = PI_TOOL;

const PI_SKILLS = piSkillsDir();
const PI_MEMORY = piMemoryFile();
const PI_SIDECAR = join(piAgentDir(), "cawco-fleet.json");

/**
 * The id a compaction's boundary goes by, live and read back alike: pi stores
 * one entry per compaction, and its own id is the summary's.
 */
/**
 * The notice a pi session's moved shell command leaves when it ends
 * (pi-runtime `PiShells`): a pi custom message of this type, which pi hands
 * the model as a user message, read back as the `task_notification` row the
 * live stream drew for it.
 */
export const BACKGROUND_SHELL = "cawco-background-shell";

/** The `details` of a {@link BACKGROUND_SHELL} notice: its `task_notification` frame's fields. */
export interface BackgroundShellEnd {
  status: "completed" | "failed";
  summary: string;
  taskId: string;
}

/** A stored message as {@link backgroundShellEntries} reads it. */
interface BackgroundShellMessage {
  customType?: string;
  details?: unknown;
  role?: string;
}

/** A stored message, as the `task_notification` row it is when it is a {@link BACKGROUND_SHELL} notice; none else. */
const backgroundShellEntries = (
  sessionKey: string,
  entry: { id: string; timestamp: string },
  message: BackgroundShellMessage
): SessionMessage[] => {
  const end = message.details as BackgroundShellEnd | undefined;
  if (
    message.role !== "custom" ||
    message.customType !== BACKGROUND_SHELL ||
    !end
  ) {
    return [];
  }
  return [
    {
      type: "system",
      uuid: entry.id,
      session_id: sessionKey,
      message: {
        type: "system",
        subtype: "task_notification",
        uuid: entry.id,
        session_id: sessionKey,
        task_id: end.taskId,
        status: end.status,
        summary: end.summary,
      },
      parent_tool_use_id: null,
      parent_agent_id: null,
      timestamp: entry.timestamp,
    },
  ];
};

export const compactBoundaryId = (compaction: string): string =>
  `${compaction}:boundary`;

/** A stored compaction as its boundary and its summary. */
const compactionEntries = (
  sessionKey: string,
  entry: {
    id: string;
    summary: string;
    timestamp: string;
    tokensBefore: number;
  },
  keptFrom: string | undefined
): SessionMessage[] => [
  {
    type: "system",
    uuid: compactBoundaryId(entry.id),
    session_id: sessionKey,
    message: {
      type: "system",
      subtype: "compact_boundary",
      uuid: compactBoundaryId(entry.id),
      session_id: sessionKey,
      compact_metadata: { pre_tokens: entry.tokensBefore },
    },
    parent_tool_use_id: null,
    parent_agent_id: null,
    timestamp: entry.timestamp,
  },
  {
    type: "user",
    uuid: entry.id,
    session_id: sessionKey,
    message: { role: "user", content: entry.summary },
    parent_tool_use_id: null,
    parent_agent_id: null,
    compactSummary: true,
    ...(keptFrom ? { keptFrom } : {}),
    timestamp: entry.timestamp,
  },
];

const PI_CAPABILITIES: HarnessCapabilities = {
  interrupt: true,
  permissionModes: [],
  setModel: true,
  effort: false,
  contextUsage: true,
  supportedModels: true,
  supportedCommands: true,
  reloadSkills: false,
  mcpStatus: true,
  mcpControl: false,
  listSessions: true,
  getSessionMessages: true,
  renameSession: false,
  deleteSession: true,
  fork: true,
  rewind: false,
  tagSession: false,
  skills: true,
  subagents: false,
  tasks: false,
  compaction: true,
  costUsd: false,
  thinking: true,
  images: true,
  handoff: true,
  hooks: true,
  plugins: false,
  fleet: true,
};

export const textOf = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((block) =>
        typeof block === "object" && block !== null && "text" in block
          ? String((block as { text: unknown }).text)
          : ""
      )
      .filter(Boolean)
      .join("\n");
  }
  return "";
};

export const contentOf = (content: unknown): string | NeutralContentBlock[] => {
  if (!(
    Array.isArray(content) && content.some((block) => block.type === "image")
  )) {
    return textOf(content);
  }
  return (content as (TextContent | ImageContent)[]).map((block) =>
    block.type === "image"
      ? {
          type: "image",
          source: {
            type: "base64",
            media_type: block.mimeType,
            data: block.data,
          },
        }
      : { type: "text", text: block.text }
  );
};

// biome-ignore lint/suspicious/noExplicitAny: pi's model configuration varies across providers; only id is read
const modelIdOf = (model: Model<any>): string =>
  String((model as { id?: unknown }).id ?? "");

/**
 * How CawCo names a pi model: `provider/id`, pi's own `--model` grammar. A
 * bare id is ambiguous once a proxy and a subscription offer the same model
 * (`gpt-5.5` from `openai-codex` and from a proxy), and only the provider says
 * which account, if any, a session runs on.
 */
// biome-ignore lint/suspicious/noExplicitAny: pi's model configuration varies across providers; only provider and id are read
export const piModelValue = (model: Model<any>): string =>
  `${model.provider}/${modelIdOf(model)}`;

/**
 * The model a CawCo model value names, by pi's own resolver
 * (`resolveCliModel`: `provider/id` first, then an id unique among the
 * providers signed in), and only when `runtime` can run it.
 */
export const resolvePiModel = async (
  runtime: ModelRuntime,
  value: string
  // biome-ignore lint/suspicious/noExplicitAny: pi's model configuration varies across providers
): Promise<Model<any>> => {
  const resolved = resolveCliModel({ cliModel: value, modelRuntime: runtime });
  const { model } = resolved;
  if (!model) {
    throw new Error(
      `pi cannot use model ${value}: ${resolved.error ?? "pi knows no such model."}`
    );
  }
  const available = await runtime.getAvailable();
  if (
    !available.some(
      (one) =>
        one.provider === model.provider && modelIdOf(one) === modelIdOf(model)
    )
  ) {
    throw new Error(
      `pi cannot use model ${value}: it is not available with the configured provider credentials.`
    );
  }
  return model;
};

/**
 * pi's own resolution of each bare model id pi can run on this machine, with
 * its accounts ({@link HarnessReport.modelNames}): `resolveCliModel`'s answer
 * for each.
 */
const modelNames = async (): Promise<Record<string, string>> => {
  const { modelRuntime } = await PiProfile.services();
  const available = await modelRuntime.getAvailable();
  const names: Record<string, string> = {};
  for (const model of available) {
    const bare = modelIdOf(model);
    if (bare in names) {
      continue;
    }
    const resolved = resolveCliModel({
      cliModel: bare,
      modelRuntime,
    }).model;
    if (resolved) {
      names[bare] = piModelValue(resolved);
    }
  }
  return names;
};

/**
 * The model pi starts a new session on in `cwd` when none is named, with
 * this machine's accounts counted as signed in ({@link
 * CONTROL_PI_DEFAULT_MODEL}): its saved default, read through pi's own
 * settings merge for that directory (`SettingsManager.create(cwd)`: the
 * global `settings.json` and `<cwd>/.pi/settings.json`,
 * core/settings-manager.js 99-100), when that model's provider has auth
 * configured (`findInitialModel`, core/model-resolver.js 503-515). Null when
 * it has none: pi then picks among the machine's own providers, which needs
 * no account.
 */
const piDefaultModel = async (cwd: string): Promise<string | null> => {
  const { modelRuntime } = await PiProfile.services();
  await modelRuntime.getAvailable();
  const settings = SettingsManager.create(cwd, getAgentDir());
  const provider = settings.getDefaultProvider();
  const id = settings.getDefaultModel();
  const saved =
    provider && id ? modelRuntime.getModel(provider, id) : undefined;
  return saved && modelRuntime.hasConfiguredAuth(saved.provider)
    ? piModelValue(saved)
    : null;
};

/** The models `runtime` (the machine's own with its accounts, unless a session's is given) can run. */
export const modelCatalog = async (
  runtime?: ModelRuntime
): Promise<ModelInfo[]> => {
  const { modelRuntime, settingsManager } = await PiProfile.services();
  await settingsManager.reload();
  const available = await (runtime ?? modelRuntime).getAvailable();
  const rows: ModelInfo[] = available.map((model) => ({
    value: piModelValue(model),
    displayName: String((model as { name?: unknown }).name ?? modelIdOf(model)),
    contextWindow: model.contextWindow,
  }));
  const id = settingsManager.getDefaultModel();
  const provider = settingsManager.getDefaultProvider();
  const resolved = id
    ? available.find(
        (model) =>
          modelIdOf(model) === id && (!provider || model.provider === provider)
      )
    : undefined;
  const row = resolved
    ? rows.find((entry) => entry.value === piModelValue(resolved))
    : undefined;
  return row
    ? [...rows, { ...row, value: "default", resolvedModel: row.value }]
    : rows;
};

export function toBlocks(content: unknown): NeutralAssistantBlock[] {
  if (!Array.isArray(content)) {
    return [];
  }
  const blocks: NeutralAssistantBlock[] = [];
  for (const block of content) {
    const b = block as {
      type?: string;
      text?: string;
      thinking?: string;
      id?: string;
      name?: string;
      arguments?: Record<string, unknown>;
    };
    if (b.type === "text" && b.text) {
      blocks.push({ type: "text", text: b.text });
    } else if (b.type === "thinking" && b.thinking) {
      blocks.push({ type: "thinking", thinking: b.thinking });
    } else if (b.type === "toolCall" && b.id && b.name) {
      blocks.push({
        type: "tool_use",
        id: b.id,
        name: b.name,
        input: b.arguments ?? {},
      });
    }
  }
  return blocks;
}

const failedTurn = (
  sessionKey: string,
  entry: { id: string; timestamp: string },
  errorMessage: string
): SessionMessage => ({
  type: "system",
  uuid: `${entry.id}:error`,
  session_id: sessionKey,
  message: {
    type: "result",
    uuid: `${entry.id}:error`,
    session_id: sessionKey,
    subtype: "error_during_execution",
    is_error: true,
    errors: [errorMessage],
  },
  parent_tool_use_id: null,
  parent_agent_id: null,
  timestamp: entry.timestamp,
});

const assistantEntries = (
  sessionKey: string,
  entry: { id: string; timestamp: string },
  message: { content?: unknown },
  next: string | undefined
): SessionMessage[] => {
  const blocks = toBlocks(message.content);
  const { errorMessage, stopReason } = message as {
    errorMessage?: string;
    stopReason?: string;
  };
  // A stored failed attempt isn't the turn's result during a retry gap.
  const retried =
    next === "assistant" || (next === undefined && piOpenTurns.has(sessionKey));
  return [
    ...(blocks.length
      ? [
          {
            type: "assistant" as const,
            uuid: entry.id,
            session_id: sessionKey,
            message: { role: "assistant", content: blocks },
            parent_tool_use_id: null,
            parent_agent_id: null,
            timestamp: entry.timestamp,
            ...(stopReason === "stop" ? { turnEnd: true as const } : {}),
          },
        ]
      : []),
    ...(errorMessage && !retried
      ? [failedTurn(sessionKey, entry, errorMessage)]
      : []),
  ];
};

/**
 * One line of a pi session file as its line index keeps it: what the path
 * walk and the window's cuts read, and where the entry lies in the file.
 */
interface PiNode {
  /** An assistant message with blocks of its own (`toBlocks`). */
  blocks?: true;
  byteLength: number;
  /** An assistant message that ended on an error. */
  error?: true;
  /** A compaction's first kept entry. */
  firstKept?: string;
  id: string;
  /** The tool calls it makes or answers, the background command it ends: a window never starts between two that name one. */
  ids?: string[];
  offset: number;
  /** A user message that says something: a window may start here. */
  opens?: true;
  parentId: string | null;
  role?: string;
  /** A background command's end ({@link BACKGROUND_SHELL}). */
  shell?: true;
  type: string;
  /** The header's session format version. */
  version?: number;
}

/** One stored line as the index keeps it. */
const piNodeOf = (located: LocatedRecord): PiNode => {
  const entry = located.record as unknown as {
    details?: unknown;
    firstKeptEntryId?: string;
    id?: string;
    message?: {
      content?: unknown;
      customType?: string;
      details?: unknown;
      errorMessage?: string;
      role?: string;
      toolCallId?: string;
    };
    parentId?: string | null;
    type: string;
    version?: number;
  };
  const node: PiNode = {
    id: entry.id ?? "",
    parentId: entry.parentId ?? null,
    type: entry.type,
    offset: located.offset,
    byteLength: located.byteLength,
  };
  if (entry.type === "session") {
    node.version = entry.version ?? 1;
  }
  if (entry.type === "compaction" && entry.firstKeptEntryId) {
    node.firstKept = entry.firstKeptEntryId;
  }
  const message = entry.type === "message" ? entry.message : undefined;
  if (!message) {
    return node;
  }
  node.role = message.role;
  Object.assign(node, messageFacts(message));
  return node;
};

/** A stored pi message's facts, as its node keeps them ({@link PiNode}). */
const messageFacts = (message: {
  content?: unknown;
  customType?: string;
  details?: unknown;
  errorMessage?: string;
  role?: string;
  toolCallId?: string;
}): Pick<PiNode, "blocks" | "error" | "ids" | "opens" | "shell"> => {
  switch (message.role ?? "") {
    case "user":
      return textOf(contentOf(message.content)).trim() ? { opens: true } : {};
    case "assistant": {
      const blocks = toBlocks(message.content);
      const ids = blocks.flatMap((block) =>
        block.type === "tool_use" ? [block.id] : []
      );
      return {
        ...(blocks.length > 0 ? { blocks: true as const } : {}),
        ...(message.errorMessage ? { error: true as const } : {}),
        ...(ids.length > 0 ? { ids } : {}),
      };
    }
    case "toolResult":
      return message.toolCallId ? { ids: [message.toolCallId] } : {};
    case "custom":
      return message.customType === BACKGROUND_SHELL && message.details
        ? {
            shell: true,
            ids: [`task:${(message.details as BackgroundShellEnd).taskId}`],
          }
        : {};
    default:
      return {};
  }
};

/** Every pi session file's line index. */
const piIndexes = new LineIndexes<PiNode>(() => true, piNodeOf);

/**
 * A session file laid out for reading: its entries in file order
 * (`stored`), the path from the root to its leaf (`path`, the conversation
 * as it was said: pi's leaf is the last entry it appended), each path
 * entry's place, and where a window may start on it.
 */
interface PiPlan {
  at: Map<string, number>;
  cuts: number[];
  /** Each path entry's next message's role. */
  nextRoles: (string | undefined)[];
  path: PiNode[];
  stored: PiNode[];
}

/** Each node's next message's role, read back from the end once. */
const nextRolesOf = (nodes: readonly PiNode[]): (string | undefined)[] => {
  const roles = new Array<string | undefined>(nodes.length);
  let next: string | undefined;
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    roles[i] = next;
    if (nodes[i]?.type === "message") {
      next = nodes[i]?.role;
    }
  }
  return roles;
};

/**
 * The file's plan, through its line index. A file in a format older than
 * pi's own (CURRENT_SESSION_VERSION) is opened by pi first, once, which
 * migrates it in place, as resuming it would.
 */
async function piPlanOf(path: string, cwd: string): Promise<PiPlan> {
  let index = await piIndexes.get(path);
  const header = index.nodes.find((node) => node.type === "session");
  if (header && (header.version ?? 1) < CURRENT_SESSION_VERSION) {
    SessionManager.open(path, undefined, cwd);
    index = await piIndexes.get(path);
  }
  const built = index.memo.get("plan") as PiPlan | undefined;
  if (built) {
    return built;
  }
  const stored = index.nodes.filter((node) => node.type !== "session");
  const byId = new Map(stored.map((node) => [node.id, node]));
  const path_: PiNode[] = [];
  const seen = new Set<string>();
  for (
    let node = stored.at(-1);
    node && !seen.has(node.id);
    node = node.parentId ? byId.get(node.parentId) : undefined
  ) {
    seen.add(node.id);
    path_.push(node);
  }
  path_.reverse();
  const at = new Map(path_.map((node, i) => [node.id, i]));
  const cuts = windowCuts(path_, (i) => !!path_[i]?.opens);
  const plan = { at, cuts, nextRoles: nextRolesOf(path_), path: path_, stored };
  index.memo.set("plan", plan);
  return plan;
}

/** A stored pi entry, as reading one back types it. */
interface StoredPiEntry {
  firstKeptEntryId: string;
  id: string;
  message?: { role?: string; content?: unknown };
  summary: string;
  timestamp: string;
  tokensBefore: number;
  type: string;
}

/**
 * The first transcript entry a stored message at `index` of `nodes` makes,
 * as {@link messageEntries} makes it, read off its node: its own id, or a
 * failed attempt's line when nothing retried it.
 */
const firstMade = (
  nodes: readonly PiNode[],
  index: number,
  next: string | undefined,
  sessionKey: string
): string | undefined => {
  const node = nodes[index];
  if (node?.type !== "message") {
    return;
  }
  if (node.role === "user" || node.role === "toolResult" || node.shell) {
    return node.id;
  }
  if (node.role !== "assistant") {
    return;
  }
  if (node.blocks) {
    return node.id;
  }
  const retried =
    next === "assistant" || (next === undefined && piOpenTurns.has(sessionKey));
  return node.error && !retried ? `${node.id}:error` : undefined;
};

/** The transcript entries one stored message makes; `next` the role of the message after it. */
const messageEntries = (
  sessionKey: string,
  entry: StoredPiEntry,
  message: { role?: string; content?: unknown },
  next: string | undefined
): SessionMessage[] => {
  const entries: SessionMessage[] = [];
  if (message.role === "user") {
    entries.push({
      type: "user",
      uuid: entry.id,
      session_id: sessionKey,
      message: { role: "user", content: contentOf(message.content) },
      parent_tool_use_id: null,
      parent_agent_id: null,
      timestamp: entry.timestamp,
    });
  } else if (message.role === "assistant") {
    entries.push(...assistantEntries(sessionKey, entry, message, next));
  } else if (message.role === "toolResult") {
    const tool = message as { toolCallId?: string; isError?: boolean };
    entries.push({
      type: "user",
      uuid: entry.id,
      session_id: sessionKey,
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: tool.toolCallId ?? "",
            content: contentOf(message.content),
            is_error: tool.isError,
          },
        ],
      },
      parent_tool_use_id: null,
      parent_agent_id: null,
      timestamp: entry.timestamp,
    });
  }
  entries.push(
    ...backgroundShellEntries(
      sessionKey,
      entry,
      message as BackgroundShellMessage
    )
  );
  return entries;
};

/**
 * The transcript entries of `nodes[from..to)` (a plan's path, or every
 * stored entry), their entries read back by byte range. Each assistant
 * message's next message role (a failed attempt retried) and each
 * compaction's first kept entry are read off the nodes, whichever window
 * they are in.
 */
async function piEntriesAt(
  file: string,
  sessionKey: string,
  nodes: readonly PiNode[],
  plan: PiPlan,
  from: number,
  to: number
): Promise<SessionMessage[]> {
  const roles = nodes === plan.path ? plan.nextRoles : nextRolesOf(nodes);
  const placeOf =
    nodes === plan.path
      ? plan.at
      : new Map(nodes.map((node, i) => [node.id, i]));
  const read = await readSpans(file, nodes.slice(from, to));
  const entries: SessionMessage[] = [];
  read.forEach((record, offset) => {
    const index = from + offset;
    const entry = record as unknown as StoredPiEntry | undefined;
    // A compaction, where it happened — where the live stream drew it
    // (pi-runtime). Its boundary carries what pi stores of it: how full the
    // context was, not what triggered it. What the model still holds from
    // before it begins at the first entry it kept (`keptFrom`).
    if (entry?.type === "compaction") {
      const kept = placeOf.get(entry.firstKeptEntryId) ?? index;
      let keptFrom: string | undefined;
      for (let at = kept; at < index && keptFrom === undefined; at += 1) {
        keptFrom = firstMade(nodes, at, roles[at], sessionKey);
      }
      entries.push(...compactionEntries(sessionKey, entry, keptFrom));
      return;
    }
    const message = entry?.type === "message" ? entry.message : undefined;
    if (entry && message) {
      entries.push(...messageEntries(sessionKey, entry, message, roles[index]));
    }
  });
  return entries;
}

/** The window `ask` names of the session stored at `path` (the services' `readTranscriptWindow`). */
async function piWindow(
  path: string,
  dir: string,
  sessionKey: string,
  ask: WindowAsk
): Promise<TranscriptWindow> {
  const plan = await piPlanOf(path, dir);
  const { length } = plan.path;
  // An entry's id is its stored entry's, or that one's marked
  // (`<id>:error`, `<id>:boundary`): a cut names its stored entry by it.
  const { from, to } = windowRange(
    plan.cuts,
    length,
    (id) => plan.at.get(id.split(":")[0] ?? id),
    ask
  );
  let entries = await piEntriesAt(path, sessionKey, plan.path, plan, from, to);
  if ("through" in ask) {
    const cut = entries.findIndex((entry) => entry.uuid === ask.through);
    entries = cut >= 0 ? entries.slice(0, cut + 1) : entries;
  }
  return {
    entries,
    older: from > 0 ? (plan.path[from]?.id ?? null) : null,
    newer: "start" in ask && to < length ? (plan.path[to]?.id ?? null) : null,
  };
}

/**
 * The file pi stores a session in: `<timestamp>_<id>.jsonl` in the folder pi
 * keeps its sessions for `cwd` (named by pi itself: `getSessionDir` of a
 * session not yet written, which writes nothing). Found by its name alone:
 * pi's own listing reads every session file in the folder through.
 */
export async function piSessionPath(
  sessionKey: string,
  cwd: string
): Promise<string | undefined> {
  const dir = SessionManager.create(cwd).getSessionDir();
  const names = await readdir(dir).catch(() => [] as string[]);
  const name = names.find(
    (one) => one.endsWith(".jsonl") && one.includes(sessionKey)
  );
  return name ? join(dir, name) : undefined;
}

let servicesPromise: Promise<AgentSessionServices> | null = null;
const PI_AUTH_STATE: Record<PiCredentialState["state"], AuthState> = {
  "signed-in": "authenticated",
  "signed-out": "unauthenticated",
  unknown: "unreadable-credentials",
};

/**
 * The fleet's MCP servers as pi's own client finds them ({@link piMcpList}),
 * each as every CawCo pi session takes it (pi-runtime.ts): one pi cannot take
 * says why, and one the hub holds no sign-in for needs one, unread
 * ({@link apartSignedOut}). A project's placed copies (`placed`) are applied
 * once in the set, as on Claude Code.
 */
const piFleetMcp = async (
  servers: Record<string, FleetMcpConfig>,
  placed: readonly string[]
): Promise<Record<string, FleetItemState>> => {
  const { read, signedOut } = apartSignedOut(
    Object.keys(servers),
    await readFleetMcpSet()
  );
  const report: Record<string, FleetItemState> = { ...signedOut };
  const taken: Record<string, McpServerConfig> = {};
  for (const name of read) {
    const entry = piMcpEntry(servers[name] as FleetMcpConfig);
    if ("skipped" in entry) {
      report[name] = { state: "unsupported", detail: entry.skipped };
    } else {
      taken[name] = entry;
    }
  }
  for (const key of placed) {
    report[key] = { state: "applied" };
  }
  return {
    ...report,
    ...(await readSettledOnce("pi", taken, piMcpList)),
  };
};

/** Read-only SDK metadata plus the machine's pi profile; both processes use it. */
export class PiProfile {
  readonly kind = "pi" as const;
  readonly capabilities = PI_CAPABILITIES;
  auth: AuthState = "authenticated";
  authReason: string | undefined;

  /**
   * Load extensions too: registered providers must appear in the model
   * picker. Its runtime is the machine's with its accounts
   * ({@link machineWithAccountsRuntime}): a provider whose sign-in moved into
   * an account is still one pi offers here.
   */
  static services(): Promise<AgentSessionServices> {
    if (!servicesPromise) {
      servicesPromise = (async () => {
        const services = await createAgentSessionServices({
          cwd: homedir(),
          modelRuntime: await machineWithAccountsRuntime(),
        });
        for (const diagnostic of services.diagnostics) {
          console.warn(`[pi] ${diagnostic.type}: ${diagnostic.message}`);
        }
        return services;
      })().catch((error) => {
        servicesPromise = null;
        throw error;
      });
    }
    return servicesPromise;
  }

  async detect(): Promise<HarnessReport> {
    probeStarted();
    // The version gate's word on the machine's pi (tools.ts `toolGate`): the
    // start's refusal, typed, which the dashboard puts where it blocks.
    const gate = await toolGate(PI_SPEC);
    const installed = gate.refused !== "not-installed";
    // One that cannot be read says why instead.
    const read = installed
      ? await modelCatalog().then(
          (models) => ({ models }),
          (error: unknown) => {
            console.warn(`[pi] model catalog unavailable: ${error}`);
            return {
              modelsUnread: `pi didn't list its models (${error instanceof Error ? error.message : String(error)}).`,
            };
          }
        )
      : {};
    const names = installed
      ? await modelNames().catch((error: unknown) => {
          console.warn(`[pi] model names unavailable: ${error}`);
        })
      : undefined;
    const credential = installed ? await this.checkCredential() : undefined;
    this.#setCredential(credential);
    if (!installed) {
      this.auth = "unauthenticated";
    }
    // A pi too old is the machine's word on pi; one not there is no fault.
    const reason =
      (gate.refused === "version" ? gate.words : undefined) ??
      credential?.reason;
    return {
      harness: "pi",
      installed,
      ...(gate.version ? { version: gate.version } : {}),
      auth: this.auth,
      ...(reason ? { authReason: reason } : {}),
      ...(gate.refused ? { refused: gate.refused } : {}),
      capabilities: PI_CAPABILITIES,
      ...read,
      ...(names ? { modelNames: names } : {}),
    };
  }

  async checkCredential(
    modelId?: string
  ): Promise<PiCredentialState | undefined> {
    try {
      const { modelRuntime, settingsManager } = await PiProfile.services();
      const defaultId = settingsManager.getDefaultModel();
      const defaultProvider = settingsManager.getDefaultProvider();
      const defaultValue =
        defaultId && defaultProvider
          ? `${defaultProvider}/${defaultId}`
          : defaultId;
      const asked = modelId && modelId !== "default" ? modelId : defaultValue;
      // pi's resolver alone, not resolvePiModel: a model whose provider is
      // signed out is not available, and that is what is asked here.
      const model = asked
        ? resolveCliModel({ cliModel: asked, modelRuntime }).model
        : undefined;
      const credential: PiCredentialState = model
        ? await checkPiCredential(modelRuntime, model.provider)
        : {
            state: "unknown",
            reason: asked
              ? `pi: sign-in status unknown — pi knows no model ${asked}`
              : "pi: sign-in status unknown — pi has no default model",
          };
      if (
        !modelId ||
        modelId === "default" ||
        (model !== undefined &&
          modelIdOf(model) === defaultId &&
          model.provider === defaultProvider)
      ) {
        this.#setCredential(credential);
      }
      return credential;
    } catch {
      const credential = {
        state: "unknown" as const,
        reason: "pi: sign-in status unknown — provider metadata unavailable",
      };
      if (!modelId || modelId === "default") {
        this.auth = "unreadable-credentials";
        this.authReason = credential.reason;
      }
      return credential;
    }
  }

  #setCredential(credential: PiCredentialState | undefined): void {
    this.auth = PI_AUTH_STATE[credential?.state ?? "signed-in"];
    this.authReason = credential?.reason;
  }

  /**
   * pi's stored conversations: those run in `dir`, or without one every
   * conversation on this machine, which is the catalog a register reads to
   * tell a session it can resume from one that left nothing.
   */
  async listSessions(dir?: string): Promise<NeutralSessionInfo[]> {
    const sessions = dir
      ? await SessionManager.list(dir)
      : await SessionManager.listAll();
    return sessions.map((info) => ({
      sessionId: info.id,
      harness: "pi",
      createdAt: info.created.getTime(),
      lastModified: info.modified.getTime(),
      ...(info.cwd || dir ? { cwd: info.cwd || dir } : {}),
      ...(info.firstMessage ? { firstPrompt: info.firstMessage } : {}),
      ...(info.name ? { customTitle: info.name } : {}),
    }));
  }

  async getSessionInfo(
    sessionKey: string,
    dir?: string
  ): Promise<NeutralSessionInfo | undefined> {
    return (await this.listSessions(dir)).find(
      (one) => one.sessionId === sessionKey
    );
  }

  /**
   * The session's stored entries as transcript entries. pi keeps a session
   * as a tree of entries, a compaction one of them where it ran (what the
   * model reads next starts at the entry it kept, `firstKeptEntryId`), so
   * the path from the root to the current leaf (`getBranch`) is the
   * conversation as it was said, every compaction in its place, and no
   * branch the session left: the `chain` span. `whole` is every entry
   * stored, abandoned branches too (`getEntries`). A `tail` is the newest
   * window's end. Read through the session file's line index
   * ({@link piPlanOf}), never pi's own whole-file load.
   */
  async getSessionMessages(
    sessionKey: string,
    dir?: string,
    tail?: number,
    span: TranscriptSpan = "chain"
  ): Promise<SessionMessage[]> {
    if (!dir) {
      return [];
    }
    if (tail) {
      const window = await this.readTranscriptWindow(sessionKey, dir, {
        end: "newest",
        limit: tail,
      });
      return window.entries.slice(-tail);
    }
    const path = await piSessionPath(sessionKey, dir);
    if (!path) {
      return [];
    }
    // A session file deleted while it is read reads as one never found.
    return unlessGone(async () => {
      const plan = await piPlanOf(path, dir);
      const nodes = span === "whole" ? plan.stored : plan.path;
      return piEntriesAt(path, sessionKey, nodes, plan, 0, nodes.length);
    }, []);
  }

  /**
   * A window of the conversation as it was said (the path to the leaf),
   * starting where a turn opens and nothing before it is answered after it:
   * a tool call and its result, a background command and its notice. Each
   * compaction names the first entry it kept from the whole path, whichever
   * window that entry is in.
   */
  async readTranscriptWindow(
    sessionKey: string,
    dir: string | undefined,
    ask: WindowAsk
  ): Promise<TranscriptWindow> {
    const path = dir ? await piSessionPath(sessionKey, dir) : undefined;
    if (!(path && dir)) {
      return { entries: [], older: null, newer: null };
    }
    // A session file deleted while it is read reads as one never found.
    return unlessGone(() => piWindow(path, dir, sessionKey, ask), {
      entries: [],
      older: null,
      newer: null,
    });
  }

  renameSession(): Promise<void> {
    return Promise.resolve();
  }
  tagSession(): Promise<void> {
    return Promise.resolve();
  }
  async deleteSession(sessionKey: string, dir?: string): Promise<void> {
    if (!dir) {
      return;
    }
    const path = await piSessionPath(sessionKey, dir);
    if (path) {
      await Bun.$`rm -f ${path}`.env(hostEnvironment()).quiet().nothrow();
    }
  }
  dispose(): Promise<void> {
    servicesPromise = null;
    return Promise.resolve();
  }
  async machine(method: string, args: unknown[]): Promise<unknown> {
    if (method === CONTROL_PI_DEFAULT_MODEL) {
      return await piDefaultModel(String(args[0]));
    }
    return method === CONTROL_MODEL_CATALOG ? await modelCatalog() : undefined;
  }

  async syncFleet(config: PlacedFleetConfig): Promise<FleetSyncReport> {
    const sidecar = await readSidecar(PI_SIDECAR);
    const report: FleetSyncReport = {
      mcp: {},
      marketplaces: {},
      plugins: {},
      skills: {},
      // CawCo's inline extension runs the fleet's hooks from the harness
      // set (pi-runtime.ts `FleetHooks`); what it cannot run is said
      // unsupported here.
      hooks: hookStatesOn(
        "pi",
        config.hooks.filter((hook) => hook.enabled)
      ),
      at: Date.now(),
    };
    const enabled = config.mcp.filter((row) => row.enabled);
    for (const row of config.mcp) {
      if (!row.enabled) {
        report.mcp[row.name] = { state: "disabled" };
      }
    }
    for (const name of sidecar.mcp ?? []) {
      if (!enabled.some((row) => row.name === name)) {
        report.mcp[name] = { state: "removed" };
      }
    }
    Object.assign(
      report.mcp,
      await piFleetMcp(
        Object.fromEntries(enabled.map((row) => [row.name, row.config])),
        config.placedMcp
          .filter((row) => row.enabled && row.cwd && row.placeId)
          .map((row) => `${row.name}@${row.placeId}`)
      )
    );
    const skills = await syncSkillFiles(
      PI_SKILLS,
      config.skills,
      sidecar.skills,
      report.skills as NonNullable<FleetSyncReport["skills"]>
    );
    const memory = await syncMemory(
      PI_MEMORY,
      config.memory,
      sidecar.memory,
      report
    );
    await writeJson(PI_SIDECAR, {
      skills,
      mcp: config.mcp.filter((row) => row.enabled).map((row) => row.name),
      ...(memory ? { memory } : {}),
    });
    return report;
  }

  /** The skills cawco wrote into pi's directory, as they are on disk now. */
  async fleetHoldings(): Promise<FleetHoldings> {
    const sidecar = await readSidecar(PI_SIDECAR);
    return {
      skills: await heldSkills(PI_SKILLS, Object.keys(sidecar.skills)),
    };
  }

  async fleetStatus(): Promise<FleetSyncReport> {
    const sidecar = await readSidecar(PI_SIDECAR);
    const report: FleetSyncReport = {
      mcp: {},
      marketplaces: {},
      plugins: {},
      skills: {},
      hooks: hookStatesInSet("pi", await readFleetHarnessSet()),
      at: Date.now(),
    };
    const set = await readFleetMcpSet();
    report.mcp = await piFleetMcp(set.servers, Object.keys(set.placed));
    const held = await heldSkills(PI_SKILLS, Object.keys(sidecar.skills));
    const records = await skillRecords(PI_SKILLS, sidecar.skills, held);
    for (const [name, recorded] of Object.entries(records)) {
      const drift = skillDrift(held[name], recorded, recorded);
      let state: FleetItemState = { state: "applied" };
      if (held[name] === undefined) {
        state = { state: "failed", cause: "absent", detail: "not on disk" };
      } else if (drift) {
        state = { state: "failed", cause: "drifted", detail: drift };
      }
      (report.skills as NonNullable<FleetSyncReport["skills"]>)[name] = state;
    }
    if (sidecar.memory !== undefined) {
      const file = Bun.file(PI_MEMORY);
      const hash = (await file.exists()) ? hashText(await file.text()) : null;
      if (hash === sidecar.memory) {
        report.memory = { state: "applied" };
      } else if (hash === null) {
        report.memory = {
          state: "failed",
          cause: "absent",
          detail: "not on disk",
        };
      } else {
        report.memory = {
          state: "failed",
          cause: "drifted",
          detail: "edited on this machine",
        };
      }
    }
    return report;
  }
}
