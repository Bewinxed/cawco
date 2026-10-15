/**
 * One OpenCode 2.0 session as the fleet runs it: 2.0's events turned into
 * the neutral frames the dashboard folds, its sends, its gates (permission
 * asks and forms), its settings and its controls.
 *
 * 2.0 streams one event feed per server (`GET /api/event`), every event
 * naming its session (`data.sessionID`) and carrying its payload under
 * `data`. A turn is an execution: `session.execution.started`, then steps
 * (`session.step.started|ended|failed`), each streaming its text
 * (`session.text.started|delta|ended`), reasoning (`session.reasoning.*`) and
 * tool calls (`session.tool.input.started`, `.called`, `.progress`,
 * `.success|failed`), until `session.execution.succeeded|failed|interrupted`
 * (observed on 2.0.28, settled #3). A send is admitted to the session's inbox
 * (`session.inbox.enqueued`) under the message id CawCo minted for it, and
 * read when the inbox delivers it to the model (`session.inbox.delivered`).
 * The feed is live only: whatever a gap in it missed is read back over REST
 * after every reconnect ({@link OpencodeSession.reconcileGates},
 * {@link OpencodeSession.watchResumedTurn}).
 *
 * The model, its effort (the model's variant), the agent and the tools a
 * session may use are no longer a prompt's: they are the session's own, set
 * before the prompt that needs them (`POST …/model`, `…/agent`, and the whole
 * permission ruleset by `PATCH`, which replaces it, settled #9).
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type {
  EffortLevel,
  FleetMcpChange,
  McpServerStatus,
  ModelInfo,
  ModelTurnUsage,
  NeutralContentBlock,
  PermissionResult,
  SentMessage,
  SlashCommand,
  UserAnswers,
  UserQuestion,
} from "@cawco/core";
import {
  ASK_USER_QUESTION,
  CONTROL_CONTEXT_USAGE,
  CONTROL_INTERRUPT,
  CONTROL_MCP_FLEET_CHANGED,
  CONTROL_MCP_RECONNECT,
  CONTROL_MCP_STATUS,
  CONTROL_MCP_TOGGLE,
  CONTROL_RELOAD_SKILLS,
  CONTROL_SET_EFFORT,
  CONTROL_SET_MODEL,
  CONTROL_SET_PERMISSION_MODE,
  CONTROL_SUPPORTED_COMMANDS,
  CONTROL_SUPPORTED_MODELS,
  EFFORT_READ,
  INSTALL_SESSION_CREDENTIAL,
  LEAD_GATED_TOOLS,
  MCP_NOT_CONNECTED,
  MESSAGES_READ,
  MESSAGES_STORED,
  mcpNotConnectedLine,
  PROVIDER_LIMIT,
  PROVIDER_RETRY,
  REPEATED_FAILURE,
  REPEATED_FAILURE_LIMIT,
  SERVER_STOPPED_MID_TURN,
  usageByModel,
  VERIFY_SESSION_CREDENTIAL,
} from "@cawco/core";
import { userLayerPath } from "@cawco/core/paths";
import { readRecordSync, writeStateFileSync } from "@cawco/core/state-file";
import type {
  FormInfo,
  ModelInfo as OpencodeModel,
  PermissionRequest,
  SessionMessageAssistant,
  SessionMessageInfo,
  V2Event,
} from "@opencode/client";
import type { OpencodeRule } from "../denied-tools";
import type { HarnessContext, HarnessSession } from "../harness";
import { holdRestart, withRestartHold } from "../restart";
import { acknowledgeSessionCredential } from "../session-identity";
import {
  at,
  CAWCO_MCP_SERVER,
  errorTag,
  errorText,
  type McpNotConnected,
  type OpencodeClient,
} from "./opencode-client";
import {
  readOpencodeCredentials,
  storeOpencodeCredential,
} from "./opencode-credentials";
import { CODE_MODE_TOOL, OPENCODE_DIR } from "./opencode-plugin";
import {
  codeModeCalls,
  compactBoundary,
  summaryId,
  toolInputOf,
  toolNameOf,
  toolResultOf,
} from "./opencode-transcript";

/** Recovery cancels the actual HTTP operation, never races an abandoned promise. */
export const RECOVERY_TIMEOUT_MS = 10_000;

/**
 * How long a turn may go with no server event at all before the wait itself
 * is framed as a `provider_stalled` system note. Our choice: the hangs seen
 * live ran 6+ silent minutes, while first tokens on huge contexts can
 * legitimately take one or two — 3 minutes sits between "slow" and "stuck".
 * Fires at most once per turn; any server event re-arms it.
 */
export const STALLED_TURN_MS = 3 * 60_000;

export const EFFORT_LEVELS: EffortLevel[] = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
let lastIdMs = 0;
let idCounter = 0;

/**
 * An OpenCode message id, minted here so a send can name the message it
 * becomes: the prefix, the low 6 bytes of `Date.now() * 0x1000 + counter` as
 * hex, then 14 random base62 characters — the shape OpenCode mints its own
 * in (2.0.28's `msg_135fcd6b4001…`). 2.0 takes it as the prompt's `id`, and
 * names the inbox item and the stored user message by it (observed:
 * `session.inbox.enqueued.inboxID` and the message's `id` are the id sent).
 */
export function messageId(): string {
  const now = Date.now();
  if (now !== lastIdMs) {
    lastIdMs = now;
    idCounter = 0;
  }
  idCounter += 1;
  const stamp = (BigInt(now) * 0x10_00n + BigInt(idCounter))
    .toString(16)
    .padStart(12, "0")
    .slice(-12);
  const random = Array.from(
    crypto.getRandomValues(new Uint8Array(14)),
    (byte) => BASE62[byte % 62]
  ).join("");
  return `msg_${stamp}${random}`;
}

/**
 * Whether a parked permission should be auto-allowed by the daemon itself.
 * A question always routes — the parent session, or the user, answers it.
 * Full Send is bypass here: bypass answers every tool ask OpenCode raises.
 */
export function autoAllows(
  permissionMode: string | undefined,
  kind: "question" | "tool"
): boolean {
  if (kind === "question") {
    return false;
  }
  return (
    permissionMode === "bypassPermissions" || permissionMode === "fullSend"
  );
}

/** `provider/model` or a bare model id, into its two parts. */
export const splitModel = (
  model: string
): { providerID?: string; id: string } => {
  const slash = model.indexOf("/");
  return slash < 0
    ? { id: model }
    : { providerID: model.slice(0, slash), id: model.slice(slash + 1) };
};

const WHITESPACE_RE = /\s+/;
const MCP_USAGE = "Usage: /mcp connect|disconnect <server>";

/** `/name rest` → its parts; undefined for anything that is not a slash command. */
const parseCommand = (
  text: string
): { name: string; args: string } | undefined => {
  if (!text.startsWith("/") || text.length === 1) {
    return;
  }
  const rest = text.slice(1);
  const sp = rest.indexOf(" ");
  return sp === -1
    ? { name: rest, args: "" }
    : { name: rest.slice(0, sp), args: rest.slice(sp + 1) };
};

/**
 * How many tokens one request to the model may send: its input limit where
 * the catalog gives one below its context, else its context.
 */
const requestWindow = (limit: { context: number; input?: number }): number =>
  limit.input ? Math.min(limit.input, limit.context) : limit.context;

/** A model as the fleet lists it, with its effort scale (its variants) and the tokens a request may send. */
const modelRow = (model: OpencodeModel): ModelInfo => {
  const supportedEffortLevels = EFFORT_LEVELS.filter((level) =>
    model.variants.some((variant) => variant.id === level)
  );
  return {
    value: `${model.providerID}/${model.id}`,
    displayName: model.name,
    ...(supportedEffortLevels.length
      ? { supportsEffort: true, supportedEffortLevels }
      : {}),
    ...(requestWindow(model.limit)
      ? { contextWindow: requestWindow(model.limit) }
      : {}),
  };
};

/**
 * Every model the server's active providers offer at `directory` (2.0's
 * `GET /api/model` lists only active providers' models), plus a `default`
 * row naming the model the server runs when a session names none
 * (`GET /api/model/default`), so a spawn that picks no model still names one.
 */
export async function opencodeCatalog(
  client: OpencodeClient,
  directory?: string,
  provider?: string
): Promise<ModelInfo[]> {
  const scope = directory ? at(directory) : {};
  const [listed, fallback] = await Promise.all([
    client.model.list(scope),
    client.model.default(scope),
  ]);
  const models = listed.data
    .filter(
      (model) =>
        model.enabled &&
        model.status !== "deprecated" &&
        (provider === undefined || model.providerID === provider)
    )
    .map(modelRow);
  const named = fallback.data
    ? `${fallback.data.providerID}/${fallback.data.id}`
    : undefined;
  const resolved = named
    ? models.find((row) => row.value === named)
    : undefined;
  return resolved
    ? [
        ...models,
        { ...resolved, value: "default", resolvedModel: resolved.value },
      ]
    : models;
}

/** One permission rule of the session's whole set. */
const deny = (action: string): OpencodeRule => ({
  action,
  resource: "*",
  effect: "deny",
});

/**
 * A project's Caw on OpenCode (`SpawnPayload.lead`): each of his shell and
 * edit calls asks (`LEAD_GATED_TOOLS`), and the ask goes to the hub whatever
 * his mode ({@link OpencodeSession}'s `#asked`), whose gate answers it.
 * OpenCode 2.0's `edit` covers `write` and `patch`.
 */
const leadAsks: readonly OpencodeRule[] = LEAD_GATED_TOOLS.opencode.map(
  (action) => ({ action, resource: "*", effect: "ask" })
);
const LEAD_ASKED: ReadonlySet<string> = new Set(LEAD_GATED_TOOLS.opencode);

/** The CawCo tools only a workflow step calls (the plugin's own). */
const WORKFLOW_TOOLS = [
  "cawco_submit_result",
  "cawco_workflow_state_read",
  "cawco_workflow_state_write",
];

/** The CawCo tools that start or steer other sessions: off for a session that may not delegate. */
const DELEGATION_TOOLS = [
  "start_session",
  "continue_session",
  "delegate",
  "stop_delegate",
  "interrupt_delegate",
  "answer_delegate",
  "set_item_checks",
  "machine_pause",
  "run_workflow",
  "steer_workflow",
  "workflow_read",
  "list_workflows",
].map((name) => `cawco_${name}`);

/** What OpenCode makes of a server's name in its tools' ids. */
const MCP_NAME_UNSAFE = /[^a-zA-Z0-9_-]/g;

/**
 * A fenced session on OpenCode (a memory curator or fleet-watch triage run,
 * `SpawnPayload.fence`): every tool of every MCP server the location has,
 * but CawCo's, denied (`<server>_*`, which hides the tool from the turn and
 * from Code Mode's catalog alike and refuses a call to it). The list is the
 * location's MCP servers, read each time a turn is about to run, so a server
 * added later is fenced too.
 */
const mcpFence = async (
  client: OpencodeClient,
  directory: string
): Promise<OpencodeRule[]> => {
  const listed = await client.mcp.list(at(directory), {
    signal: AbortSignal.timeout(65_000),
  });
  return listed.data
    .filter((server) => server.name !== CAWCO_MCP_SERVER)
    .map((server) => deny(`${server.name.replace(MCP_NAME_UNSAFE, "_")}_*`));
};

/** The instruction entry keys the owner's and the project's `CLAUDE.md` go under (settled #11: `^[a-z0-9][a-z0-9._-]*$`). */
export const CLAUDE_MD_GLOBAL = "claude-md-global";
export const CLAUDE_MD_PROJECT = "claude-md-project";

/** The most an instruction entry's value may be, in JSON bytes (2.0.28's `Ohe=262144`, settled #11). */
const INSTRUCTION_ENTRY_MAX = 262_144;

/** The nearest `CLAUDE.md` from `directory` up, stopping at the home dir; undefined when there is none. */
const projectClaudeMd = (directory: string): string | undefined => {
  const home = homedir();
  for (let dir = directory; ; dir = dirname(dir)) {
    const file = join(dir, "CLAUDE.md");
    if (existsSync(file)) {
      return file;
    }
    if (dir === home || dirname(dir) === dir) {
      return;
    }
  }
};

/**
 * The instructions OpenCode 2.0 does not read itself: it discovers
 * `AGENTS.md` only ("OpenCode V2 recognizes `AGENTS.md` only. It does not use
 * `CLAUDE.md` as a fallback.", opencode.ai/v2/docs/instructions), so the
 * owner's `~/.claude/CLAUDE.md` and the project's `CLAUDE.md` go in as the
 * session's own instruction entries, as they are now.
 */
export const claudeMdEntries = async (
  directory: string
): Promise<Record<string, string>> => {
  const read = (file: string | undefined) =>
    file ? readFile(file, "utf8").catch(() => undefined) : undefined;
  const [global, project] = await Promise.all([
    read(userLayerPath("CLAUDE.md")),
    read(projectClaudeMd(directory)),
  ]);
  return {
    ...(global ? { [CLAUDE_MD_GLOBAL]: global } : {}),
    ...(project ? { [CLAUDE_MD_PROJECT]: project } : {}),
  };
};

/**
 * The OpenCode sessions with a turn this agent opened and has not ended: the
 * hub is waiting on each for its `result`. On disk because an agent restart
 * loses the process that would have sent it; the process that reattaches the
 * session reads it here, and ends that turn from the server's own history if
 * the server finished it meanwhile (see `watchResumedTurn`).
 */
const OPEN_TURNS_PATH = join(OPENCODE_DIR, "cawco-open-turns.json");
let openTurns: Set<string> | undefined;

const loadOpenTurns = (): Set<string> => {
  openTurns ??= new Set(readRecordSync<string[]>(OPEN_TURNS_PATH) ?? []);
  return openTurns;
};

/** Records that `sessionId`'s turn is open (the hub is owed its end) or closed. */
const markTurn = (sessionId: string, open: boolean): void => {
  const ids = loadOpenTurns();
  if (open === ids.has(sessionId)) {
    return;
  }
  const next = new Set(ids);
  if (open) {
    next.add(sessionId);
  } else {
    next.delete(sessionId);
  }
  // Commit before publishing the result: no deferred write can be lost at restart.
  writeStateFileSync(OPEN_TURNS_PATH, JSON.stringify([...next]));
  openTurns = next;
};

/** Whether an earlier process left `sessionId` with a turn it never ended. */
export const turnWasOpen = (sessionId: string): boolean =>
  loadOpenTurns().has(sessionId);

/**
 * How a turn the stream missed ended, from what history holds after its
 * prompt: the outcome its `idle` message records; for a turn 1.x ran and
 * 2.0 converted, which keeps no `idle`, its last answer completed (ended on
 * `stop` with no error) or failed; anything else was cut with its server.
 * Undefined is a turn that succeeded.
 */
const missedTurnEnd = (
  after: readonly SessionMessageInfo[]
):
  | { subtype: string; is_error: boolean; errors?: string[] }
  | "cut"
  | undefined => {
  const idle = after.findLast(
    (row): row is Extract<SessionMessageInfo, { type: "idle" }> =>
      row.type === "idle"
  );
  if (idle) {
    if (idle.outcome === "succeeded") {
      return;
    }
    return idle.outcome === "interrupted"
      ? { subtype: "aborted", is_error: false }
      : {
          subtype: "error_during_execution",
          is_error: true,
          errors: [idle.error ? errorText(idle.error) : "The turn failed."],
        };
  }
  const last = after.findLast(
    (row): row is SessionMessageAssistant => row.type === "assistant"
  );
  if (last?.error) {
    return {
      subtype: "error_during_execution",
      is_error: true,
      errors: [errorText(last.error)],
    };
  }
  return last?.time.completed && last.finish === "stop" ? undefined : "cut";
};

/** A message's blocks, by their key (`text:<n>`, `reasoning:<n>`, `tool:<id>`), in the order they began. */
interface MessageBlocks {
  keys: string[];
  /** The blocks already drawn whole; each is drawn once. */
  published: Set<string>;
}

/** A block's place among its message's, taken on first sight. */
const blockIndex = (blocks: MessageBlocks, key: string): number => {
  const index = blocks.keys.indexOf(key);
  return index === -1 ? blocks.keys.push(key) - 1 : index;
};

/** A subagent's own pipeline state, kept apart from its parent's. */
interface ChildState {
  messages: Map<string, MessageBlocks>;
  toolInputs: Map<string, unknown>;
  toolNames: Map<string, string>;
  toolsEmitted: Map<string, "called" | "resolved">;
}

/** What a turn's assistant messages spent, by message id. */
interface StepUsage {
  cost: number;
  tokens: ModelTurnUsage;
}

const EMPTY_TOKENS = {
  input: 0,
  output: 0,
  reasoning: 0,
  cache: { read: 0, write: 0 },
};

/** The choices a form's field offers the reader. */
const fieldOptions = (
  field: FormInfo["fields"][number]
): UserQuestion["options"] => {
  if (field.type === "string" || field.type === "multiselect") {
    return (field.options ?? []).map((option) => ({
      label: option.label,
      description: option.description ?? "",
    }));
  }
  return field.type === "boolean"
    ? [
        { label: "Yes", description: "" },
        { label: "No", description: "" },
      ]
    : [];
};

/** A form's fields as the fleet's questions, by field key. */
const formQuestions = (
  form: FormInfo
): {
  questions: UserQuestion[];
  keys: Map<string, FormInfo["fields"][number]>;
} => {
  const keys = new Map<string, FormInfo["fields"][number]>();
  const questions: UserQuestion[] = [];
  for (const field of form.fields) {
    if (field.type === "external" || ("hidden" in field && field.hidden)) {
      continue;
    }
    const question = field.description ?? field.title ?? field.key;
    keys.set(question, field);
    questions.push({
      question,
      header: field.title ?? field.key,
      options: fieldOptions(field),
      multiSelect: field.type === "multiselect",
    });
  }
  return { questions, keys };
};

/** One answer as its field takes it. */
const fieldAnswer = (
  field: FormInfo["fields"][number],
  raw: string | string[] | undefined
): string | number | boolean | string[] | undefined => {
  const one = Array.isArray(raw) ? raw[0] : raw;
  switch (field.type) {
    case "multiselect":
      if (raw === undefined || Array.isArray(raw)) {
        return raw;
      }
      return [raw];
    case "boolean":
      return one === undefined ? undefined : one === "Yes" || one === "true";
    case "number":
    case "integer":
      return one === undefined || one === "" ? undefined : Number(one);
    case "string": {
      // An option's label is what the reader saw; the form takes its value.
      const option = field.options?.find((choice) => choice.label === one);
      return option ? option.value : one;
    }
    default:
      return;
  }
};

/** The session's settings as the server holds them, so each is sent only when it changes. */
interface Applied {
  agent?: string;
  model?: string;
  rules?: string;
}

export interface OpencodeSessionOptions {
  account: string | undefined;
  /** The settings it was created or last opened with. */
  applied: Applied;
  canDelegate?: boolean;
  client: OpencodeClient;
  ctx: HarnessContext;
  /** Tools denied to this session (fleet, type and spawn), as session rules. */
  deniedRules: OpencodeRule[];
  directory: string;
  effort?: EffortLevel;
  /** A fenced session: it has CawCo's MCP server and no other. */
  fence: boolean;
  instanceId: string;
  /**
   * Returns true while the harness's config gate holds this session's sends.
   * `joinsTurn`: the send goes into a turn running on the session's server,
   * which a server being retired does not hold.
   */
  isConfigGateHeld: (joinsTurn?: boolean) => boolean;
  /** A project's Caw: each of his shell and edit calls asks, and the hub's gate answers it ({@link leadAsks}). */
  lead: boolean;
  /** The OpenCode session ids this agent runs, so a credential store keeps only theirs. */
  liveSessions: () => ReadonlySet<string>;
  model: string | undefined;
  onRelease: () => void;
  permissionMode: string | undefined;
  /** The harness's own work before a dispatch: its server up, the session on it. */
  prepareDispatch: () => Promise<void>;
  /** Whether the server says this session is running a turn now. */
  readActivity: () => Promise<boolean>;
  /**
   * The location's readiness: CawCo's plugin loaded, CawCo's MCP server
   * connected and every other server settled. No prompt or command reaches
   * the server before it; a location that never gets there fails the session
   * with why. It answers the servers that did not connect, which the session
   * says once, at its first dispatch.
   */
  ready: Promise<McpNotConnected[]>;
  registerChild: (childId: string, callID: string) => void;
  sessionId: string;
  /**
   * A turn ended on `provider` (its last model step's): refused by it with
   * `refusal` (an execution failed `provider.auth`, in the provider's words),
   * or answered (undefined). The harness keeps it as a sign-in's fault.
   */
  turnOutcome: (provider: string, refusal: string | undefined) => void;
  workflowStepId?: string;
}

export class OpencodeSession implements HarnessSession {
  attached?: () => void;
  readonly harness = "opencode" as const;
  sessionId: string | null;
  readonly instanceId: string;
  /** The CawCo account this session runs on, whose own server it runs in; undefined: the machine's. */
  readonly account: string | undefined;
  readonly #ctx: HarnessContext;
  #client: OpencodeClient;
  readonly #directory: string;
  #model: string | undefined;
  #effort: EffortLevel | undefined;
  #permissionMode: string | undefined;
  readonly #applied: Applied;
  readonly #deniedRules: OpencodeRule[];
  readonly #fence: boolean;
  readonly #lead: boolean;
  readonly #workflowStepId?: string;
  readonly #canDelegate?: boolean;
  /** The instruction entries put on the session, by key, as the hash of the value put. */
  readonly #instructions = new Map<string, string>();
  readonly #registerChild: (childId: string, callID: string) => void;
  readonly #turnOutcome: (
    provider: string,
    refusal: string | undefined
  ) => void;
  /** The provider of the open turn's last model step: whose answer or refusal its end is. */
  #turnProvider: string | undefined;
  readonly #onRelease: () => void;
  readonly #isConfigGateHeld: (joinsTurn?: boolean) => boolean;
  readonly #readActivity: () => Promise<boolean>;
  readonly #prepareDispatch: () => Promise<void>;
  readonly #liveSessions: () => ReadonlySet<string>;
  readonly #lifetime = new AbortController();
  /** The MCP servers that did not connect, by name, said for this start of the session. */
  readonly #mcpSaid = new Set<string>();

  #lastTokens = EMPTY_TOKENS;
  /** The tokens the session's last answered request sent: its context then. */
  #lastSent: number | undefined;
  /** What each assistant message of the open turn spent, by message id. */
  readonly #steps = new Map<string, StepUsage>();
  #costBase = 0;
  /** Each assistant message's blocks, for their places and so each is drawn once. */
  readonly #messages = new Map<string, MessageBlocks>();
  /** When OpenCode began each assistant message, by id, as a history read dates its entries. */
  readonly #created = new Map<string, string>();
  /** Each tool call's name and input, by call id, from its start. */
  readonly #toolNames = new Map<string, string>();
  readonly #toolInputs = new Map<string, unknown>();
  readonly #toolsEmitted = new Map<string, "called" | "resolved">();
  /** A Code Mode program's calls drawn and not yet answered; closed with the turn when no answer comes. */
  readonly #codeModeOpen = new Set<string>();
  /** The reasoning block whose live block is open, so it is closed exactly once. */
  #openThinking: string | null = null;
  /** The kind of each inbox item, by id, so a delivered send is read and a compaction is not. */
  readonly #inbox = new Map<string, string>();
  /**
   * The turn's tool calls running, by id, from `session.tool.called` until
   * their success or failure. A send waits behind them: OpenCode delivers
   * its inbox at the next step. A send that meets one moves the session's
   * blocking calls to the background ({@link #moveToBackground}).
   */
  readonly #running = new Set<string>();
  /** A {@link #moveToBackground} request is in flight. */
  #movingToBackground = false;
  /** A compaction is under way, by its message id. */
  #compacting: string | undefined;
  #busy = false;
  /** Live turn transitions outrank status/history snapshots already in flight. */
  #turnRevision = 0;
  /** Busy since {@link reattachedMidTurn}, on the server's word alone, until {@link watchResumedTurn} has read the turn again. */
  #reattachedBusy = false;
  /** The last provider-retry note surfaced, so a repeating retry says it once. */
  #lastRetryNote = "";
  /** The message id of the prompt this process sent that the open turn answers. */
  #turnPrompt: string | undefined;
  /** The assistant message the turn ends on, as its `result` is keyed. */
  #completion: { uuid: string; timestamp?: string } | undefined;
  #recoveringTurn = false;
  #sleepAfterRecovery = false;
  #open = false;
  /** The provider's usage-limit refusal the open turn ends on, once asked to stop. */
  #limitRefusal: string | undefined;
  /** Armed while a turn is open without any server event; see STALLED_TURN_MS. */
  #stallTimer: ReturnType<typeof setTimeout> | undefined;
  /** Sends held while the config gate is up, each under the message id it will become. */
  readonly #queue: {
    text: string;
    files: { uri: string; name: string }[];
    messageID: string;
    uuid: string;
  }[] = [];
  /** The held send being admitted, until its POST returns. */
  #draining: string | undefined;
  #commands: Promise<{
    commands: Set<string>;
    skills: Map<string, string>;
  }> | null = null;
  readonly #questions = new Map<
    string,
    { form: FormInfo; keys: Map<string, FormInfo["fields"][number]> }
  >();
  readonly #seenGates = new Set<string>();
  readonly #resolvedGates = new Set<string>();
  readonly #gateFailures = new Set<string>();
  #reconciling: Promise<void> | undefined;
  /** Subagent sessions, by the id of the `subagent` call that started them. */
  readonly #boundCalls = new Set<string>();
  readonly #childInfo = new Map<string, { agent?: string; title?: string }>();
  readonly #childState = new Map<string, ChildState>();

  constructor(options: OpencodeSessionOptions) {
    this.instanceId = options.instanceId;
    this.account = options.account;
    this.#ctx = options.ctx;
    this.#client = options.client;
    this.sessionId = options.sessionId;
    this.#directory = options.directory;
    this.#model = options.model;
    this.#effort = options.effort;
    this.#permissionMode = options.permissionMode;
    this.#applied = { ...options.applied };
    this.#deniedRules = options.deniedRules;
    this.#fence = options.fence;
    this.#lead = options.lead;
    this.#workflowStepId = options.workflowStepId;
    this.#canDelegate = options.canDelegate;
    this.#registerChild = options.registerChild;
    this.#turnOutcome = options.turnOutcome;
    this.#onRelease = options.onRelease;
    this.#isConfigGateHeld = options.isConfigGateHeld;
    this.#readActivity = options.readActivity;
    this.#liveSessions = options.liveSessions;
    // No prompt or command reaches the server before its location is ready:
    // a location whose plugin is missing or whose CawCo MCP server does not
    // connect fails the session with why, and every send it was handed fails
    // with it. Any other server that did not connect is said once, and the
    // session runs without it.
    // Awaited at dispatch, never at publication (bb65de38: publishing must
    // not wait on cold MCP servers).
    const admitted = options.ready.catch((error: unknown) => {
      const reason = new Error(
        `This OpenCode session takes no work: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
      this.#ctx.failed(reason);
      throw reason;
    });
    // Its rejection is a send's, at dispatch; unawaited it is not unhandled.
    admitted.catch(() => undefined);
    this.#prepareDispatch = async () => {
      const unconnected = await admitted;
      await options.prepareDispatch();
      await this.#sayUnconnected(unconnected);
      await this.#applySettings();
      await this.#syncInstructions();
    };
  }

  /** A turn is open: the hub is owed its end (a `result` frame). Recorded on disk as well. */
  get #turnOpen(): boolean {
    return this.#open;
  }
  set #turnOpen(open: boolean) {
    this.#turnRevision += 1;
    if (!open) {
      this.#turnPrompt = undefined;
    }
    if (open !== this.#open) {
      this.#open = open;
      if (this.sessionId) {
        markTurn(this.sessionId, open);
      }
    }
  }

  get directory(): string {
    return this.#directory;
  }

  /** Dispatch custody, not an independent server-idle heuristic. */
  get turnInFlight(): boolean {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: server events and dispatch methods update these fields outside this getter
    return this.#busy || this.#turnOpen;
  }

  /** The sends this process holds that the server has not admitted. An agent restart loses them. */
  get unhanded(): number {
    return this.#queue.length;
  }

  tables(): Record<string, number> {
    return {
      opencodeMessages: this.#messages.size,
      opencodeCreated: this.#created.size,
      opencodeTools: this.#toolsEmitted.size + this.#toolNames.size,
      opencodeSteps: this.#steps.size,
      opencodeInbox: this.#inbox.size,
      opencodeGates: this.#seenGates.size + this.#resolvedGates.size,
      opencodeChildren: this.#childInfo.size + this.#childState.size,
      opencodeBoundCalls: this.#boundCalls.size,
    };
  }

  /** What this handle still owes or holds: a turn, or sends not yet admitted. */
  holding(): string | undefined {
    if (this.turnInFlight || this.#reattachedBusy || this.#recoveringTurn) {
      return "a turn is running";
    }
    if (this.#queue.length > 0 || this.#draining) {
      return "a send is waiting to be read";
    }
  }

  /** Says the effort this session sends ({@link EFFORT_READ}), or null for the model's own default. */
  sayEffort(): void {
    this.#ctx.frame({
      type: "system",
      subtype: EFFORT_READ,
      effort: this.#effort ?? null,
    });
  }

  /** Rebinds this session to a new server generation; the session keeps its id and history. */
  rebindClient(client: OpencodeClient): void {
    this.#client = client;
    this.#commands = null;
    // A new generation holds what the session's server keeps (its settings,
    // its entries), so they are what this process last put; read again only
    // if a later change differs.
  }

  /** Called by the harness after a config reload completes: the held sends go now. */
  configGateLifted(): void {
    this.#drainQueue();
  }

  // ------------------------------------------------------------ settings

  /**
   * The whole permission ruleset the session runs on: its denials, the tools
   * its role leaves out, a fenced session's fence, and last, so no rule
   * before it can allow one, a lead's asks ({@link leadAsks}).
   */
  async #rules(): Promise<OpencodeRule[]> {
    return [
      ...(this.#workflowStepId ? [] : WORKFLOW_TOOLS.map(deny)),
      ...(this.#canDelegate === false ? DELEGATION_TOOLS.map(deny) : []),
      ...this.#deniedRules,
      ...(this.#fence ? await mcpFence(this.#client, this.#directory) : []),
      ...(this.#lead ? leadAsks : []),
    ];
  }

  /** The model reference the session asks for, its effort the model's variant; none when the session names no provider. */
  #modelRef():
    { providerID: string; id: string; variant?: string } | undefined {
    const ref = this.#model ? splitModel(this.#model) : undefined;
    return ref?.providerID
      ? {
          providerID: ref.providerID,
          id: ref.id,
          ...(this.#effort ? { variant: this.#effort } : {}),
        }
      : undefined;
  }

  /**
   * The session's model, agent and permissions made what this session runs
   * on, each only when it changed: 2.0 takes none of them on a prompt. The
   * permission set goes whole (`PATCH` replaces it, settled #9).
   */
  async #applySettings(): Promise<void> {
    const sessionID = this.#opencodeSessionId();
    const options = { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) };
    const model = this.#modelRef();
    const wanted = model ? JSON.stringify(model) : undefined;
    if (model && wanted !== this.#applied.model) {
      await this.#client.session.switchModel({ sessionID, model }, options);
      this.#applied.model = wanted;
    }
    const agent = this.#permissionMode === "plan" ? "plan" : "build";
    if (agent !== this.#applied.agent) {
      await this.#client.session.switchAgent({ sessionID, agent }, options);
      this.#applied.agent = agent;
    }
    const permissions = await this.#rules();
    const rules = JSON.stringify(permissions);
    if (rules !== this.#applied.rules) {
      await this.#client.session.update({ sessionID, permissions }, options);
      this.#applied.rules = rules;
    }
  }

  /**
   * The owner's and the project's `CLAUDE.md`, as they are now, put on the
   * session as its instruction entries ({@link claudeMdEntries}); a changed
   * file is put again, and 2.0 announces the change at the next step
   * boundary (settled #11). A file larger than an entry may hold is the
   * turn's refusal, with its size.
   */
  async #syncInstructions(): Promise<void> {
    const sessionID = this.#opencodeSessionId();
    const entries = await claudeMdEntries(this.#directory);
    for (const [key, value] of Object.entries(entries)) {
      const hash = createHash("sha256").update(value).digest("hex");
      if (this.#instructions.get(key) === hash) {
        continue;
      }
      const bytes = Buffer.byteLength(JSON.stringify(value));
      if (bytes > INSTRUCTION_ENTRY_MAX) {
        throw new Error(
          `${key} is ${bytes} bytes as an OpenCode instruction entry; OpenCode takes at most ${INSTRUCTION_ENTRY_MAX}.`
        );
      }
      // biome-ignore lint/performance/noAwaitInLoops: two entries, put in turn
      await this.#client.session.instructions.entry.put(
        { sessionID, key, value },
        { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
      );
      this.#instructions.set(key, hash);
    }
  }

  // ------------------------------------------------------------- events

  /** Routes one event of this session into neutral frames. */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one switch over 2.0's session event union
  handle(event: V2Event): void {
    const data = event.data as { sessionID?: string } | undefined;
    const sid =
      event.type === "form.created"
        ? event.data.form.sessionID
        : data?.sessionID;
    if (sid !== this.sessionId) {
      return;
    }
    // Any event off the wire is a sign of life: only a truly silent turn trips the stall notice.
    this.#noteServerActivity();
    switch (event.type) {
      case "session.inbox.enqueued":
        this.#inbox.set(event.data.inboxID, event.data.item.type);
        // Any send behind a running tool call — the person's, a hand-off, a
        // report, a rule's reply — would wait for its end.
        if (event.data.item.type === "user" && this.#running.size > 0) {
          this.#moveToBackground();
        }
        break;
      case "session.inbox.delivered": {
        // The model is given the send now: it is read. A compaction or a
        // synthetic note is no one's send.
        const kind = this.#inbox.get(event.data.inboxID) ?? "user";
        this.#inbox.delete(event.data.inboxID);
        if (kind === "user") {
          this.#ctx.frame({
            type: "system",
            subtype: MESSAGES_READ,
            read: [event.data.inboxID],
            session_id: this.sessionId ?? undefined,
          });
        }
        if (this.#draining === event.data.inboxID) {
          this.#draining = undefined;
        }
        break;
      }
      case "session.execution.started":
        this.#turnProvider = undefined;
        this.#turnRevision += 1;
        this.#busy = true;
        this.#turnOpen = true;
        this.#ctx.busy(true);
        // Sends a retiring server's hold kept while the session was idle join
        // the turn it has started there.
        this.#drainQueue();
        break;
      case "session.step.started": {
        this.#turnProvider = event.data.model.providerID;
        const id = event.data.assistantMessageID;
        const timestamp = new Date(event.data.started).toISOString();
        this.#created.set(id, timestamp);
        this.#completion = { uuid: id, timestamp };
        this.#steps.set(id, {
          cost: 0,
          tokens: {
            model: `${event.data.model.providerID}/${event.data.model.id}`,
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
          },
        });
        break;
      }
      case "session.step.ended":
      case "session.step.failed": {
        const { tokens, cost } = event.data;
        const step = this.#steps.get(event.data.assistantMessageID);
        if (step && tokens) {
          step.cost = cost ?? 0;
          // 2.0's `input` leaves out the cached tokens, which are added back
          // for what the request sent; a request that failed sent none.
          step.tokens = {
            ...step.tokens,
            input: tokens.input,
            output: tokens.output,
            cacheRead: tokens.cache.read,
            cacheWrite: tokens.cache.write,
          };
          this.#lastTokens = tokens;
          const sent = tokens.input + tokens.cache.read + tokens.cache.write;
          if (sent > 0) {
            this.#lastSent = sent;
          }
        }
        break;
      }
      case "session.text.started":
        this.#closeThinking();
        blockIndex(
          this.#blocksOf(event.data.assistantMessageID),
          `text:${event.data.ordinal}`
        );
        break;
      case "session.text.delta":
        this.#closeThinking();
        // Named with its message, so a reply re-sent whole replaces it.
        this.#ctx.frame({
          type: "stream_event",
          session_id: this.sessionId ?? undefined,
          message_id: event.data.assistantMessageID,
          event: {
            type: "content_block_delta",
            delta: { type: "text_delta", text: event.data.delta },
          },
        });
        break;
      case "session.text.ended":
        this.#publish(
          event.data.assistantMessageID,
          `text:${event.data.ordinal}`,
          { type: "text", text: event.data.text }
        );
        break;
      case "session.reasoning.started":
        this.#openThinkingBlock(
          event.data.assistantMessageID,
          `reasoning:${event.data.ordinal}`
        );
        break;
      case "session.reasoning.delta":
        this.#openThinkingBlock(
          event.data.assistantMessageID,
          `reasoning:${event.data.ordinal}`
        );
        this.#thinkingFrame(
          {
            type: "content_block_delta",
            delta: { type: "thinking_delta", thinking: event.data.delta },
          },
          event.data.assistantMessageID
        );
        break;
      case "session.reasoning.ended": {
        const key = `${event.data.assistantMessageID}\nreasoning:${event.data.ordinal}`;
        if (this.#openThinking === key) {
          this.#closeThinking();
        }
        this.#publish(
          event.data.assistantMessageID,
          `reasoning:${event.data.ordinal}`,
          { type: "thinking", thinking: event.data.text }
        );
        break;
      }
      case "session.tool.input.started":
        this.#closeThinking();
        this.#toolNames.set(event.data.id, event.data.name);
        blockIndex(
          this.#blocksOf(event.data.assistantMessageID),
          `tool:${event.data.id}`
        );
        break;
      case "session.tool.called":
        this.#toolInputs.set(event.data.id, event.data.input);
        this.#toolUse(event.data.assistantMessageID, event.data.id);
        this.#running.add(event.data.id);
        // A call that starts while a send waits in the inbox would hold it.
        if ([...this.#inbox.values()].includes("user")) {
          this.#moveToBackground();
        }
        break;
      case "session.tool.progress":
        this.#toolProgress(
          event.data.assistantMessageID,
          event.data.id,
          event.data.metadata,
          false
        );
        break;
      case "session.tool.success":
      case "session.tool.failed": {
        const { id, assistantMessageID } = event.data;
        this.#running.delete(id);
        this.#toolUse(assistantMessageID, id);
        this.#toolProgress(
          assistantMessageID,
          id,
          event.data.metadata ?? {},
          true,
          event.type === "session.tool.failed"
            ? errorText(event.data.error)
            : undefined
        );
        if (this.#toolsEmitted.get(id) === "resolved") {
          break;
        }
        const name = this.#toolNames.get(id) ?? "";
        this.#ctx.frame({
          type: "user",
          message: {
            role: "user",
            content: [
              toolResultOf(
                id,
                name,
                this.#toolInputs.get(id),
                event.type === "session.tool.success"
                  ? {
                      content: event.data.content,
                      metadata: event.data.metadata,
                    }
                  : { error: event.data.error },
                event.type === "session.tool.failed"
              ),
            ],
          },
        });
        this.#toolsEmitted.set(id, "resolved");
        break;
      }
      case "session.retry.scheduled":
        this.#retry(event.data.error.message, event.data.at);
        break;
      case "session.compaction.started": {
        const id = event.data.inputID ?? event.id;
        this.#compacting = id;
        this.#ctx.frame({
          type: "system",
          subtype: "status",
          status: "compacting",
          session_id: this.sessionId ?? undefined,
        });
        this.#ctx.frame(
          compactBoundary(
            id,
            this.#opencodeSessionId(),
            event.data.reason,
            new Date(event.created).toISOString()
          )
        );
        break;
      }
      case "session.compaction.ended": {
        const id = this.#compacting ?? event.id;
        this.#compacting = undefined;
        this.#ctx.frame({
          type: "system",
          subtype: "status",
          status: null,
          session_id: this.sessionId ?? undefined,
        });
        this.#ctx.frame({
          type: "assistant",
          uuid: summaryId(id),
          timestamp: new Date(event.created).toISOString(),
          compactSummary: true,
          message: { content: [{ type: "text", text: event.data.text }] },
        });
        break;
      }
      case "session.compaction.failed":
        // A compaction that failed did not compact: said so, the way Claude
        // Code does, so its divider never reads "Compacted".
        this.#compacting = undefined;
        this.#ctx.frame({
          type: "system",
          subtype: "status",
          status: null,
          compact_result: "failed",
          compact_error: errorText(event.data.error),
          session_id: this.sessionId ?? undefined,
        });
        break;
      // A turn's end, as OpenCode 2.0.28 says it. A failure before its first
      // model step (`models.resolve`, context preparation) is only logged
      // ("Failed to drain Session") and the execution still settles
      // `succeeded`, so such a turn ends here with no answer and no error:
      // anomalyco/opencode#34839, fixed by #45959, unreleased as of 2.0.29.
      // On the upgrade that carries it, check that the failure arrives here as
      // `session.execution.failed`. A refusal by the provider itself (Zen's
      // free tier, a 401) does arrive as `failed` on 2.0.28 (observed).
      case "session.execution.succeeded":
        if (this.#turnProvider) {
          this.#turnOutcome(this.#turnProvider, undefined);
        }
        this.#turnEnded();
        break;
      case "session.execution.failed":
        if (this.#turnProvider && event.data.error.type === "provider.auth") {
          const { message, status } = event.data.error as {
            message: string;
            status?: number;
          };
          this.#turnOutcome(
            this.#turnProvider,
            status ? `${status} ${message}` : message
          );
        }
        this.#turnEnded({
          subtype: "error_during_execution",
          is_error: true,
          errors: [errorText(event.data.error)],
        });
        break;
      case "session.execution.interrupted":
        this.#turnEnded(
          event.data.reason === "user"
            ? { subtype: "aborted", is_error: false }
            : {
                subtype: "error_during_execution",
                is_error: true,
                errors: [
                  event.data.reason === "shutdown"
                    ? SERVER_STOPPED_MID_TURN
                    : `OpenCode interrupted the turn (${event.data.reason}).`,
                ],
              }
        );
        break;
      case "permission.asked":
        this.#asked(event.data);
        break;
      case "permission.replied":
        this.#resolvedGates.add(event.data.requestID);
        this.#ctx.permissionResolved?.(event.data.requestID);
        break;
      case "form.created":
        this.#formAsked(event.data.form);
        break;
      // A form settled where CawCo cannot see it (OpenCode's own TUI, another
      // client): the parked ask is let go, so a later answer cannot reach a
      // closed form. The `question` call completes on every route and
      // carries the answers, so the transcript needs nothing here.
      case "form.replied":
      case "form.cancelled":
        this.#resolvedGates.add(event.data.id);
        this.#questions.delete(event.data.id);
        this.#ctx.permissionResolved?.(
          event.data.id,
          event.type === "form.cancelled" ? "cancelled" : "answered"
        );
        break;
      default:
        break;
    }
  }

  /** A turn ended on the server: its blocks drawn, its result, and the held sends go. */
  /**
   * Moves the session's blocking tool calls to the background so a send
   * waiting in the inbox is delivered at once (`POST
   * /api/session/:id/background`, OpenCode 2.0.28: "Move active foreground
   * backgroundable tools for this session into background observation. Idle
   * requests are a no-op."). A moved shell call returns "Command moved to the
   * background" and keeps running; OpenCode adds a note with its output to
   * the session when it ends. A call OpenCode cannot move (a file read) runs
   * on; a refusal is logged and the send waits for the call's end.
   */
  #moveToBackground(): void {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: set below and cleared in the request's finally, which the checker doesn't follow
    if (this.#movingToBackground) {
      return;
    }
    this.#movingToBackground = true;
    const calls = [...this.#running].join(", ");
    this.#client.session
      .background({ sessionID: this.#opencodeSessionId() })
      .then(
        () =>
          console.info(
            `[opencode] ${this.instanceId}: a send waits behind tool call(s) ${calls}: asked OpenCode to move them to the background`
          ),
        (error: unknown) =>
          console.warn(
            `[opencode] ${this.instanceId}: a send waits behind tool call(s) ${calls}, and moving them to the background was refused: ${errorText(error)}`
          )
      )
      .finally(() => {
        this.#movingToBackground = false;
      });
  }

  #turnEnded(closing?: {
    subtype: string;
    is_error: boolean;
    errors?: string[];
  }): void {
    this.#turnRevision += 1;
    this.#busy = false;
    this.#running.clear();
    this.#ctx.busy(false);
    if (this.#compacting) {
      this.#compacting = undefined;
      this.#ctx.frame({
        type: "system",
        subtype: "status",
        status: null,
        session_id: this.sessionId ?? undefined,
      });
    }
    this.#flushResult(closing);
    this.#drainQueue();
  }

  #blocksOf(messageID: string): MessageBlocks {
    let blocks = this.#messages.get(messageID);
    if (!blocks) {
      blocks = { keys: [], published: new Set() };
      this.#messages.set(messageID, blocks);
    }
    return blocks;
  }

  #createdOf(messageID: string): { timestamp?: string } {
    const created = this.#created.get(messageID);
    return created ? { timestamp: created } : {};
  }

  /** A text or thinking block, drawn whole once it has ended, under its message and its place in it. */
  #publish(
    messageID: string,
    key: string,
    block: Extract<NeutralContentBlock, { type: "text" | "thinking" }>
  ): void {
    const blocks = this.#blocksOf(messageID);
    const offset = blockIndex(blocks, key);
    if (blocks.published.has(key)) {
      return;
    }
    blocks.published.add(key);
    if (block.type === "text" ? !block.text : !block.thinking) {
      return;
    }
    this.#ctx.frame({
      type: "assistant",
      uuid: messageID,
      ...this.#createdOf(messageID),
      contentOffset: offset,
      message: { content: [block] },
    });
  }

  /** A tool call's row, once, when its input is whole. */
  #toolUse(messageID: string, id: string): void {
    if (this.#toolsEmitted.has(id)) {
      return;
    }
    this.#closeThinking();
    const name = this.#toolNames.get(id) ?? "";
    this.#ctx.frame({
      type: "assistant",
      uuid: messageID,
      ...this.#createdOf(messageID),
      contentOffset: blockIndex(this.#blocksOf(messageID), `tool:${id}`),
      message: {
        content: [
          {
            type: "tool_use",
            id,
            name: toolNameOf(name),
            input: toolInputOf(this.#toolInputs.get(id)),
          },
        ],
      },
    });
    this.#toolsEmitted.set(id, "called");
  }

  /**
   * What a call's progress says: a `subagent` call names the child session it
   * started (`metadata.sessionID`, observed on 2.0.28), and a Code Mode
   * program the calls it has made, each drawn as it is made and answered
   * once the program ends ({@link codeModeCalls}).
   */
  #toolProgress(
    messageID: string,
    id: string,
    metadata: Record<string, unknown>,
    settled: boolean,
    threw?: string
  ): void {
    const name = this.#toolNames.get(id);
    if (name === "subagent" && typeof metadata.sessionID === "string") {
      this.#bindChild(id, metadata.sessionID);
    }
    if (name !== CODE_MODE_TOOL) {
      return;
    }
    const blocks = this.#blocksOf(messageID);
    const program = {
      id,
      metadata,
      settled,
      ...(threw ? { threw } : {}),
    };
    for (const { key, use, result } of codeModeCalls(program)) {
      if (!this.#toolsEmitted.has(key)) {
        this.#ctx.frame({
          type: "assistant",
          uuid: messageID,
          ...this.#createdOf(messageID),
          contentOffset: blockIndex(blocks, `tool:${key}`),
          message: { content: [use] },
        });
        this.#toolsEmitted.set(key, "called");
        this.#codeModeOpen.add(key);
      }
      if (result && this.#toolsEmitted.get(key) !== "resolved") {
        this.#ctx.frame({
          type: "user",
          message: { role: "user", content: [result] },
        });
        this.#toolsEmitted.set(key, "resolved");
        this.#codeModeOpen.delete(key);
      }
    }
  }

  /** The live thinking block for a reasoning block, opened once. */
  #openThinkingBlock(messageID: string, key: string): void {
    this.#blocksOf(messageID);
    blockIndex(this.#blocksOf(messageID), key);
    const open = `${messageID}\n${key}`;
    if (this.#openThinking === open) {
      return;
    }
    this.#closeThinking();
    this.#openThinking = open;
    this.#thinkingFrame(
      {
        type: "content_block_start",
        content_block: { type: "thinking", thinking: "" },
      },
      messageID
    );
  }

  #thinkingFrame(
    event:
      | {
          type: "content_block_start";
          content_block: { type: "thinking"; thinking: string };
        }
      | {
          type: "content_block_delta";
          delta: { type: "thinking_delta"; thinking: string };
        }
      | { type: "content_block_stop" },
    messageID?: string
  ): void {
    this.#ctx.frame({
      type: "stream_event",
      session_id: this.sessionId ?? undefined,
      ...(messageID ? { message_id: messageID } : {}),
      event,
    });
  }

  #closeThinking(): void {
    if (this.#openThinking === null) {
      return;
    }
    this.#openThinking = null;
    this.#thinkingFrame({ type: "content_block_stop" });
  }

  /** A provider retry, said once per distinct note; at the account's usage limit, the turn ends on it. */
  #retry(message: string, next: number): void {
    this.#turnRevision += 1;
    this.#busy = true;
    this.#turnOpen = true;
    this.#ctx.busy(true);
    const wait = ` — next attempt in ${Math.max(0, Math.round((next - Date.now()) / 1000))}s`;
    const note = `${message}${wait}`;
    if (note !== this.#lastRetryNote) {
      this.#lastRetryNote = note;
      this.#ctx.frame({
        type: "system",
        subtype: PROVIDER_RETRY,
        session_id: this.sessionId ?? undefined,
        content: note,
        retry: { message, nextAttemptAt: next },
      });
    }
    if (this.account !== undefined && PROVIDER_LIMIT.test(message)) {
      this.refuseAtLimit(message).catch((cause: unknown) =>
        console.warn(
          `[opencode] ${this.instanceId}: could not end the turn at its limit: ${errorText(cause)}`
        )
      );
    }
  }

  /**
   * Closes the turn: whatever was drawn live and not answered is closed, then
   * a result. `closing` overrides the default `success` for the failure and
   * stop paths.
   */
  #flushResult(closing?: {
    subtype: string;
    is_error: boolean;
    errors?: string[];
  }): void {
    const refusal = this.#limitRefusal;
    this.#limitRefusal = undefined;
    const result =
      refusal && this.#turnOpen
        ? {
            subtype: "error_during_execution",
            is_error: true,
            errors: [refusal],
          }
        : closing;
    this.#closeThinking();
    // As read back: a Code Mode call whose answer never came ended with nothing kept.
    for (const key of this.#codeModeOpen) {
      this.#ctx.frame({
        type: "user",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: key, content: "" }],
        },
      });
      this.#toolsEmitted.set(key, "resolved");
    }
    this.#codeModeOpen.clear();
    // A ghost end (one that trails a stop already closed) has no open turn
    // and emits no result frame; only a real turn's close or an explicit
    // failure does.
    if (!(this.#turnOpen || result)) {
      return;
    }
    const turnCost = [...this.#steps.values()].reduce(
      (sum, step) => sum + step.cost,
      0
    );
    const identity =
      this.#completion ??
      (this.#turnPrompt ? { uuid: this.#turnPrompt } : undefined);
    this.#turnOpen = false;
    if (this.sessionId) {
      markTurn(this.sessionId, false);
    }
    this.#ctx.frame({
      type: "result",
      ...identity,
      // biome-ignore lint/suspicious/noUnnecessaryConditions: history recovery sets this across calls to handle().
      ...(this.#recoveringTurn ? { recovered: true } : {}),
      subtype: result?.subtype ?? "success",
      is_error: result?.is_error ?? false,
      ...(result?.errors ? { errors: result.errors } : {}),
      total_cost_usd: this.#costBase + turnCost,
      turnUsage: usageByModel(
        [...this.#steps.values()].map((step) => step.tokens)
      ),
      cache: {
        read: this.#lastTokens.cache.read,
        write: this.#lastTokens.cache.write,
      },
      ...(this.#lastSent === undefined
        ? {}
        : { contextTokens: this.#lastSent }),
    });
    this.#costBase += turnCost;
    this.#steps.clear();
    this.#messages.clear();
    this.#created.clear();
    for (const [id, state] of this.#toolsEmitted) {
      if (state === "resolved") {
        this.#toolsEmitted.delete(id);
        this.#toolNames.delete(id);
        this.#toolInputs.delete(id);
      }
    }
    this.#completion = undefined;
    this.#lastRetryNote = "";
    this.#clearStallTimer();
  }

  // ------------------------------------------------------------- gates

  /** A tool permission ask: the session's mode answers it, or the hub parks it. */
  #asked(asked: PermissionRequest): void {
    if (this.#seenGates.has(asked.id) || this.#resolvedGates.has(asked.id)) {
      return;
    }
    this.#seenGates.add(asked.id);
    // OpenCode asks; the daemon is where a session's mode is enforced. A
    // lead's shell and edit asks are the hub's gate's to answer, never his
    // mode's ({@link leadAsks}).
    const gated = this.#lead && LEAD_ASKED.has(asked.action);
    if (
      !gated &&
      (autoAllows(this.#permissionMode, "tool") ||
        (this.#permissionMode === "acceptEdits" && asked.action === "edit"))
    ) {
      this.#replyPermission(asked.id, "once");
      return;
    }
    this.#ctx.permission({
      requestId: asked.id,
      toolName: asked.action,
      input: (asked.metadata as Record<string, unknown> | undefined) ?? {
        resources: asked.resources,
      },
      requestKind: "tool",
      ...(asked.source ? { toolUseId: asked.source.id } : {}),
    });
  }

  /**
   * A form OpenCode put to the session: the `question` tool's (2.0's
   * replacement for 1.x's questions, settled #4) or any other, parked as the
   * fleet's question. Only the ask is raised here: the transcript row is the
   * `question` call the form rides on.
   */
  #formAsked(form: FormInfo): void {
    if (this.#seenGates.has(form.id) || this.#resolvedGates.has(form.id)) {
      return;
    }
    this.#seenGates.add(form.id);
    const { questions, keys } = formQuestions(form);
    this.#questions.set(form.id, { form, keys });
    const tool = (form.metadata as { tool?: { id?: unknown } } | undefined)
      ?.tool;
    this.#ctx.permission({
      requestId: form.id,
      toolName: ASK_USER_QUESTION,
      input: { questions },
      requestKind: "question",
      ...(typeof tool?.id === "string" ? { toolUseId: tool.id } : {}),
    });
  }

  /** Called only after the event stream is up, including every reconnect: what a gap in it hid. */
  reconcileGates(): Promise<void> {
    if (this.#reconciling) {
      return this.#reconciling;
    }
    this.#reconciling = Promise.all(
      (["permission", "form"] as const).map((kind) => this.#snapshotGates(kind))
    )
      .then(() => undefined)
      .finally(() => {
        this.#reconciling = undefined;
      });
    return this.#reconciling;
  }

  /** One kind of the session's pending gates read back and raised, tried up to three times. */
  async #snapshotGates(kind: "form" | "permission"): Promise<void> {
    const sessionID = this.#opencodeSessionId();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const options = {
        signal: AbortSignal.any([
          this.#lifetime.signal,
          AbortSignal.timeout(RECOVERY_TIMEOUT_MS),
        ]),
      };
      try {
        if (kind === "permission") {
          for (const ask of await this.#client.permission.list(
            { sessionID },
            options
          )) {
            this.#asked(ask);
          }
        } else {
          for (const form of await this.#client.session.form.list(
            { sessionID },
            options
          )) {
            this.#formAsked(form);
          }
        }
        this.#gateFailures.delete(kind);
        return;
      } catch (error) {
        if (this.#lifetime.signal.aborted) {
          return;
        }
        if (!this.#gateFailures.has(kind)) {
          this.#gateFailures.add(kind);
          console.warn(
            `[opencode] ${this.instanceId}: ${kind} snapshot failed: ${errorText(error)}`
          );
        }
        if (attempt < 2) {
          // biome-ignore lint/performance/noAwaitInLoops: bounded retry of this endpoint, independently of the other
          await Bun.sleep(250 * 2 ** attempt);
        }
      }
    }
  }

  /** OpenCode's reply carries no words for a tool ask; a withdrawn gate is rejected as a denied one is. */
  withdrawPermission(requestId: string, message: string): void {
    this.resolvePermission(requestId, { behavior: "deny", message });
  }

  resolvePermission(requestId: string, result: PermissionResult): void {
    if (this.#resolvedGates.has(requestId)) {
      return;
    }
    const asked = this.#questions.get(requestId);
    if (asked) {
      this.#resolvedGates.add(requestId);
      this.#questions.delete(requestId);
      this.#ctx.permissionResolved?.(requestId);
      // biome-ignore lint/complexity/noVoid: fire-and-forget: resolvePermission itself is not awaited by its callers
      void this.#replyForm(requestId, asked, result);
      return;
    }
    let decision: "once" | "always" | "reject";
    if (result.behavior === "deny") {
      decision = "reject";
    } else if (result.remember) {
      decision = "always";
    } else {
      decision = "once";
    }
    this.#replyPermission(requestId, decision);
  }

  /** The one answer path for a tool permission — the auto-allow shares it. */
  #replyPermission(
    requestId: string,
    decision: "once" | "always" | "reject"
  ): void {
    if (this.#resolvedGates.has(requestId)) {
      return;
    }
    this.#resolvedGates.add(requestId);
    this.#ctx.permissionResolved?.(requestId);
    const sessionID = this.#opencodeSessionId();
    // biome-ignore lint/complexity/noVoid: fire-and-forget: #replyPermission itself is not awaited by its callers
    void withRestartHold("write", `permission:${requestId}`, () =>
      this.#client.permission.reply(
        { sessionID, requestID: requestId, decision },
        { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
      )
    ).catch((error: unknown) =>
      console.warn(`[opencode] permission reply failed: ${errorText(error)}`)
    );
  }

  /**
   * A form answered (or declined) from the hub. The reader's choices arrive
   * keyed by question text (QuestionCard builds `UserAnswers` that way); the
   * form takes them by field key. A form already settled elsewhere answers
   * 409 (`FormAlreadySettledError`, settled #4): it is answered, and nothing
   * failed.
   */
  async #replyForm(
    formID: string,
    asked: { form: FormInfo; keys: Map<string, FormInfo["fields"][number]> },
    result: PermissionResult
  ): Promise<void> {
    const sessionID = this.#opencodeSessionId();
    const options = { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) };
    try {
      await withRestartHold("write", `form:${formID}`, async () => {
        if (result.behavior === "deny") {
          await this.#client.session.form.cancel(
            {
              sessionID,
              formID,
              ...(result.message ? { message: result.message } : {}),
            },
            options
          );
          return;
        }
        const given =
          (result as { updatedInput?: { answers?: UserAnswers } }).updatedInput
            ?.answers ?? {};
        const answer: Record<string, string | number | boolean | string[]> = {};
        for (const [question, field] of asked.keys) {
          const value = fieldAnswer(field, given[question]);
          if (value !== undefined) {
            answer[field.key] = value;
          }
        }
        await this.#client.session.form.reply(
          { sessionID, formID, answer },
          options
        );
      });
    } catch (error) {
      if (errorTag(error) === "FormAlreadySettledError") {
        return;
      }
      this.#ctx.failed(
        new Error(`OpenCode form reply failed: ${errorText(error)}`)
      );
    }
  }

  // ------------------------------------------------------------- children

  /** A `session.created` event named a child of this session; its agent and title for the bind. */
  handleChildCreated(
    childId: string,
    agent: string | undefined,
    title: string | undefined
  ): void {
    this.#childInfo.set(childId, { agent, title });
  }

  /** Links a `subagent` call to its child session; emits the branch-opening frame once. */
  #bindChild(callID: string, childId: string): void {
    if (this.#boundCalls.has(callID)) {
      return;
    }
    this.#boundCalls.add(callID);
    const info = this.#childInfo.get(childId);
    const input = this.#toolInputs.get(callID) as
      { agent?: string; description?: string } | undefined;
    this.#ctx.frame({
      type: "system",
      subtype: "task_started",
      session_id: this.sessionId ?? undefined,
      tool_use_id: callID,
      task_id: childId,
      subagent_type: info?.agent ?? input?.agent ?? "subagent",
      description: info?.title ?? input?.description ?? "",
    });
    this.#registerChild(childId, callID);
  }

  #childStateOf(callID: string): ChildState {
    let state = this.#childState.get(callID);
    if (!state) {
      state = {
        messages: new Map(),
        toolNames: new Map(),
        toolInputs: new Map(),
        toolsEmitted: new Map(),
      };
      this.#childState.set(callID, state);
    }
    return state;
  }

  /** Routes a child session's event through the parent's frame stream under the `subagent` call `callID`. */
  handleChild(event: V2Event, callID: string): void {
    const state = this.#childStateOf(callID);
    const blocksOf = (messageID: string): MessageBlocks => {
      let blocks = state.messages.get(messageID);
      if (!blocks) {
        blocks = { keys: [], published: new Set() };
        state.messages.set(messageID, blocks);
      }
      return blocks;
    };
    const publish = (
      messageID: string,
      key: string,
      block: Extract<NeutralContentBlock, { type: "text" | "thinking" }>
    ): void => {
      const blocks = blocksOf(messageID);
      const offset = blockIndex(blocks, key);
      if (blocks.published.has(key)) {
        return;
      }
      blocks.published.add(key);
      this.#ctx.frame({
        type: "assistant",
        uuid: messageID,
        contentOffset: offset,
        parent_tool_use_id: callID,
        message: { content: [block] },
      });
    };
    switch (event.type) {
      case "session.text.started":
        blockIndex(
          blocksOf(event.data.assistantMessageID),
          `text:${event.data.ordinal}`
        );
        break;
      case "session.text.delta":
        this.#ctx.frame({
          type: "stream_event",
          session_id: this.sessionId ?? undefined,
          parent_tool_use_id: callID,
          event: {
            type: "content_block_delta",
            delta: { type: "text_delta", text: event.data.delta },
          },
        });
        break;
      case "session.text.ended":
        publish(event.data.assistantMessageID, `text:${event.data.ordinal}`, {
          type: "text",
          text: event.data.text,
        });
        break;
      case "session.reasoning.ended":
        // A child's reasoning has no live block: it settles whole.
        publish(
          event.data.assistantMessageID,
          `reasoning:${event.data.ordinal}`,
          { type: "thinking", thinking: event.data.text }
        );
        break;
      case "session.tool.input.started":
        state.toolNames.set(event.data.id, event.data.name);
        blockIndex(
          blocksOf(event.data.assistantMessageID),
          `tool:${event.data.id}`
        );
        break;
      case "session.tool.called": {
        state.toolInputs.set(event.data.id, event.data.input);
        if (state.toolsEmitted.has(event.data.id)) {
          break;
        }
        this.#ctx.frame({
          type: "assistant",
          uuid: event.data.assistantMessageID,
          contentOffset: blockIndex(
            blocksOf(event.data.assistantMessageID),
            `tool:${event.data.id}`
          ),
          parent_tool_use_id: callID,
          message: {
            content: [
              {
                type: "tool_use",
                id: event.data.id,
                name: toolNameOf(state.toolNames.get(event.data.id) ?? ""),
                input: toolInputOf(event.data.input),
              },
            ],
          },
        });
        state.toolsEmitted.set(event.data.id, "called");
        break;
      }
      case "session.tool.success":
      case "session.tool.failed": {
        const { id } = event.data;
        if (state.toolsEmitted.get(id) === "resolved") {
          break;
        }
        this.#ctx.frame({
          type: "user",
          parent_tool_use_id: callID,
          message: {
            role: "user",
            content: [
              toolResultOf(
                id,
                state.toolNames.get(id) ?? "",
                state.toolInputs.get(id),
                event.type === "session.tool.success"
                  ? {
                      content: event.data.content,
                      metadata: event.data.metadata,
                    }
                  : { error: event.data.error },
                event.type === "session.tool.failed"
              ),
            ],
          },
        });
        state.toolsEmitted.set(id, "resolved");
        break;
      }
      default:
        // The child's turn ending needs no frame: the parent's `subagent`
        // result closes its branch.
        break;
    }
  }

  // ------------------------------------------------------------- recovery

  /**
   * A session reattached while its turn was already open on the server. That
   * turn was started by a process that no longer exists, so no event of its
   * start will ever reach this one. Ask the server once: a running answer
   * opens the turn as the event would, arms the stall notice, and says so in
   * the transcript. Fails soft: a read that errors leaves the session as it
   * is; the spawn already succeeded.
   */
  async watchResumedTurn(): Promise<void> {
    if (this.sessionId === null) {
      return;
    }
    const revision = this.#turnRevision;
    try {
      const running = await this.#readActivity();
      if (!this.#snapshotCurrent(revision)) {
        return;
      }
      const reattachedBusy = this.#reattachedBusy;
      this.#reattachedBusy = false;
      if (!running) {
        // Idle on the server, yet the hub is still owed this turn's end: it
        // ended while nothing here was subscribed.
        if (this.#turnOpen || this.#sleepAfterRecovery) {
          await this.#endMissedTurn(revision);
          if (revision !== this.#turnRevision && !this.#sleepAfterRecovery) {
            return;
          }
        }
        if (
          // biome-ignore lint/suspicious/noUnnecessaryConditions: sleepAfterRecovery() arms this before attachment.
          this.#sleepAfterRecovery &&
          !this.#busy &&
          this.#queue.length === 0
        ) {
          await this.dispose();
          this.#ctx.closed?.();
          return;
        }
        // biome-ignore lint/suspicious/noUnnecessaryConditions: #reattachedBusy is set by reattachedMidTurn() elsewhere
        if (reattachedBusy && this.#busy && this.#turnPrompt === undefined) {
          this.#busy = false;
          this.#ctx.busy(false);
        }
        return;
      }
      this.#turnRevision += 1;
      this.#busy = true;
      this.#turnOpen = true;
      this.#ctx.busy(true);
      this.#noteServerActivity();
      this.#ctx.frame({
        type: "system",
        subtype: "resumed_mid_turn",
        session_id: this.sessionId,
        content:
          "Resumed mid-turn: the provider was still working when this session was reattached. If nothing arrives, interrupt and retry.",
      });
    } catch (error) {
      if (this.#lifetime.signal.aborted) {
        return;
      }
      console.warn(
        `[opencode] could not read the status of resumed session ${this.sessionId}: ${errorText(error)}`
      );
    }
  }

  /** A snapshot never reopens a turn a live event ended, or closes a newer send. */
  #snapshotCurrent(revision: number): boolean {
    if (this.#lifetime.signal.aborted) {
      return false;
    }
    if (revision === this.#turnRevision) {
      return true;
    }
    console.info(
      `[opencode] ${this.instanceId}: discarded stale turn snapshot revision=${revision} current=${this.#turnRevision} busy=${this.#busy} open=${this.#turnOpen}`
    );
    return false;
  }

  /**
   * A turn the hub is owed ended on the server while nothing was subscribed:
   * the agent restarted, the server was replaced, or the stream was down
   * (2.0's stream has no replay). Its replies are read back from history and
   * drawn as the live stream would have drawn them, and the turn ends as it
   * ended there: the outcome its `idle` message records, or — a turn the
   * idle server never finished — cut off with its server.
   *
   * Only the replies to the prompt this turn is for: a prompt this process
   * has just sent and the server has not delivered yet is left to its events.
   */
  async #endMissedTurn(revision: number): Promise<void> {
    const listed = await this.#client.message.list(
      { sessionID: this.#opencodeSessionId(), order: "desc", limit: 100 },
      {
        signal: AbortSignal.any([
          this.#lifetime.signal,
          AbortSignal.timeout(RECOVERY_TIMEOUT_MS),
        ]),
      }
    );
    if (!this.#snapshotCurrent(revision)) {
      return;
    }
    const rows = [...listed.data].reverse();
    const asked = rows.findLastIndex((row) => row.type === "user");
    const prompt = rows[asked];
    if (
      !prompt ||
      (this.#turnPrompt !== undefined && prompt.id !== this.#turnPrompt)
    ) {
      return;
    }
    const after = rows.slice(asked + 1);
    this.#open = true;
    this.#recoveringTurn = true;
    try {
      for (const row of after) {
        if (row.type === "assistant") {
          this.#replay(row);
        }
      }
      const ending = missedTurnEnd(after);
      if (ending === "cut") {
        // Cut, not ended: the hub hands this turn back on hearing it, so a
        // recovery handle stays to take it up rather than going to sleep.
        this.#sleepAfterRecovery = false;
        this.#turnEnded({
          subtype: "error_during_execution",
          is_error: true,
          errors: [SERVER_STOPPED_MID_TURN],
        });
      } else {
        this.#turnEnded(ending);
      }
    } finally {
      this.#recoveringTurn = false;
    }
  }

  /** One stored assistant message drawn as its live events would have drawn it. */
  #replay(message: SessionMessageAssistant): void {
    const timestamp = new Date(message.time.created).toISOString();
    this.#created.set(message.id, timestamp);
    this.#completion = { uuid: message.id, timestamp };
    if (message.tokens) {
      this.#steps.set(message.id, {
        cost: message.cost ?? 0,
        tokens: {
          model: `${message.model.providerID}/${message.model.id}`,
          input: message.tokens.input,
          output: message.tokens.output,
          cacheRead: message.tokens.cache.read,
          cacheWrite: message.tokens.cache.write,
        },
      });
    }
    const ordinals = { text: 0, reasoning: 0 };
    for (const block of message.content) {
      if (block.type === "text" || block.type === "reasoning") {
        const key = `${block.type}:${ordinals[block.type]}`;
        ordinals[block.type] += 1;
        this.#publish(
          message.id,
          key,
          block.type === "text"
            ? { type: "text", text: block.text }
            : { type: "thinking", thinking: block.text }
        );
        continue;
      }
      this.#toolNames.set(block.id, block.name);
      this.#toolInputs.set(block.id, block.state.input);
      blockIndex(this.#blocksOf(message.id), `tool:${block.id}`);
      if (block.state.status === "streaming") {
        continue;
      }
      this.#toolUse(message.id, block.id);
      const { state } = block;
      const { metadata } = state as { metadata?: Record<string, unknown> };
      const settled = state.status === "completed" || state.status === "error";
      this.#toolProgress(
        message.id,
        block.id,
        metadata ?? {},
        settled,
        state.status === "error" ? errorText(state.error) : undefined
      );
      if (!settled || this.#toolsEmitted.get(block.id) === "resolved") {
        continue;
      }
      this.#ctx.frame({
        type: "user",
        message: {
          role: "user",
          content: [
            toolResultOf(
              block.id,
              block.name,
              state.input,
              state.status === "completed"
                ? { content: state.content, metadata }
                : { error: state.error },
              state.status === "error"
            ),
          ],
        },
      });
      this.#toolsEmitted.set(block.id, "resolved");
    }
  }

  /** Reattached while the server still runs this session's turn: busy from the moment it is handed back. */
  reattachedMidTurn(): void {
    this.#turnRevision += 1;
    this.#reattachedBusy = true;
    this.#busy = true;
    this.#ctx.busy(true);
  }

  /** A turn an earlier agent process opened on this session and never ended: the hub is still owed its end. */
  inheritOpenTurn(): void {
    this.#open = true;
  }

  /** A recovery handle ends normally once the server says its turn is idle. */
  sleepAfterRecovery(): void {
    this.#sleepAfterRecovery = true;
  }

  /** Any server event is progress: re-arm the stall notice while a turn is open. */
  #noteServerActivity(): void {
    if (!this.#turnOpen) {
      return;
    }
    this.#clearStallTimer();
    this.#stallTimer = setTimeout(() => {
      this.#stallTimer = undefined;
      if (!this.#turnOpen) {
        return;
      }
      this.#ctx.frame({
        type: "system",
        subtype: "provider_stalled",
        session_id: this.sessionId ?? undefined,
        content:
          "Still waiting on the provider with no output — the turn is open and may yet complete. If this persists, interrupt and retry.",
      });
    }, STALLED_TURN_MS);
  }

  #clearStallTimer(): void {
    if (this.#stallTimer !== undefined) {
      clearTimeout(this.#stallTimer);
      this.#stallTimer = undefined;
    }
  }

  // ------------------------------------------------------------- sends

  send(
    message: SentMessage,
    extras: {
      attachments?: { name: string; content: string }[];
      images?: { mediaType: string; data: string }[];
    }
  ): void {
    this.#sleepAfterRecovery = false;
    this.#turnRevision += 1;
    const { content } = message.message;
    let text =
      typeof content === "string"
        ? content
        : content
            .filter(
              (block): block is { type: "text"; text: string } =>
                block.type === "text"
            )
            .map((block) => block.text)
            .join("\n");
    for (const attachment of extras.attachments ?? []) {
      text += `\n\n<pasted-text name="${attachment.name}">\n${attachment.content}\n</pasted-text>`;
    }
    const files = (extras.images ?? []).map((image) => ({
      uri: `data:${image.mediaType};base64,${image.data}`,
      name: "image",
    }));
    // The message it becomes is named up front, and the hub told at once, so
    // OpenCode's word that the message is read says which send it was.
    const messageID = messageId();
    const { uuid } = message;
    this.#ctx.frame({
      type: "system",
      subtype: MESSAGES_STORED,
      storedAs: { [uuid]: messageID },
      session_id: this.sessionId ?? undefined,
    });
    // Held while the gate holds it, behind whatever it holds already: every
    // send is taken up in the order it was sent ({@link #drainQueue}).
    if (
      this.#isConfigGateHeld(this.#busy) ||
      this.#draining ||
      this.#queue.length > 0
    ) {
      this.#queue.push({ text, files, messageID, uuid });
      this.#drainQueue();
      return;
    }
    // Idle or busy, every send is admitted at once: OpenCode's inbox keeps it
    // and delivers it at the running turn's next step, which is when it is read.
    this.#ctx.busy(true);
    const command = parseCommand(text);
    if (command) {
      // biome-ignore lint/complexity/noVoid: fire-and-forget: send() itself is not awaited by its callers
      void this.#commandOrPrompt(command, text, files, messageID, uuid);
    } else {
      this.#prompt(text, files, messageID, uuid);
    }
  }

  /** One send admitted as message `messageID`. A prompt OpenCode refuses is that send's failure; the session goes on. */
  #prompt(
    text: string,
    files: { uri: string; name: string }[],
    messageID: string,
    uuid: string
  ): void {
    // biome-ignore lint/complexity/noVoid: send() remains synchronous while dispatch custody is prepared
    void this.#dispatchPrompt(text, files, messageID, uuid);
  }

  async #dispatchPrompt(
    text: string,
    files: { uri: string; name: string }[],
    messageID: string,
    uuid: string
  ): Promise<void> {
    try {
      await this.#prepareDispatch();
    } catch (error) {
      this.#ctx.rejected(uuid, error);
      this.#drained(messageID);
      return;
    }
    this.#turnOpen = true;
    this.#turnPrompt = messageID;
    this.#noteServerActivity();
    // Held until the server has it: a restart before then loses the send.
    const handed = holdRestart("write", `prompt:${messageID}`);
    try {
      await this.#client.session.prompt({
        sessionID: this.#opencodeSessionId(),
        id: messageID,
        text,
        ...(files.length > 0 ? { files } : {}),
      });
    } catch (error) {
      // A prompt that was never admitted opens no turn there, so no event
      // will ever settle it: said, and busy cleared here, or the session
      // strands busy with every later send queuing behind nothing.
      this.#turnOpen = false;
      this.#clearStallTimer();
      this.#busy = false;
      this.#ctx.busy(false);
      this.#ctx.rejected(uuid, error);
    } finally {
      handed();
      this.#drained(messageID);
    }
  }

  /**
   * Delivers what the config gate held, in arrival order, one admission at a
   * time. A send into a running turn passes a retiring server's hold (the
   * gate's `joinsTurn`): it starts no turn there, so the session can still
   * come to rest and move, and it is read at the turn's next step, never
   * behind the turn.
   */
  #drainQueue(): void {
    if (this.#draining || this.#isConfigGateHeld(this.#busy)) {
      return;
    }
    const next = this.#queue.shift();
    if (!next) {
      return;
    }
    this.#ctx.busy(true);
    this.#draining = next.messageID;
    this.#prompt(next.text, next.files, next.messageID, next.uuid);
  }

  /** A held send is admitted, one way or the other: the next may go. */
  #drained(messageID: string): void {
    if (messageID === this.#draining) {
      this.#draining = undefined;
      this.#drainQueue();
    }
  }

  /** The commands and skills this session's location has, read once. */
  #commandsOf(): Promise<{
    commands: Set<string>;
    skills: Map<string, string>;
  }> {
    this.#commands ??= Promise.all([
      this.#client.command.list(at(this.#directory)),
      this.#client.skill.list(at(this.#directory)),
    ]).then(([commands, skills]) => ({
      commands: new Set(commands.data.map((command) => command.name)),
      skills: new Map(
        skills.data.map((skill) => [skill.name, skill.id] as const)
      ),
    }));
    this.#commands.catch(() => {
      this.#commands = null;
    });
    return this.#commands;
  }

  /** A `/name` send: OpenCode's command, a skill, `/compact`, `/mcp`, or else a plain prompt. */
  async #commandOrPrompt(
    command: { name: string; args: string },
    text: string,
    files: { uri: string; name: string }[],
    messageID: string,
    uuid: string
  ): Promise<void> {
    let known: { commands: Set<string>; skills: Map<string, string> };
    try {
      known = await this.#commandsOf();
    } catch (error) {
      this.#ctx.rejected(uuid, error);
      return;
    }
    // `/compact` and `/mcp` are no registered commands: they are the server's
    // own calls, never a prompt to the model.
    if (command.name === "compact" && !known.commands.has(command.name)) {
      await this.#compact(uuid);
      return;
    }
    if (command.name === "mcp" && !known.commands.has(command.name)) {
      await this.#mcpCommand(command.args, uuid);
      return;
    }
    const skill = known.skills.get(command.name);
    if (!(known.commands.has(command.name) || skill)) {
      this.#prompt(text, files, messageID, uuid);
      return;
    }
    await this.#runCommand(command, files, messageID, uuid, skill);
  }

  /** A known command, or a skill by its id, run as the send `uuid` (message `messageID`). */
  async #runCommand(
    command: { name: string; args: string },
    files: { uri: string; name: string }[],
    messageID: string,
    uuid: string,
    skill: string | undefined
  ): Promise<void> {
    try {
      await this.#prepareDispatch();
    } catch (error) {
      this.#ctx.rejected(uuid, error);
      return;
    }
    this.#turnOpen = true;
    this.#turnPrompt = messageID;
    const handed = holdRestart("write", `command:${messageID}`);
    try {
      const sessionID = this.#opencodeSessionId();
      if (skill) {
        // A skill is activated as a message of its own; words after it are
        // the prompt it answers, else the activation itself resumes the turn.
        await this.#client.session.skill({
          sessionID,
          id: skill,
          resume: command.args.trim() === "",
        });
        if (command.args.trim() === "") {
          this.#ctx.frame({
            type: "system",
            subtype: MESSAGES_READ,
            read: [uuid],
            session_id: this.sessionId ?? undefined,
          });
        } else {
          await this.#client.session.prompt({
            sessionID,
            id: messageID,
            text: command.args,
            ...(files.length > 0 ? { files } : {}),
          });
        }
      } else {
        await this.#client.session.command({
          sessionID,
          name: command.name,
          text: command.args,
          ...(files.length > 0 ? { files } : {}),
        });
        this.#ctx.frame({
          type: "system",
          subtype: MESSAGES_READ,
          read: [uuid],
          session_id: this.sessionId ?? undefined,
        });
      }
    } catch (error) {
      this.#ctx.rejected(uuid, error);
    } finally {
      handed();
    }
  }

  /**
   * `/mcp connect|disconnect <server>`. 2.0 has no HTTP route for an MCP
   * server's OAuth sign-in or sign-out (only `opencode mcp auth|logout` on the
   * server's machine), so those are refused with where they are done.
   */
  async #mcpCommand(args: string, uuid: string): Promise<void> {
    const [verb = "", server = ""] = args.trim().split(WHITESPACE_RE);
    this.#ctx.frame({
      type: "system",
      subtype: MESSAGES_READ,
      read: [uuid],
      session_id: this.sessionId ?? undefined,
    });
    try {
      if (!(verb && server)) {
        throw new Error(MCP_USAGE);
      }
      const target = { server, ...at(this.#directory) };
      if (verb === "connect" || verb === "reconnect") {
        await this.#client.mcp.connect(target);
      } else if (verb === "disconnect") {
        await this.#client.mcp.disconnect(target);
      } else if (verb === "auth" || verb === "login" || verb === "logout") {
        throw new Error(
          `OpenCode 2.0 signs an MCP server in or out only on its own machine (opencode mcp ${verb === "logout" ? "logout" : "auth"} ${server}). A fleet server signs in from the dashboard: Configure → MCP servers.`
        );
      } else {
        throw new Error(`Unknown /mcp verb "${verb}". ${MCP_USAGE}`);
      }
    } catch (error) {
      this.#ctx.rejected(uuid, error);
    } finally {
      this.#ctx.busy(false);
    }
  }

  /**
   * Compacts the session (`POST …/compact`: 2.0 admits it to the inbox and
   * runs it at the next step boundary, or now when idle, on the session's own
   * model). OpenCode keeps no user message for it, so the hub is told the
   * send was read here; the turn it runs opens and ends on its events.
   */
  async #compact(uuid: string): Promise<void> {
    try {
      await this.#prepareDispatch();
      await this.#client.session.compact({
        sessionID: this.#opencodeSessionId(),
      });
    } catch (error) {
      this.#ctx.rejected(uuid, error);
      return;
    }
    this.#ctx.frame({
      type: "system",
      subtype: MESSAGES_READ,
      read: [uuid],
      session_id: this.sessionId ?? undefined,
    });
  }

  /** The session's skills loaded before its first prompt, each as a message of its own, in order. */
  async loadSkills(names: readonly string[]): Promise<void> {
    if (names.length === 0) {
      return;
    }
    await this.#prepareDispatch();
    const { skills } = await this.#commandsOf();
    const sessionID = this.#opencodeSessionId();
    for (const name of names) {
      const id = skills.get(name);
      if (!id) {
        throw new Error(
          `OpenCode has no skill “${name}” at ${this.#directory}.`
        );
      }
      // biome-ignore lint/performance/noAwaitInLoops: skills load in order, before the first prompt
      await this.#client.session.skill(
        { sessionID, id, resume: false },
        { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
      );
    }
  }

  // ------------------------------------------------------------- controls

  /** The model's context window, from the location's catalog. */
  async #contextLimit(): Promise<number> {
    const ref = this.#model ? splitModel(this.#model) : undefined;
    if (!ref?.providerID) {
      return 200_000;
    }
    const listed = await this.#client.model.list(at(this.#directory));
    const model = listed.data.find(
      (one) => one.providerID === ref.providerID && one.id === ref.id
    );
    return model ? requestWindow(model.limit) : 200_000;
  }

  /** The location's commands and skills as the fleet's slash commands, and `/mcp`. */
  async #slashCommands(): Promise<SlashCommand[]> {
    const [commands, skills] = await Promise.all([
      this.#client.command.list(at(this.#directory)),
      this.#client.skill.list(at(this.#directory)),
    ]);
    return [
      ...commands.data.map((command): SlashCommand => ({
        name: command.name,
        description: command.description ?? "",
        argumentHint: "",
        kind: "custom",
      })),
      ...skills.data.map((skill): SlashCommand => ({
        name: skill.name,
        description: skill.description ?? "",
        argumentHint: "",
        kind: "skill",
      })),
      {
        name: "mcp",
        description: "Connect or disconnect an MCP server",
        argumentHint: "connect|disconnect <server>",
        kind: "builtin",
      },
    ];
  }

  async control(method: string, args: unknown[]): Promise<unknown> {
    // Config convergence gate: MCP mutations must not race a server replacement.
    if (
      this.#isConfigGateHeld() &&
      (method === CONTROL_MCP_RECONNECT || method === CONTROL_MCP_TOGGLE)
    ) {
      throw new Error(`${method} blocked: config reload in progress`);
    }
    if (method === INSTALL_SESSION_CREDENTIAL) {
      return await this.#installCredential(args[0]);
    }
    if (method === VERIFY_SESSION_CREDENTIAL) {
      return await this.#verifyCredential();
    }
    switch (method) {
      case CONTROL_INTERRUPT:
        await this.interrupt();
        return;
      case CONTROL_SET_MODEL:
        this.#model = args[0] as string;
        return;
      case CONTROL_SET_EFFORT:
        if (!EFFORT_LEVELS.includes(args[0] as EffortLevel)) {
          throw new Error(`Unsupported OpenCode effort: ${String(args[0])}`);
        }
        this.#effort = args[0] as EffortLevel;
        this.sayEffort();
        return;
      case CONTROL_SET_PERMISSION_MODE:
        this.#permissionMode = args[0] as string;
        return;
      case CONTROL_CONTEXT_USAGE: {
        const tokens = this.#lastTokens;
        const total =
          tokens.input +
          tokens.output +
          tokens.reasoning +
          tokens.cache.read +
          tokens.cache.write;
        const maxTokens = await this.#contextLimit();
        return {
          totalTokens: total,
          maxTokens,
          percentage: Math.min(100, Math.round((total / maxTokens) * 100)),
          categories: [
            {
              name: "Input",
              tokens: tokens.input,
              color: "var(--flexoki-blue)",
            },
            {
              name: "Output",
              tokens: tokens.output,
              color: "var(--flexoki-green)",
            },
            {
              name: "Reasoning",
              tokens: tokens.reasoning,
              color: "var(--flexoki-orange)",
            },
          ],
        };
      }
      case CONTROL_SUPPORTED_MODELS:
        return await opencodeCatalog(this.#client, this.#directory);
      case CONTROL_SUPPORTED_COMMANDS:
        return await this.#slashCommands();
      case CONTROL_RELOAD_SKILLS:
        this.#commands = null;
        return {
          skills: (await this.#slashCommands()).filter(
            (command) => command.kind === "skill"
          ),
        };
      case CONTROL_MCP_STATUS: {
        const listed = await this.#client.mcp.list(at(this.#directory));
        return listed.data.map((server): McpServerStatus => ({
          name: server.name,
          status:
            server.status.status === "needs_auth"
              ? "needs-auth"
              : server.status.status,
          ...("error" in server.status ? { error: server.status.error } : {}),
        }));
      }
      case CONTROL_MCP_RECONNECT: {
        const name = args[0] as string;
        await this.#client.mcp.connect({
          server: name,
          ...at(this.#directory),
        });
        const listed = await this.#client.mcp.list(at(this.#directory));
        const status = listed.data.find((server) => server.name === name)
          ?.status.status;
        if (status !== "connected") {
          throw new Error(
            `MCP ${name} is not connected (${status ?? "missing"}).`
          );
        }
        return;
      }
      case CONTROL_MCP_TOGGLE: {
        const name = args[0] as string;
        const target = { server: name, ...at(this.#directory) };
        await (args[1]
          ? this.#client.mcp.connect(target)
          : this.#client.mcp.disconnect(target));
        return;
      }
      case CONTROL_MCP_FLEET_CHANGED:
        // Already taken by the fleet sync that came before this: a written
        // config restarts the server, and each session moves to the new one
        // once idle; every proxied server is added and connected again at
        // each live session's directory (opencode.ts `#syncFleet`).
        console.info(
          `[opencode] ${this.instanceId}: fleet MCP ${(args[0] as FleetMcpChange[]).map(({ name, kind }) => `${name} ${kind}`).join(", ")}: taken by the fleet sync`
        );
        return { taken: "fleet sync" };
      default:
        // An unsupported control verb is a silent no-op, never a user-facing
        // failure: the hub may send a verb this harness has none for.
        console.warn(`[opencode] no control verb ${method} — ignored`);
        return;
    }
  }

  /**
   * The credential the plugin stamps into each CawCo call, recorded by
   * OpenCode session id and acknowledged with itself: a session this agent
   * launched installs the one the hub minted for this spawn.
   */
  async #installCredential(credential: unknown) {
    if (typeof credential !== "string" || !credential) {
      throw new Error("Session credential is missing.");
    }
    await storeOpencodeCredential(
      this.#opencodeSessionId(),
      {
        credential,
        instanceId: this.instanceId,
        workspace: this.#ctx.workspace ?? null,
      },
      this.#liveSessions()
    );
    await acknowledgeSessionCredential(credential);
    return {
      installed: true,
      harness: "opencode",
      instanceId: this.instanceId,
    };
  }

  /** A session an earlier agent launched still holds its credential in the store the plugin reads. */
  async #verifyCredential(): Promise<{ credential: string }> {
    const credential = (await readOpencodeCredentials())[
      this.#opencodeSessionId()
    ]?.credential;
    if (!credential) {
      throw new Error("This OpenCode session holds no session credential.");
    }
    await acknowledgeSessionCredential(credential);
    console.info(`[opencode] held credential verified ${this.instanceId}`);
    return { credential };
  }

  #opencodeSessionId(): string {
    if (!this.sessionId) {
      throw new Error("This OpenCode session has no session id.");
    }
    return this.sessionId;
  }

  async interrupt(): Promise<void> {
    await this.#client.session.interrupt({
      sessionID: this.#opencodeSessionId(),
    });
  }

  /**
   * The provider refused this session's request at its account's usage
   * limit: the open turn is stopped now and closes on that refusal, so the
   * hub's at-limit decision runs at once instead of after OpenCode's retries.
   */
  async refuseAtLimit(error: string): Promise<void> {
    if (!this.#turnOpen || this.#limitRefusal) {
      return;
    }
    this.#limitRefusal = error;
    console.info(
      `[opencode] ${this.instanceId}: its account's usage limit refused the request; ending the turn on it`
    );
    await this.interrupt();
  }

  /**
   * Written into the session as synthetic input that starts no turn
   * (`resume: false`), under a mark {@link toTranscript} reads back as the
   * stop the live stream drew. Its words reach the model as context too, so
   * a later turn knows why the last one ended.
   */
  async noteStopped(words: string): Promise<void> {
    await this.#client.session.synthetic({
      sessionID: this.#opencodeSessionId(),
      id: messageId(),
      text: `CawCo stopped this session: it failed the same way ${REPEATED_FAILURE_LIMIT} times in a row, with nothing sent in between.\n\n${words}`,
      description: "CawCo stopped this session",
      metadata: { cawco: REPEATED_FAILURE, words },
      resume: false,
    });
  }

  /**
   * Each MCP server that did not connect when the session started, said once
   * per start: drawn on the live stream now, and written into the session as
   * synthetic input that starts no turn (`resume: false`) under the same id,
   * which {@link toTranscript} reads back as the same line and which reaches
   * the model with its next turn, so it knows those tools are not there.
   */
  async #sayUnconnected(unconnected: McpNotConnected[]): Promise<void> {
    const sessionID = this.#opencodeSessionId();
    for (const server of unconnected) {
      if (this.#mcpSaid.has(server.name)) {
        continue;
      }
      const id = messageId();
      const line = mcpNotConnectedLine(server.name, server.why);
      // biome-ignore lint/performance/noAwaitInLoops: one note per server, in the order the server listed them
      await this.#client.session.synthetic(
        {
          sessionID,
          id,
          text: line,
          description: `${server.name} didn't connect`,
          metadata: { cawco: MCP_NOT_CONNECTED, server: server.name, line },
          resume: false,
        },
        { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
      );
      console.warn(`[opencode] ${this.instanceId}: ${line}`);
      this.#ctx.frame({
        type: "system",
        subtype: MCP_NOT_CONNECTED,
        uuid: id,
        session_id: sessionID,
        timestamp: new Date().toISOString(),
        mcp_server: server.name,
        content: line,
      });
      this.#mcpSaid.add(server.name);
    }
  }

  async stop(): Promise<void> {
    this.#lifetime.abort();
    this.#onRelease();
    this.#turnOpen = false;
    this.#clearStallTimer();
    await this.#client.session
      .interrupt({ sessionID: this.#opencodeSessionId() })
      // biome-ignore lint/suspicious/noEmptyBlockStatements: stop() is tearing down regardless; the interrupt's own failure is not actionable
      .catch(() => {});
  }

  // biome-ignore lint/suspicious/useAwait: implements Harness.dispose's Promise<void> contract; this teardown is synchronous
  async dispose(): Promise<void> {
    this.#lifetime.abort();
    this.#onRelease();
  }
}
