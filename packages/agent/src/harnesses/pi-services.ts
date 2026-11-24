/** Pi metadata, history and fleet profile. Shared with the host; no turn factory. */

import type { Dirent } from "node:fs";
import { readdir, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { unlessGone } from "@cawco/core/absent";
import { CONTROL_PI_DEFAULT_MODEL } from "@cawco/core/accounts/controls";
import type {
  FleetHoldings,
  FleetItemState,
  FleetMcpConfig,
  FleetSyncReport,
  PlacedFleetConfig,
} from "@cawco/core/fleet";
import { makeFolder } from "@cawco/core/folders";
import type { HarnessCapabilities, HarnessReport } from "@cawco/core/harness";
import type { EffortLevel, ModelInfo } from "@cawco/core/harness/kinds";
import { EFFORT_LEVELS, isEffortLevel } from "@cawco/core/harness/kinds";
import {
  type PiMessage,
  type PiShellEnd,
  piBlockOf,
  piEntryOf,
  piLineOf,
  piShellEndOf,
} from "@cawco/core/harness/pi-wire";
import { fleetMemoryFile } from "@cawco/core/paths/fleet";
import {
  piAgentDir,
  piFleetSidecarFile,
  piFleetSkillsDir,
  piMemoryFile,
  piSkillsDir,
} from "@cawco/core/paths/harnesses";
import {
  CONTROL_FOLDER_COMMANDS,
  CONTROL_MODEL_CATALOG,
} from "@cawco/core/session/controls";
import type {
  AuthState,
  NeutralAssistantBlock,
  NeutralContentBlock,
  NeutralSessionInfo,
  SessionMessage,
  StoredRun,
} from "@cawco/core/session-messages";
import { withoutSkillMarkers } from "@cawco/core/skill-words";
import { type ToolSpec, toolSpec } from "@cawco/core/tools";
import type { TranscriptWindow, WindowAsk } from "@cawco/core/transcript-types";
import { unhandled } from "@cawco/core/unhandled";
import { harnessRefusedWords } from "@cawco/core/words/harness";
import {
  type LocatedRecord,
  readSpans,
  type TranscriptRecord,
  typeFilter,
} from "@cawco/jsonl-parser";
import {
  type Api,
  getSupportedThinkingLevels,
  type Model,
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
import { heldSkills, memoryState, syncMemory, syncSkillFiles } from "../fleet";
import { hookStatesInSet, readFleetHarnessSet } from "../fleet-harness-set";
import { apartSignedOut, readFleetMcpSet } from "../fleet-mcp-set";
import type { FleetPart } from "../fleet-parts";
import { placedMcpKeys, placeSets } from "../fleet-place-set";
import type { SomeControls, TranscriptSpan } from "../harness";
import { writeJson } from "../json-file";
import { readSettledOnce } from "../mcp-status";
import { probeStarted } from "../probe-count";
import { toolGate } from "../tools";
import { FULL_CAPABILITIES } from "./capabilities";
import {
  dropHarnessUserLayer,
  type FleetSidecar,
  readSidecar,
  skillStatesIn,
} from "./fleet-common";
import { lastPromptAt, timeOf } from "./last-prompt";
import { machineWithAccountsRuntime } from "./pi-accounts";
import { checkPiCredential, type PiCredentialState } from "./pi-auth";
import { piMcpEntry, piMcpList } from "./pi-mcp";
import { piOpenTurns } from "./pi-sessiond";
import {
  LineIndexes,
  transcriptOrGone,
  windowCuts,
  windowRange,
} from "./transcript-index";

const PI_TOOL = toolSpec("pi");
if (!PI_TOOL) {
  throw new Error("The tool catalog names no pi");
}
/** The pi CLI's catalog entry: its version gate (tools.ts `toolGate`) reads it. */
export const PI_SPEC: ToolSpec = PI_TOOL;

/** The fleet's skills for pi, in CawCo's own dir, which each session's loader takes (pi-runtime.ts `loaderSources`). */
const PI_SKILLS = piFleetSkillsDir();
/** The fleet's memory, in CawCo's own file, which each session takes as a context file (pi-runtime.ts `loaderSources`). */
const PI_MEMORY = fleetMemoryFile();
const PI_SIDECAR = piFleetSidecarFile();
/**
 * Where earlier versions wrote the fleet's memory and skills for pi: its own
 * agent dir's `AGENTS.md` and `skills`, which every `pi` reads. Taken back
 * out once (fleet-common.ts `dropHarnessUserLayer`).
 */
const USER_LAYER_WRITES = { memory: piMemoryFile(), skills: piSkillsDir() };

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

/** The custom type of a skill loaded before a session's first prompt (pi-runtime `loadSkills`); no transcript row. */
export const LOADED_SKILL = "cawco-skill";

/** The `details` of a {@link BACKGROUND_SHELL} notice: its `task_notification` frame's fields. */
export type BackgroundShellEnd = PiShellEnd;

/** A {@link BACKGROUND_SHELL} notice's end, read off its stored `details`; none for any other custom message. */
const shellEndOf = (entry: {
  customType: string;
  details?: unknown;
}): BackgroundShellEnd | undefined =>
  entry.customType === BACKGROUND_SHELL
    ? piShellEndOf(entry.details)
    : undefined;

/** A stored {@link BACKGROUND_SHELL} notice, as the `task_notification` row the live stream drew for it. */
const backgroundShellEntries = (
  sessionKey: string,
  entry: { id: string; timestamp: string },
  end: BackgroundShellEnd
): SessionMessage[] => [
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

/**
 * What pi's sessions do: everything but what pi has no way to (pi 1.5.2,
 * each reason by the flag).
 */
const PI_CAPABILITIES: HarnessCapabilities = {
  ...FULL_CAPABILITIES,
  // pi asks no approval before a tool call ("it does not ask for approval
  // before every tool call", pi docs/security.md) and has no mode to set.
  permissionModes: [],
  // pi keeps no tag on a session: its labels mark one entry in the tree
  // (`appendLabelChange`), not a conversation.
  tagSession: false,
  // "Pi ships with powerful defaults but skips features like sub-agents and
  // plan mode" (pi README.md): CawCo's delegation is its route.
  subagents: false,
  // pi has no task or to-do list of its own.
  tasks: false,
  // A plugin is a Claude Code marketplace's (core fleet.ts); pi has none.
  plugins: false,
};

export const textOf = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((block) =>
        typeof block === "object" && block !== null && "text" in block
          ? String(block.text)
          : ""
      )
      .filter(Boolean)
      .join("\n");
  }
  return "";
};

export const contentOf = (content: unknown): string | NeutralContentBlock[] => {
  const blocks = Array.isArray(content)
    ? content.flatMap((block: unknown) => {
        const read = piBlockOf(block);
        return read ? [read] : [];
      })
    : [];
  if (!blocks.some((block) => block.type === "image")) {
    return textOf(content);
  }
  return blocks.flatMap((block): NeutralContentBlock[] => {
    switch (block.type) {
      case "image":
        return [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: block.mimeType,
              data: block.data,
            },
          },
        ];
      case "text":
        return [{ type: "text", text: block.text }];
      // An answer's own blocks: a user's or a tool's content holds none.
      case "thinking":
      case "toolCall":
        return [];
      default:
        return unhandled("block", block);
    }
  });
};

/** What CawCo reads of a pi model to name it: its provider and its id. */
type PiModelName = Pick<Model<Api>, "id" | "provider">;

/**
 * How CawCo names a pi model: `provider/id`, pi's own `--model` grammar. A
 * bare id is ambiguous once a proxy and a subscription offer the same model
 * (`gpt-5.5` from `openai-codex` and from a proxy), and only the provider says
 * which account, if any, a session runs on.
 */
export const piModelValue = (model: PiModelName): string =>
  `${model.provider}/${model.id}`;

/**
 * The model a CawCo model value names, by pi's own resolver
 * (`resolveCliModel`: `provider/id` first, then an id unique among the
 * providers signed in), and only when `runtime` can run it.
 */
export const resolvePiModel = async (
  runtime: ModelRuntime,
  value: string
): Promise<Model<Api>> => {
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
      (one) => one.provider === model.provider && one.id === model.id
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
    const bare = model.id;
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

/**
 * The effort levels a pi model takes: pi's own thinking levels for it
 * (pi-ai `getSupportedThinkingLevels`: `off` alone for a model without
 * reasoning, else `off`, `minimal`, `low`, `medium`, `high`, and `xhigh` and
 * `max` where its `thinkingLevelMap` names them) that are CawCo's effort
 * levels by the same name. pi's `off` and `minimal` have no CawCo level, so
 * none is offered for them, and no CawCo level is mapped onto another of
 * pi's.
 */
const piEffortLevels = (model: Model<Api>): EffortLevel[] => {
  const levels: string[] = getSupportedThinkingLevels(model);
  return EFFORT_LEVELS.filter((level) => levels.includes(level));
};

/** The models `runtime` (the machine's own with its accounts, unless a session's is given) can run. */
export const modelCatalog = async (
  runtime?: ModelRuntime
): Promise<ModelInfo[]> => {
  const { modelRuntime, settingsManager } = await PiProfile.services();
  await settingsManager.reload();
  const available = await (runtime ?? modelRuntime).getAvailable();
  const rows: ModelInfo[] = available.map((model) => {
    const supportedEffortLevels = piEffortLevels(model);
    return {
      value: piModelValue(model),
      displayName: model.name,
      contextWindow: model.contextWindow,
      ...(supportedEffortLevels.length > 0
        ? { supportsEffort: true, supportedEffortLevels }
        : {}),
    };
  });
  const id = settingsManager.getDefaultModel();
  const provider = settingsManager.getDefaultProvider();
  const resolved = id
    ? available.find(
        (model) => model.id === id && (!provider || model.provider === provider)
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
    const b = piBlockOf(block);
    if (b?.type === "text" && b.text) {
      blocks.push({ type: "text", text: b.text });
    } else if (b?.type === "thinking" && b.thinking) {
      blocks.push({ type: "thinking", thinking: b.thinking });
    } else if (b?.type === "toolCall" && b.id && b.name) {
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
  message: PiMessage,
  next: string | undefined
): SessionMessage[] => {
  const blocks = toBlocks(message.content);
  const { errorMessage, stopReason } = message;
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
  const place = { offset: located.offset, byteLength: located.byteLength };
  const line = piLineOf(located.record);
  // A line not in the shape pi writes its entries in: no path holds it.
  if (!line) {
    return { id: "", parentId: null, type: located.record.type, ...place };
  }
  const node: PiNode = {
    id: line.id ?? "",
    parentId: line.parentId ?? null,
    type: line.type,
    ...place,
  };
  const entry = piEntryOf(located.record);
  // Any other line (a model change, a label): its place alone.
  if (!entry) {
    return node;
  }
  switch (entry.type) {
    case "session":
      node.version = entry.version ?? 1;
      break;
    case "compaction":
      if (entry.firstKeptEntryId) {
        node.firstKept = entry.firstKeptEntryId;
      }
      break;
    case "message":
      node.role = entry.message.role;
      Object.assign(node, messageFacts(entry.message));
      break;
    case "custom_message": {
      const end = shellEndOf(entry);
      if (end) {
        node.shell = true;
        node.ids = [`task:${end.taskId}`];
      }
      break;
    }
    default:
      unhandled("entry", entry);
  }
  return node;
};

/** A stored pi message's facts, as its node keeps them ({@link PiNode}). */
const messageFacts = (
  message: PiMessage
): Pick<PiNode, "blocks" | "error" | "ids" | "opens"> => {
  switch (message.role) {
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
    default:
      return {};
  }
};

/** Every pi session file's line index. */
const piIndexes = new LineIndexes<PiNode, PiPlan>(() => true, piNodeOf);

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
  const built = index.memo.get("plan");
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
  if (node?.shell) {
    return node.id;
  }
  if (node?.type !== "message") {
    return;
  }
  if (node.role === "user" || node.role === "toolResult") {
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
  entry: { id: string; timestamp: string },
  message: PiMessage,
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
    entries.push({
      type: "user",
      uuid: entry.id,
      session_id: sessionKey,
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: message.toolCallId ?? "",
            content: contentOf(message.content),
            is_error: message.isError,
          },
        ],
      },
      parent_tool_use_id: null,
      parent_agent_id: null,
      timestamp: entry.timestamp,
    });
  }
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
    const entry = piEntryOf(record);
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
    if (entry?.type === "message") {
      entries.push(
        ...messageEntries(sessionKey, entry, entry.message, roles[index])
      );
    }
    // A moved shell command's end, which pi stores as a custom message
    // ({@link BACKGROUND_SHELL}).
    if (entry?.type === "custom_message") {
      const end = shellEndOf(entry);
      if (end) {
        entries.push(...backgroundShellEntries(sessionKey, entry, end));
      }
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
 * An ask of a pi conversation (a read, a delete) that names no folder: pi keeps each one under
 * the folder it ran in, so with none it can't be found, which is no answer
 * that it holds nothing.
 */
const piUnlocated = (sessionKey: string): string =>
  `pi keeps conversation ${sessionKey} under the folder it ran in, and this ask named none, so it can't be found`;

/** Session `sessionKey`'s file in pi's session folder `dir`, by its name alone. */
const sessionFileIn = async (
  dir: string,
  sessionKey: string
): Promise<string | undefined> => {
  // Nothing there is no session; a folder that couldn't be read fails with
  // why, never answered as a conversation that was never stored.
  const names = await readdir(dir).catch(unlessGone<string[]>([]));
  const name = names.find(
    (one) => one.endsWith(".jsonl") && one.includes(sessionKey)
  );
  return name ? join(dir, name) : undefined;
};

/**
 * The file pi stores a session in: `<timestamp>_<id>.jsonl` in the folder pi
 * keeps its sessions for `cwd` (named by pi itself: `getSessionDir` of a
 * session not yet written, which writes nothing). Found by its name alone:
 * pi's own listing reads every session file in the folder through. One whose
 * project folder changed (Locate folder, hub project-locate.ts) is still
 * under its old folder's until its next start files it here
 * ({@link piFileUnder}), so the other folders are looked through then.
 */
export async function piSessionPath(
  sessionKey: string,
  cwd: string
): Promise<string | undefined> {
  const dir = SessionManager.create(cwd).getSessionDir();
  const here = await sessionFileIn(dir, sessionKey);
  if (here) {
    return here;
  }
  const root = dirname(dir);
  const folders = await readdir(root, { withFileTypes: true }).catch(
    unlessGone<Dirent[]>([])
  );
  for (const folder of folders) {
    const there = folder.isDirectory()
      ? await sessionFileIn(join(root, folder.name), sessionKey)
      : undefined;
    if (there) {
      return there;
    }
  }
}

/**
 * Session `sessionKey`'s file, filed in the folder pi keeps sessions for
 * `cwd`, where it runs now: moved there, its name kept, from whichever
 * folder holds it, so pi's own listing for that folder finds it, as pi's
 * `/import` carries a session file into a folder. Undefined when pi keeps
 * none of that id.
 */
export async function piFileUnder(
  sessionKey: string,
  cwd: string
): Promise<string | undefined> {
  const found = await piSessionPath(sessionKey, cwd);
  const dir = SessionManager.create(cwd).getSessionDir();
  if (!found || dirname(found) === dir) {
    return found;
  }
  const filed = join(dir, basename(found));
  await makeFolder(dir);
  await rename(found, filed);
  console.info(
    `[pi] session ${sessionKey}: filed under ${dir}, from ${dirname(found)}`
  );
  return filed;
}

/** An act on a pi conversation whose folder holds no session file of that id. */
const piNotStored = (sessionKey: string): string =>
  `pi keeps no conversation ${sessionKey} in that folder, so it can't be found`;

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
    const entry = piMcpEntry(servers[name]);
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

/**
 * A fleet sync's servers as pi takes them: each the fleet turned off said
 * disabled, each it wrote before (`handed`) and no longer carries said
 * removed, and the rest as pi finds them ({@link piFleetMcp}).
 */
const piMcpReport = async (
  config: PlacedFleetConfig,
  handed: readonly string[]
): Promise<Record<string, FleetItemState>> => {
  const enabled = config.mcp.filter((row) => row.enabled);
  const report: Record<string, FleetItemState> = {};
  for (const row of config.mcp) {
    if (!row.enabled) {
      report[row.name] = { state: "disabled" };
    }
  }
  for (const name of handed) {
    if (!enabled.some((row) => row.name === name)) {
      report[name] = { state: "removed" };
    }
  }
  return {
    ...report,
    ...(await piFleetMcp(
      Object.fromEntries(enabled.map((row) => [row.name, row.config])),
      config.placedMcp
        .filter((row) => row.enabled && row.cwd && row.placeId)
        .map((row) => `${row.name}@${row.placeId}`)
    )),
  };
};

/** Read-only SDK metadata plus the machine's pi profile; both processes use it. */

/** The lines a pi prompt can be on ({@link piPromptAt}), before any is parsed. */
const PI_PROMPT_TYPES = typeFilter("message");

/**
 * When a pi session entry was sent, if it is the person's prompt: a
 * `message` entry whose message is the `user` role's (pi's own
 * `SessionMessageEntry`; a tool's answer is `toolResult`, a command run with
 * `!` is `bashExecution`, and what an extension said is a `custom_message`
 * entry), timed as pi times it (session-manager.js
 * `getMessageActivityTime`: the message's own `timestamp`, else the entry's).
 */
function piPromptAt(record: TranscriptRecord): number | undefined {
  const entry = piEntryOf(record);
  if (entry?.type !== "message" || entry.message.role !== "user") {
    return;
  }
  return timeOf(entry.message.timestamp) ?? timeOf(entry.timestamp);
}

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
          model.id === defaultId &&
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
    // pi's own listing answers a folder it could not read as one that holds
    // no conversation (its `listSessionsFromDir` and `listAll` catch every
    // failure and answer []): the folder is looked in here first, so one
    // that is there and unreadable fails with why. Nothing there lists none.
    await readdir(
      dir
        ? SessionManager.create(dir).getSessionDir()
        : join(piAgentDir(), "sessions")
    ).catch(unlessGone([]));
    const sessions = dir
      ? await SessionManager.list(dir)
      : await SessionManager.listAll();
    const listed: NeutralSessionInfo[] = [];
    for (const info of sessions) {
      // pi's own `modified` is its last message of either side: the
      // person's own last prompt is read here (last-prompt.ts).
      const wroteAt = await lastPromptAt(
        info.path,
        PI_PROMPT_TYPES,
        piPromptAt
      );
      listed.push({
        sessionId: info.id,
        harness: "pi",
        createdAt: info.created.getTime(),
        lastModified: info.modified.getTime(),
        ...(wroteAt === undefined ? {} : { wroteAt }),
        ...(info.cwd || dir ? { cwd: info.cwd || dir } : {}),
        ...(info.firstMessage
          ? { firstPrompt: withoutSkillMarkers(info.firstMessage) }
          : {}),
        ...(info.name ? { customTitle: info.name } : {}),
      });
    }
    return listed;
  }

  /**
   * What the stored session ran with, as pi itself resumes it: the model
   * and thinking level its session file's entries leave it on (pi's
   * `buildSessionContext`). pi has no permission modes.
   */
  async storedRun(sessionKey: string, dir?: string): Promise<StoredRun> {
    const sessions = dir
      ? await SessionManager.list(dir)
      : await SessionManager.listAll();
    const stored = sessions.find((one) => one.id === sessionKey);
    if (!stored) {
      return {};
    }
    const { model, thinkingLevel } = SessionManager.open(
      stored.path
    ).buildSessionContext();
    return {
      ...(model
        ? {
            model: {
              from: "transcript",
              value: `${model.provider}/${model.modelId}`,
            },
          }
        : {}),
      ...(isEffortLevel(thinkingLevel)
        ? { effort: { from: "transcript", value: thinkingLevel } }
        : {}),
    };
  }

  async getSessionInfo(
    sessionKey: string,
    dir?: string
  ): Promise<NeutralSessionInfo | null> {
    return (
      (await this.listSessions(dir)).find(
        (one) => one.sessionId === sessionKey
      ) ?? null
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
      throw new Error(piUnlocated(sessionKey));
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
    return transcriptOrGone(async () => {
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
    if (!dir) {
      throw new Error(piUnlocated(sessionKey));
    }
    const path = await piSessionPath(sessionKey, dir);
    if (!path) {
      return { entries: [], older: null, newer: null };
    }
    // A session file deleted while it is read reads as one never found.
    return transcriptOrGone(() => piWindow(path, dir, sessionKey, ask), {
      entries: [],
      older: null,
      newer: null,
    });
  }

  /**
   * The conversation named `title` in pi itself: a `session_info` entry
   * appended to its session file by pi's own session manager
   * (`SessionManager.appendSessionInfo`, what `AgentSession.setSessionName`
   * and pi's `/name` write), which pi's listing reads back as the session's
   * name, the latest one in the file wherever it sits in the tree
   * (session-manager.js `buildSessionInfo`), so {@link listSessions} says it
   * as the conversation's title after any restart. pi only appends to a
   * session file, so a pi still writing it (its own terminal) keeps its
   * entries whole. A conversation CawCo runs is named on its hub row, never
   * here. One with no file (never answered) can't be found.
   */
  async renameSession(
    sessionKey: string,
    title: string,
    dir?: string
  ): Promise<void> {
    if (!dir) {
      throw new Error(piUnlocated(sessionKey));
    }
    const path = await piSessionPath(sessionKey, dir);
    if (!path) {
      throw new Error(piNotStored(sessionKey));
    }
    SessionManager.open(path, undefined, dir).appendSessionInfo(title);
  }
  /**
   * pi keeps no tag (`tagSession: false`): a tag cleared is one it never
   * had, which is done; a tag set is refused in those words, never answered
   * as done.
   */
  tagSession(_sessionKey: string, tag: string | null): Promise<void> {
    return tag === null
      ? Promise.resolve()
      : Promise.reject(
          new Error(
            harnessRefusedWords.keepsNo(
              "pi",
              "tag",
              "this conversation wasn't tagged"
            )
          )
        );
  }
  /**
   * The session's file removed. A read that names no folder can't find it,
   * and a removal that failed says why: neither is answered as done. A file
   * that is not there is a conversation already gone.
   */
  async deleteSession(sessionKey: string, dir?: string): Promise<void> {
    if (!dir) {
      throw new Error(piUnlocated(sessionKey));
    }
    const path = await piSessionPath(sessionKey, dir);
    if (path) {
      await rm(path, { force: true });
    }
  }
  dispose(): Promise<void> {
    servicesPromise = null;
    return Promise.resolve();
  }
  /** The machine-scoped controls pi's harness answers. */
  readonly machineControls: SomeControls = {
    [CONTROL_PI_DEFAULT_MODEL]: (cwd) => piDefaultModel(cwd),
    // pi has no slash commands: its sessions answer the same empty list.
    [CONTROL_FOLDER_COMMANDS]: () => Promise.resolve([]),
    [CONTROL_MODEL_CATALOG]: () => modelCatalog(),
  };

  /** pi's agent dir, which the fleet's one cleanups read (its sidecar is CawCo's own, core `piFleetSidecarFile`; its skills and memory are CawCo's own, core `piFleetSkillsDir` and `fleetMemoryFile`). */
  fleetHome() {
    return piAgentDir();
  }

  /**
   * The parts of one fleet sync pi has (fleet-parts.ts): its servers
   * (`mcp`), its skills dir (`skills`), its memory file (`memory`) and its
   * word on the hooks it runs (`hooks`); the sidecar keeps every other
   * part's record as it stands.
   */
  async syncFleet(
    config: PlacedFleetConfig,
    parts: ReadonlySet<FleetPart>
  ): Promise<FleetSyncReport> {
    const read = await readSidecar(PI_SIDECAR);
    // What an earlier version wrote into pi's own agent dir comes out
    // first, until it has.
    const sidecar: FleetSidecar = {
      ...read,
      userLayer: read.userLayer
        ? await dropHarnessUserLayer(read.userLayer, USER_LAYER_WRITES)
        : undefined,
    };
    const skillStates: Record<string, FleetItemState> = {};
    const report: FleetSyncReport = {
      mcp: {},
      marketplaces: {},
      plugins: {},
      skills: skillStates,
      // CawCo's inline extension runs the fleet's hooks from the harness
      // set (pi-runtime.ts `FleetHooks`), which Claude Code's converge
      // writes: their states are read from it once every harness's converge
      // has ended (`fleetHooks`).
      at: Date.now(),
    };
    const enabled = config.mcp.filter((row) => row.enabled);
    if (parts.has("mcp")) {
      report.mcp = await piMcpReport(config, sidecar.mcp ?? []);
    }
    const skills = parts.has("skills")
      ? await syncSkillFiles(
          PI_SKILLS,
          config.skills,
          sidecar.skills,
          skillStates
        )
      : sidecar.skills;
    const memory = parts.has("memory")
      ? await syncMemory(PI_MEMORY, config.memory, sidecar.memory, report)
      : sidecar.memory;
    if (parts.has("mcp") || parts.has("skills") || parts.has("memory")) {
      await writeJson(PI_SIDECAR, {
        skills,
        mcp: parts.has("mcp")
          ? enabled.map((row) => row.name)
          : (sidecar.mcp ?? []),
        ...(memory ? { memory } : {}),
        ...(sidecar.userLayer ? { userLayer: sidecar.userLayer } : {}),
        userLayerMoved: true,
      } satisfies FleetSidecar);
    }
    return report;
  }

  /** The skills cawco wrote into pi's directory, as they are on disk now. */
  async fleetHoldings(): Promise<FleetHoldings> {
    const sidecar = await readSidecar(PI_SIDECAR);
    return {
      skills: await heldSkills(PI_SKILLS, Object.keys(sidecar.skills)),
    };
  }

  /** Each fleet hook as CawCo's inline extension runs it: from the harness set and the places' files, as last written; what it cannot run, unsupported. */
  async fleetHooks(): Promise<Record<string, FleetItemState>> {
    return hookStatesInSet(
      "pi",
      await readFleetHarnessSet(),
      await placeSets()
    );
  }

  async fleetStatus(): Promise<FleetSyncReport> {
    const sidecar = await readSidecar(PI_SIDECAR);
    const places = await placeSets();
    const skillStates: Record<string, FleetItemState> = {};
    const report: FleetSyncReport = {
      mcp: {},
      marketplaces: {},
      plugins: {},
      skills: skillStates,
      hooks: await this.fleetHooks(),
      at: Date.now(),
    };
    const set = await readFleetMcpSet();
    report.mcp = await piFleetMcp(set.servers, placedMcpKeys(places));
    Object.assign(skillStates, await skillStatesIn(PI_SKILLS, sidecar.skills));
    if (sidecar.memory !== undefined) {
      report.memory = await memoryState(PI_MEMORY, sidecar.memory);
    }
    return report;
  }
}
