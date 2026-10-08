/**
 * What one neutral frame means for a transcript: the rows it adds, the tool
 * results it folds into calls already drawn, and how it moves a subagent's
 * branch. Moved here from the dashboard's `frames.ts` unchanged in substance —
 * the same rules, the same block kinds — so the hub builds every session's
 * blocks once and every client renders them.
 *
 * Pure by design: it returns what a frame means and the builder
 * (`transcript.ts`) applies it.
 */

import { attachedFiles } from "./attachments";
import type {
  NeutralAssistantMessage,
  NeutralMessage,
  NeutralStatus,
  SendRecord,
  SessionMessage,
  SlashCommand,
  UserQuestionResult,
} from "./harness";
import { REPEATED_FAILURE, REPEATED_FAILURE_LIMIT } from "./harness";
import {
  parseDelegateAsk,
  parseHandoffMarker,
  parseReportMarker,
  parseWorkflowNotice,
} from "./injected";
import { parseRuleMarker } from "./rules";
import type {
  BlockMetadata,
  BlockType,
  ToolGlance,
  TranscriptBlock,
  TranscriptBranch,
} from "./transcript-types";

type AssistantBlock = NeutralAssistantMessage["message"]["content"][number];

/** A block's fields before its kind and words are known. */
export type BlockBase = Omit<TranscriptBlock, "type" | "content">;

/** A tool result to fold into the `tool.use` block that opened it. */
export interface ToolResult {
  images?: Array<{ mediaType: string; src: string }>;
  isError: boolean;
  /**
   * Reads as a background subagent's launch receipt ({@link subagentLaunch}).
   * It is one only when the call it answers started a subagent
   * ({@link spawnsSubagent}): a file that merely quotes the receipt's words
   * is an ordinary result.
   */
  launch?: boolean;
  /** The answer payload of an `AskUserQuestion`, normalised by the harness adapter. */
  questionResult?: UserQuestionResult;
  result: string;
  structuredContent?: Record<string, unknown>;
  toolId: string;
}

/**
 * How one frame moves a subagent branch. Branches are keyed by the Task
 * `tool_use_id`, which is what forwarded subagent messages carry as their
 * `parent_tool_use_id`; the `task_*` system messages that report progress carry
 * a `task_id` instead, so a branch remembers both.
 */
export interface BranchEvent {
  description?: string;
  lastToolName?: string;
  /** Requested alias from the spawn input, or the wire id an assistant frame answered with. */
  model?: string;
  result?: string;
  status?: TranscriptBranch["status"];
  subagentType?: string;
  /** `agentProgressSummaries`' present-tense line, when enabled. */
  summary?: string;
  taskId?: string;
  toolUseId?: string;
}

export interface FrameMapping {
  /**
   * The subagent branch `blocks` and `toolResults` belong to. Absent means the
   * main transcript.
   */
  agentId?: string;
  /**
   * Which kind of content block the main loop just opened, from the partials —
   * the only evidence there is of what the model is doing *while* it does it.
   * A `thinking` start covers the redacted variant too: it streams no deltas,
   * and a block whose reasoning is withheld is still a block being reasoned in.
   */
  blockStart?: "thinking" | "text" | "tool";
  /** The open block closed. */
  blockStop?: boolean;
  /** Appended to the transcript, in order. */
  blocks: TranscriptBlock[];
  /** A subagent branch's lifecycle, moved by this frame. */
  branch?: BranchEvent;
  /** The streaming buffer has been superseded by a final message. */
  clearsStream: boolean;
  /**
   * The whole `/` menu again, pushed when what is on disk changed mid-session.
   * The SDK sends the full list, so it replaces the cache rather than adding to
   * it — a skill that was deleted has to leave the menu too.
   */
  commands?: SlashCommand[];
  /** How a compaction ended, on the `status` frame that closes it. */
  compaction?: { result: "success" | "failed"; error?: string };
  /**
   * The cumulative cost a `result` frame reported, in dollars. Carried on every
   * result regardless of subtype, because only error results push a transcript
   * line and the session needs the number from a successful turn too.
   */
  cost?: number;
  /** The tool that just went in flight on the main loop. */
  currentTool?: ToolGlance;
  /** Text to append to the streaming buffer. */
  delta: string;
  /** The turn is over — the session is idle again. */
  endsTurn: boolean;
  /**
   * The turn the `result` frame closes answered with an error, whatever its
   * subtype claims. The SDK's own flag — not a reading of what was said.
   */
  failedTurn?: boolean;
  /** The subagents this message's calls start, one per call: a message can start several at once. */
  spawns: BranchEvent[];
  /**
   * What the session says it is doing right now: `compacting` while it rewrites
   * its own context, `requesting` while it waits on the model, `null` when it
   * has stopped saying. The only live word on a compaction — `compact_boundary`
   * arrives once the work is already done.
   */
  status?: NeutralStatus;
  /**
   * The SDK signing the open thinking block — its own word that the reasoning
   * is wrapping up, rather than a guess made from how long it has been going.
   */
  thinkingClosing?: boolean;
  /** Reasoning the open thinking block just streamed. */
  thinkingDelta?: string;
  toolResults: ToolResult[];
  /**
   * A tool call the model has started writing, before any frame carries its
   * input. The glance is empty on purpose: the arguments are still arriving a
   * token at a time, and the full assistant frame supersedes this with the real
   * one.
   */
  toolStarting?: ToolGlance;
}

/** `task_updated`'s wire statuses, in the vocabulary the branch card renders. */
const TASK_STATUS: Record<string, TranscriptBranch["status"]> = {
  pending: "starting",
  running: "running",
  paused: "running",
  completed: "complete",
  failed: "error",
  killed: "error",
};

/**
 * Message types (and `system` subtypes) with no transcript meaning. Rendering a
 * line for each one buries the conversation; everything outside this set still
 * degrades to a generic system line rather than disappearing silently.
 */
const QUIET = new Set([
  "tool_progress",
  "control_request_progress",
  "thinking_tokens",
  "session_state_changed",
  "background_tasks_changed",
  "files_persisted",
  "rate_limit_event",
  // MCP server auth plumbing — the MCP status panel shows failures.
  "auth_status",
]);

/**
 * Get a brief description/glance for a tool based on its input: the most
 * relevant parameter for quick identification.
 */
export function getToolGlance(
  input: Record<string, unknown> | undefined
): string {
  if (!input) {
    return "";
  }
  // File operations - show path (last 2 segments)
  if (input.file_path) {
    return String(input.file_path).split("/").slice(-2).join("/");
  }
  if (input.path) {
    return String(input.path).split("/").slice(-2).join("/");
  }
  // Bash - show command preview
  if (input.command) {
    const cmd = String(input.command);
    return cmd.length > 40 ? `${cmd.slice(0, 40)}...` : cmd;
  }
  // Search - show pattern
  if (input.pattern) {
    return `/${input.pattern}/`;
  }
  // Glob
  if (input.glob) {
    return String(input.glob);
  }
  // Task/Agent and other described calls — the only readable part of the input
  if (input.description) {
    return String(input.description);
  }
  return "";
}

/**
 * `model_fallback`: Claude Code took a model id it could not honour — every id
 * is accepted, and only the turn that follows says so — and names the one that
 * answered instead. The SDK does not type this message, so it is recognised by
 * its shape rather than by narrowing a union it is not in.
 */
const modelFallback = (sdk: {
  subtype: string;
}): { content: string; model: string } | null => {
  const frame = sdk as {
    subtype: string;
    content?: unknown;
    fallback_model?: unknown;
  };
  if (frame.subtype !== "model_fallback") {
    return null;
  }
  if (
    typeof frame.content !== "string" ||
    typeof frame.fallback_model !== "string"
  ) {
    return null;
  }
  return { content: frame.content, model: frame.fallback_model };
};

/**
 * What a partial says about the phase of the turn, beyond the text delta that
 * `NeutralStreamMessage` names — which is the whole of what the tail knows
 * about a session that is reasoning rather than writing.
 *
 * The evidence is already on the wire: the harness forwards its own frame whole
 * (`toNeutral`, packages/agent), so a block boundary and a thinking delta are
 * both there — the neutral type simply does not list them yet. So they are read
 * by shape rather than by narrowing a union they are not in, the way
 * `model_fallback` is above. The names are the SDK's own, checked against
 * 0.3.220's `BetaRawMessageStreamEvent`: a start event carries `content_block`
 * (not `block`), and the deltas are `thinking_delta` and `signature_delta`.
 *
 * `agentId` is the Task call a subagent's partials arrive under. A branch card
 * carries its own status, so the phase reported here is the main loop's alone.
 */
function streamPhase(
  event: { type: string; content_block?: unknown; delta?: unknown },
  agentId?: string
): Partial<FrameMapping> | null {
  if (agentId) {
    return null;
  }
  if (event.type === "content_block_stop") {
    return { blockStop: true };
  }

  if (event.type === "content_block_start") {
    if (
      typeof event.content_block !== "object" ||
      event.content_block === null
    ) {
      return null;
    }
    const block = event.content_block as {
      type?: unknown;
      id?: unknown;
      name?: unknown;
    };
    // Redacted reasoning streams no deltas at all, and is still reasoning.
    if (block.type === "thinking" || block.type === "redacted_thinking") {
      return { blockStart: "thinking" };
    }
    if (block.type === "text") {
      return { blockStart: "text" };
    }
    if (
      block.type === "tool_use" &&
      typeof block.id === "string" &&
      typeof block.name === "string"
    ) {
      return {
        blockStart: "tool",
        toolStarting: { toolId: block.id, name: block.name, glance: "" },
      };
    }
    return null;
  }

  if (event.type !== "content_block_delta") {
    return null;
  }
  if (typeof event.delta !== "object" || event.delta === null) {
    return null;
  }
  const delta = event.delta as { type?: unknown; thinking?: unknown };
  if (delta.type === "thinking_delta" && typeof delta.thinking === "string") {
    return { thinkingDelta: delta.thinking };
  }
  if (delta.type === "signature_delta") {
    return { thinkingClosing: true };
  }
  return null;
}

/** The fleet tools whose calls are shown as hand-offs rather than tool cards. */
const HANDOFF_TOOLS: Record<string, "handoff" | "start" | "delegate"> = {
  mcp__cawco__handoff: "handoff",
  mcp__cawco__start_session: "start",
  mcp__cawco__delegate: "delegate",
  // OpenCode uses a single underscore between the MCP server and tool names.
  cawco_handoff: "handoff",
  cawco_start_session: "start",
  cawco_delegate: "delegate",
  // pi registers the same tools under bare names (no MCP namespace).
  handoff: "handoff",
  start_session: "start",
  delegate: "delegate",
};

const empty = (): FrameMapping => ({
  blocks: [],
  spawns: [],
  toolResults: [],
  delta: "",
  clearsStream: false,
  endsTurn: false,
});

const uuidOf = (sdk: NeutralMessage): string | undefined =>
  "uuid" in sdk ? sdk.uuid : undefined;

/** An ISO time, or nothing when the text is no time at all. */
export const isoOf = (text: string | undefined): string | undefined => {
  if (!text) {
    return undefined;
  }
  const at = new Date(text);
  return Number.isNaN(at.getTime()) ? undefined : at.toISOString();
};

/**
 * When the harness stored the record a frame is, as the frame carries it —
 * the one clock its row shows, live and after a reload alike. A frame the
 * harness stores nothing for carries none, and its rows show none.
 */
const storedTime = (sdk: NeutralMessage): { timestamp?: string } => {
  const at =
    "timestamp" in sdk && typeof sdk.timestamp === "string"
      ? isoOf(sdk.timestamp)
      : undefined;
  return at ? { timestamp: at } : {};
};

const parentOf = (sdk: NeutralMessage): string | undefined =>
  "parent_tool_use_id" in sdk
    ? (sdk.parent_tool_use_id ?? undefined)
    : undefined;

/** Tool results arrive as text blocks far more often than as a plain string. */
function resultText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((block: unknown) =>
        typeof block === "object" && block !== null && "text" in block
          ? String(block.text)
          : ""
      )
      .filter(Boolean)
      .join("\n");
  }
  return content === undefined || content === null
    ? ""
    : JSON.stringify(content);
}

function resultParts(content: unknown): {
  text: string;
  images?: ToolResult["images"];
} {
  const images: NonNullable<ToolResult["images"]> = [];
  if (Array.isArray(content)) {
    for (const block of content) {
      // The hub hands images over as references to its media store; the
      // bytes are fetched when the picture is shown, not with the transcript.
      if (block.type === "image" && block.source.type === "url") {
        images.push({
          mediaType: block.source.media_type,
          src: block.source.url,
        });
      }
    }
  }
  return { text: resultText(content), ...(images.length ? { images } : {}) };
}

function blockOf(
  block: AssistantBlock,
  base: BlockBase
): TranscriptBlock | null {
  switch (block.type) {
    case "text":
      return { ...base, type: "assistant", content: block.text };
    case "thinking":
      // Signature-only blocks carry no reasoning to show.
      if (!block.thinking) {
        return null;
      }
      return {
        ...base,
        type: "thinking",
        content: block.thinking,
        metadata: {
          thinking: block.thinking,
          thinkingSignature: block.signature,
        },
      };
    case "redacted_thinking":
      return {
        ...base,
        type: "thinking",
        content: "",
        metadata: { isRedactedThinking: true },
      };
    case "tool_use": {
      // A hand-off is not a tool call to read like the others: it is this
      // session addressing another one, and the sender needs to see that it
      // left. Recognised by the tool's name — structured, not by its text.
      const handoff = HANDOFF_TOOLS[block.name];
      if (handoff) {
        const input = (block.input ?? {}) as {
          target?: unknown;
          cwd?: unknown;
          prompt?: unknown;
        };
        return {
          ...base,
          type: "tool.handoff",
          content: String(input.target ?? input.cwd ?? ""),
          toolCallId: block.id,
          metadata: {
            toolId: block.id,
            toolName: block.name,
            toolInput: block.input,
            toolStatus: "pending",
            handoffKind: handoff,
            handoffBrief: String(
              input.prompt ??
                (block.input as { message?: unknown }).message ??
                ""
            ),
          },
        };
      }
      const spawn = subagentSpawn(block.input);
      return {
        ...base,
        type: "tool.use",
        content: block.name,
        toolCallId: block.id,
        metadata: {
          toolId: block.id,
          toolName: block.name,
          toolInput: block.input,
          toolStatus: "pending",
          subagentType: spawn?.subagentType,
          subagentDescription: spawn?.description,
          subagentModel: spawn?.model,
        },
      };
    }
    default:
      return null;
  }
}

/**
 * A tool call that spawns a subagent, recognised by its input rather than by the
 * tool's name — the same call is the Task tool and the Agent tool depending on
 * the session's tool set.
 */
function subagentSpawn(
  input: unknown
): { subagentType: string; description?: string; model?: string } | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }
  const {
    subagent_type: type,
    description,
    model,
  } = input as Record<string, unknown>;
  if (typeof type !== "string") {
    return null;
  }
  return {
    subagentType: type,
    description: typeof description === "string" ? description : undefined,
    model: typeof model === "string" ? model : undefined,
  };
}

/**
 * An async subagent launch's `tool_result`: the SDK's own bookkeeping for a Task
 * it started in the background — an agentId, an output file, and a paragraph
 * telling the model not to quote either. It answers the Task call without being
 * the subagent's report, so folding it the ordinary way made the metadata the
 * branch's `result`, which the card then printed word for word. Recognised the
 * way {@link systemNote} recognises local-command scaffolding: by the opening
 * the SDK writes, or by the id/file pair a re-worded launch still carries.
 */
function subagentLaunch(result: string): boolean {
  const head = result.trimStart().slice(0, 200);
  if (head.startsWith("Async agent launched")) {
    return true;
  }
  if (head.startsWith("(This tool result is internal metadata")) {
    return true;
  }
  return result.includes("agentId:") && result.includes("output_file:");
}

/**
 * opencode's `task` result as its model reads it: the subagent's answer
 * inside a tag naming the session it ran in. Matched whole, so a result that
 * only mentions the tag is left as written.
 */
const TASK_RESULT =
  /^\s*<task id="[^"]*" state="[^"]*">\s*<task_result>\n?([\s\S]*?)\n?<\/task_result>\s*<\/task>\s*$/;

/** A subagent's answer, out of the wrapper its harness hands the model. */
const subagentAnswer = (text: string): string =>
  TASK_RESULT.exec(text)?.[1] ?? text;

/** The calls that start a subagent: Claude's `Task` and `Agent`, opencode's `task`. */
const SUBAGENT_CALLS = new Set(["Task", "Agent", "task"]);

/**
 * Whether the call `toolId` in `blocks` started a subagent: one of the calls
 * that do, or any call whose input names the subagent's type. A launch
 * receipt answering it is not a report: the branch moves to running and the
 * receipt reaches no `result`, block or card.
 */
export function spawnsSubagent(
  blocks: TranscriptBlock[],
  toolId: string
): boolean {
  const call = blocks.findLast(
    (block) =>
      (block.type === "tool.use" || block.type === "tool.handoff") &&
      block.metadata?.toolId === toolId
  );
  const input = call?.metadata?.toolInput;
  return (
    SUBAGENT_CALLS.has(call?.metadata?.toolName ?? "") ||
    (typeof input === "object" &&
      input !== null &&
      !Array.isArray(input) &&
      typeof (input as Record<string, unknown>).subagent_type === "string")
  );
}

/** What a task line says happened: it ended well, it ended badly, or it reported. */
const taskVerb = (status: string | null | undefined): string => {
  if (!status) {
    return "task update";
  }
  return status === "completed" ? "task done" : "task failed";
};

function systemLine(
  base: BlockBase,
  type: BlockType,
  content: string,
  metadata?: BlockMetadata
): TranscriptBlock {
  return { ...base, type, content, metadata };
}

/**
 * The generic line for a frame no case names, keyed by what it says it is (its
 * `type`, its `system` subtype, or a raw frame's inner type). The one place
 * {@link QUIET} is read, so a quiet kind stays quiet however it arrives — typed
 * live, or stored as `raw` by a daemon whose normalizer predated it.
 */
function unnamedLine(
  mapping: FrameMapping,
  kind: string,
  line: () => TranscriptBlock
): void {
  if (!QUIET.has(kind)) {
    mapping.blocks.push(line());
  }
}

/** A task summary folded into the ~200-char line metadata. */
const TASK_SUMMARY_LIMIT = 200;
function truncateSummary(summary: string | undefined): string {
  if (!summary) {
    return "";
  }
  return summary.length > TASK_SUMMARY_LIMIT
    ? `${summary.slice(0, TASK_SUMMARY_LIMIT)}…`
    : summary;
}

/**
 * What one neutral frame does to a transcript. `fallbackId` names the blocks
 * of a frame that carries no uuid of its own: the stored entry's uuid on a
 * history read, a hash of the frame live — so the same frame is the same
 * block wherever it is read.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one switch over every SDK message subtype, each case self-contained
export function mapFrame(
  instanceId: string,
  sdk: NeutralMessage,
  fallbackId: () => string
): FrameMapping {
  const mapping = empty();
  const uuid = uuidOf(sdk);
  // `forwardSubagentText` forwards a subagent's own turns with their
  // `parent_tool_use_id` set to the Task call that spawned them, so this is the
  // attribution the tree is built from — not `parent_agent_id`, which only ever
  // names a *grandparent* and is always null at the SDK's depth cap of 1.
  const agentId = parentOf(sdk);
  mapping.agentId = agentId;
  // Partials never draw a row, and are the one frame kind there is a lot of.
  if (sdk.type === "stream_event") {
    const { event } = sdk;
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      mapping.delta = event.delta.text;
    } else if (event.type === "message_stop") {
      mapping.clearsStream = true;
    }
    const phase = streamPhase(event, agentId);
    if (phase) {
      Object.assign(mapping, phase);
    }
    return mapping;
  }
  const base: BlockBase = {
    id: uuid ?? fallbackId(),
    instanceId,
    ...storedTime(sdk),
    ...(uuid ? { sdkUuid: uuid } : {}),
    ...(agentId ? { parentToolUseId: agentId } : {}),
  };

  switch (sdk.type) {
    case "assistant": {
      // An error the harness wrote in the model's place, which failed the
      // sends it answered: their rows carry its words (`failedSends`).
      if (sdk.failedSends?.length) {
        mapping.clearsStream = true;
        break;
      }
      // A compaction's summary in the assistant's role (opencode): the note,
      // under the message's own id, as a stored read draws it.
      if (sdk.compactSummary) {
        const brief = transcriptUserText(sdk.message);
        if (brief) {
          mapping.blocks.push(compactSummaryNote(brief, base));
        }
        mapping.clearsStream = true;
        break;
      }
      sdk.message.content.forEach((block, index) => {
        const made = blockOf(block, {
          ...base,
          id: `${base.id}:${(sdk.contentOffset ?? 0) + index}`,
        });
        if (made) {
          mapping.blocks.push(made);
        }
        if (block.type !== "tool_use" || agentId) {
          return;
        }
        mapping.currentTool = {
          toolId: block.id,
          name: block.name,
          glance: getToolGlance(block.input as Record<string, unknown>),
        };
        const spawn = subagentSpawn(block.input);
        if (spawn) {
          mapping.spawns.push({
            toolUseId: block.id,
            ...spawn,
            status: "starting",
          });
        }
      });
      // The forwarded frame names the model that actually answered — ground truth
      // over whatever alias the spawn input asked for.
      if (agentId && typeof sdk.message.model === "string") {
        mapping.branch = { toolUseId: agentId, model: sdk.message.model };
      }
      // The final message supersedes whatever the partials painted.
      mapping.clearsStream = true;
      break;
    }

    case "user": {
      const { content } = sdk.message;
      const text = transcriptUserText(sdk.message);
      // A compaction's summary the harness reported in the user's role (pi).
      if (sdk.compactSummary && text) {
        mapping.blocks.push(compactSummaryNote(text, base));
        break;
      }
      // A message sent to the session is not a frame at all: it is its
      // record's (`send` frames). The harness speaking in the user's role: its
      // line for a turn cut short, a subagent's prompt, or its own notice.
      // Anything else of the main loop's is not a row.
      if (!agentId && interruptLine(text)) {
        mapping.blocks.push({
          ...base,
          type: "ui.interrupted",
          content: "Interrupted",
          metadata: { noteTitle: "Interrupted" },
        });
      } else if (text && (agentId || systemNote(text))) {
        mapping.blocks.push({
          ...base,
          ...userBody(text, transcriptUserImages(sdk.message)),
        });
      }
      if (typeof content === "string") {
        break;
      }
      for (const block of content) {
        if (block.type !== "tool_result") {
          continue;
        }
        const { text: resultBody, images } = resultParts(block.content);
        mapping.toolResults.push({
          toolId: block.tool_use_id,
          result: subagentAnswer(resultBody),
          ...(subagentLaunch(resultBody) ? { launch: true } : {}),
          ...(images ? { images } : {}),
          isError: block.is_error === true,
          structuredContent: block.structuredContent,
          questionResult: block.questionResult,
        });
      }
      break;
    }

    case "result": {
      mapping.clearsStream = true;
      mapping.endsTurn = true;
      // `subtype` is how the *run* ended; `is_error` is whether the turn did.
      // They disagree: a machine with no credentials answers "Not logged in"
      // and closes with `subtype: 'success', is_error: true` — measured on a
      // real one. Reading only the subtype makes that a normal turn, which is
      // what left the failure to be recognised by its prose.
      mapping.failedTurn = sdk.is_error === true;
      // Cost rides every result, not just the error line — a successful turn
      // is the common one, and it reports cost too. `total_cost_usd` is
      // cumulative, so the session overwrites rather than accumulates.
      mapping.cost = sdk.total_cost_usd;
      // An error that failed the sends it closed on is said on their rows,
      // which carry it live and after a reload alike (`failedSends`).
      if (sdk.subtype === "success" || sdk.failedSends?.length) {
        break;
      }
      mapping.blocks.push(
        systemLine(base, "result.error", sdk.subtype.replace(/_/g, " "), {
          resultSubtype: sdk.subtype,
          resultErrors: "errors" in sdk ? sdk.errors : undefined,
          totalCost: sdk.total_cost_usd,
          numTurns: sdk.num_turns,
        })
      );
      break;
    }

    case "system": {
      const fallback = modelFallback(sdk);
      if (fallback) {
        mapping.blocks.push(
          systemLine(base, "system.model_fallback", fallback.content, {
            subtype: "model_fallback",
            model: fallback.model,
          })
        );
        break;
      }
      switch (sdk.subtype) {
        case "init":
          mapping.blocks.push(
            systemLine(base, "system.init", `Session started · ${sdk.model}`, {
              subtype: "init",
              model: sdk.model,
              permissionMode: sdk.permissionMode,
              cwd: sdk.cwd,
              sessionId: sdk.session_id,
              // Re-listed every turn, and the only source of which of them are
              // skills — `supportedCommands` describes the commands but does
              // not say where any of them came from.
              slashCommands: sdk.slash_commands,
              skills: sdk.skills,
              // The `/` palette's servers and tools. Claude lists both on
              // every `init`; a harness that lists no tools announces neither.
              tooling: sdk.tools
                ? {
                    servers: (sdk.mcp_servers ?? []).map(
                      ({ name, status }) => ({ name, status })
                    ),
                    tools: sdk.tools,
                  }
                : undefined,
            })
          );
          break;
        case "commands_changed":
          mapping.commands = sdk.commands;
          break;
        case "status":
          mapping.status = sdk.status as NeutralStatus | undefined;
          if (sdk.compact_result) {
            mapping.compaction = {
              result: sdk.compact_result,
              error: sdk.compact_error,
            };
          }
          break;
        case "task_started":
          // `subagent_type` is what separates a real Task/Agent subagent's frames
          // from a plain tool task's: the SDK sets it only for the former
          // (measured 0.3.220 — `local_bash` carries none, `local_agent` carries
          // 'general-purpose'). A plain command's `task_started` must not mint a
          // branch: its `tool.use`/`tool.result` pair already renders the call.
          if (sdk.subagent_type) {
            mapping.branch = {
              toolUseId: sdk.tool_use_id,
              taskId: sdk.task_id,
              subagentType: sdk.subagent_type,
              description: sdk.description,
              status: "running",
            };
          }
          break;
        case "task_progress":
          if (sdk.subagent_type) {
            mapping.branch = {
              toolUseId: sdk.tool_use_id,
              taskId: sdk.task_id,
              subagentType: sdk.subagent_type,
              description: sdk.description,
              status: "running",
              summary: sdk.summary,
              lastToolName: sdk.last_tool_name,
            };
          }
          break;
        case "task_notification": {
          const done = sdk.status === "completed";
          // `task_notification` carries no `subagent_type` at all, so a plain
          // tool task and a real subagent look identical here — only a branch
          // that already exists tells them apart, which is `applyBranchEvent`'s
          // call. The line is ALWAYS emitted here and dropped by
          // `suppressesTaskLine` when a real subagent's branch owns it: for a
          // background Bash this line is the only place its completion shows.
          //
          // The notification that ends a task carries its status, and is keyed
          // by the task: the live frame and the stored copy a reload reads
          // back carry different uuids, and the line has to be the same row
          // either way. A watcher's event (a Monitor's) carries no status and
          // comes any number of times per task; it is stored only, so its
          // record's own uuid names it.
          mapping.blocks.push(
            systemLine(
              sdk.status ? { ...base, id: `task:${sdk.task_id}` } : base,
              "system.task",
              taskVerb(sdk.status),
              { result: truncateSummary(sdk.summary) }
            )
          );
          if (sdk.status) {
            mapping.branch = {
              toolUseId: sdk.tool_use_id,
              taskId: sdk.task_id,
              status: done ? "complete" : "error",
              summary: sdk.summary,
              result: sdk.result ?? sdk.summary,
            };
          }
          break;
        }
        case "task_updated": {
          const { patch } = sdk;
          mapping.branch = {
            taskId: sdk.task_id,
            description: patch?.description,
            status: patch?.status ? TASK_STATUS[patch.status] : undefined,
            summary: patch?.error,
          };
          break;
        }
        case "compact_boundary":
          mapping.blocks.push(
            systemLine(base, "system.compact_boundary", "Compacted", {
              subtype: "compact_boundary",
              preTokens: sdk.compact_metadata?.pre_tokens,
              trigger: sdk.compact_metadata?.trigger,
              compactResult: sdk.compact_metadata?.result,
              compactError: sdk.compact_metadata?.error,
            })
          );
          break;
        // A session-start hook that failed: the one hook frame a transcript
        // draws, live and read back alike (its output when it works is startup
        // noise the harness never stores). What it said is behind the line.
        case "hook_response":
          mapping.blocks.push(
            systemLine(
              base,
              "ui.system_note",
              (sdk.stderr || sdk.stdout || "").trim(),
              {
                noteKind: "Hook failed",
                noteTitle: `${sdk.hook_name} hook failed (exit ${sdk.exit_code})`,
                hookName: sdk.hook_name,
                exitCode: sdk.exit_code,
              }
            )
          );
          break;
        // The agent stopped a session failing the same way again and again
        // with nobody sending: a failure card, titled by the stop, with the
        // failure's own words under it.
        case REPEATED_FAILURE:
          mapping.blocks.push(
            systemLine(base, "ui.error", sdk.content ?? "", {
              subtype: REPEATED_FAILURE,
              errorTitle: `Stopped after the same failure ${REPEATED_FAILURE_LIMIT} times in a row`,
            })
          );
          break;
        case "permission_denied": {
          // The SDK short-circuited a tool call without ever surfacing a
          // `canUseTool` ask — a sandbox override in bypass mode, a deny rule,
          // an auto-mode classifier. Nothing else renders it, so name the tool
          // and the deciding component's own reason rather than hiding it behind
          // the generic `system.permission_denied` line.
          const denied = sdk as {
            tool_name?: string;
            decision_reason_type?: string;
            decision_reason?: string;
            message?: string;
          };
          const tool = denied.tool_name ?? "a tool";
          const reason =
            denied.decision_reason ?? denied.message ?? "no reason given";
          const reasonType = denied.decision_reason_type
            ? ` (${denied.decision_reason_type})`
            : "";
          mapping.blocks.push(
            systemLine(
              base,
              "ui.system_note",
              `The SDK denied ${tool} without asking${reasonType}: ${reason}`,
              {
                subtype: "permission_denied",
                noteKind: "Permission denied",
                noteTitle: tool,
              }
            )
          );
          break;
        }
        default:
          // A subtype this switch does not name still says what it came to
          // say: harnesses put their own words in `content` (a provider's
          // retry notice, a quota message), and losing them here is how a
          // real error once hid behind a generic label.
          unnamedLine(mapping, sdk.subtype, () =>
            systemLine(
              base,
              `system.${sdk.subtype}`,
              sdk.content ?? sdk.subtype.replace(/_/g, " "),
              { subtype: sdk.subtype }
            )
          );
      }
      break;
    }

    default:
      // The daemon wraps an SDK message type its normalizer predates as
      // `type: 'raw'` with the original riding along. A line that says "raw"
      // tells the operator nothing — the INNER message's own type at least
      // names what arrived, and any words it carries are shown behind a fold
      // rather than lost.
      if ((sdk.type as string) === "raw") {
        const inner = (
          sdk as unknown as {
            message?: { type?: unknown; content?: unknown; message?: unknown };
          }
        ).message;
        const innerType = typeof inner?.type === "string" ? inner.type : "";
        const text = [inner?.content, inner?.message].find(
          (value): value is string => typeof value === "string"
        );
        if (!(innerType || text)) {
          break;
        }
        unnamedLine(mapping, innerType, () =>
          systemLine(base, "ui.system_note", text ?? "", {
            noteKind: "Unrecognised frame",
            noteTitle: (innerType || "unrecognised frame").replace(/_/g, " "),
          })
        );
        break;
      }
      unnamedLine(mapping, sdk.type, () =>
        systemLine(base, `system.${sdk.type}`, sdk.type.replace(/_/g, " "))
      );
  }

  return mapping;
}

/**
 * The branch a subagent's blocks belong to, created on first sight.
 */
export function branchFor(
  branches: Map<string, BranchState>,
  instanceId: string,
  toolUseId: string,
  now: string
): BranchState {
  const existing = branches.get(toolUseId);
  if (existing) {
    return existing;
  }
  const created: BranchState = {
    toolUseId,
    instanceId,
    subagentType: "subagent",
    status: "starting",
    startedAt: now,
    blocks: [],
  };
  branches.set(toolUseId, created);
  return created;
}

/** A branch as the builder keeps it: its state, and its own blocks. */
export type BranchState = TranscriptBranch & { blocks: TranscriptBlock[] };

/**
 * Folds a frame's branch event into the session's subagent branches. Returns
 * the branch it moved, or null when it moved none.
 */
export function applyBranchEvent(
  branches: Map<string, BranchState>,
  instanceId: string,
  event: BranchEvent,
  now: string
): BranchState | null {
  // `task_updated` names only the task, so an already-known branch answers for it.
  const key =
    event.toolUseId ??
    [...branches.values()].find((row) => row.taskId === event.taskId)
      ?.toolUseId;
  if (!key) {
    return null;
  }

  // A terminal-status event that names no existing branch and carries no real
  // `subagent_type` is a plain tool task's `task_notification` (a foreground or
  // background Bash). Minting a branch for it is the bug that turned a command
  // into a generic "subagent" card — its tool card already tells that story, so
  // nothing is created here.
  const existing = branches.get(key);
  const terminal = event.status === "complete" || event.status === "error";
  if (!(existing || event.subagentType) && terminal) {
    return null;
  }

  const branch = branchFor(branches, instanceId, key, now);
  branch.lastEventAt = now;
  if (event.taskId) {
    branch.taskId = event.taskId;
  }
  if (event.subagentType) {
    branch.subagentType = event.subagentType;
  }
  if (event.description) {
    branch.description = event.description;
  }
  if (event.summary) {
    branch.summary = event.summary;
  }
  if (event.lastToolName) {
    branch.lastToolName = event.lastToolName;
  }
  if (event.model) {
    branch.model = event.model;
  }
  if (event.result) {
    branch.result = event.result;
  }
  // Finished is final. A branch that has reported `complete` or `error` is done,
  // and the progress frames still in flight behind it would otherwise put it
  // back to `running` — leaving every subagent reading "working" forever, long
  // after it answered.
  const settled = branch.status === "complete" || branch.status === "error";
  // A late `starting` must not walk a running branch backwards.
  if (
    event.status &&
    !settled &&
    !(event.status === "starting" && branch.status !== "starting")
  ) {
    branch.status = event.status;
    if (event.status === "complete" || event.status === "error") {
      branch.completedAt = now;
    }
  }
  return branch;
}

/**
 * Whether a `system.task` line must be dropped: it reports a `tool_use_id` whose
 * branch already exists, so the branch card owns that task's completion — the
 * "task done" pill is a stray for a real subagent. A plain tool task mints no
 * branch (see `applyBranchEvent`); its line stays when the task ran in the
 * background, and goes when it ran in the foreground — its call is still
 * waiting on the result that closes it, and the CLI stores no notification
 * for it, so a reload has no line to draw (measured 0.3.280: a foreground
 * task's `task_notification` arrives just before its `tool_result`, a
 * background one's long after the placeholder result). The branch key comes
 * from the mapping's branch event, not the block: `mapFrame` is stateless and
 * the block itself carries no `tool_use_id`.
 */
export function suppressesTaskLine(
  branches: Map<string, BranchState>,
  blocks: TranscriptBlock[],
  block: TranscriptBlock,
  toolUseId: string | undefined
): boolean {
  if (!(block.type === "system.task" && toolUseId)) {
    return false;
  }
  if (branches.has(toolUseId)) {
    return true;
  }
  const call = blocks.findLast(
    (m) =>
      (m.type === "tool.use" || m.type === "tool.handoff") &&
      m.metadata?.toolId === toolUseId
  );
  return call?.metadata?.toolStatus === "pending";
}

/**
 * Claude Code's own line for a turn the operator cut short, which it writes
 * in the user's role, live and to the transcript — the harness's word, never
 * the reader's. Two forms, and only these across every stored transcript on
 * this machine (CLI 2.1.280): a turn stopped while the model wrote, and one
 * stopped while a tool ran.
 */
const INTERRUPTED = /^\[Request interrupted by user(?: for tool use)?\]$/;

/** Whether a user-role text is that line ({@link INTERRUPTED}). */
export function interruptLine(text: string | null): boolean {
  return text !== null && INTERRUPTED.test(text.trim());
}

/**
 * The words of a user-role message: a send's body, or a stored user entry.
 */
export function transcriptUserText(message: unknown): string | null {
  if (typeof message !== "object" || message === null) {
    return null;
  }
  const { content } = message as { content?: unknown };
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return null;
  }
  const text = content
    .filter((block: unknown) => (block as { type?: string }).type === "text")
    .map((block: unknown) => String((block as { text?: unknown }).text ?? ""))
    .join("\n");
  return text || null;
}

/**
 * The images a user turn carried, as the hub's media references — the bubble
 * shows what was actually sent, loading the bytes only when it is on screen.
 */
function transcriptUserImages(message: unknown): BlockMetadata["images"] {
  const content = (message as { content?: unknown } | null)?.content;
  if (!Array.isArray(content)) {
    return undefined;
  }
  const images = content
    .filter((block: unknown) => (block as { type?: string }).type === "image")
    .map((block: unknown) => {
      const { source } = block as {
        source?: { media_type?: string; url?: string };
      };
      return {
        mediaType: source?.media_type ?? "image/png",
        src: source?.url,
      };
    });
  return images.length ? images : undefined;
}

/**
 * When a stored entry was written (`SessionMessage.timestamp`, the harness's
 * record) — the only honest clock a replayed transcript has. `undefined` when
 * the entry carries none (one the hub built itself) or it is unparseable,
 * because the alternative is dating the turn to the moment it was read.
 */
export const storedAt = (entry: SessionMessage): string | undefined =>
  isoOf(entry.timestamp);

/**
 * What a user-role message renders as. Both the live and the stored path build
 * their user blocks from this, so the harness's own voice is never mistaken
 * for the human's on one of them.
 */
function userBody(
  text: string,
  images?: BlockMetadata["images"]
): Pick<TranscriptBlock, "type" | "content" | "metadata"> {
  const note = systemNote(text);
  if (!note) {
    const { typed, attachments } = pastedText(text);
    return {
      type: "user",
      content: typed,
      metadata:
        images || attachments
          ? {
              ...(images ? { images } : {}),
              ...(attachments ? { attachments } : {}),
            }
          : undefined,
    };
  }
  return {
    type: "ui.system_note",
    content: text,
    metadata: {
      noteKind: note.kind,
      noteTitle: note.title,
      ...(note.taskToolId ? { noteTaskToolId: note.taskToolId } : {}),
    },
  };
}

/**
 * A file the reader attached, as every harness folds it into the prompt
 * (`\n\n<pasted-text name="…">\n…\n</pasted-text>`, claude.ts / opencode.ts /
 * pi.ts). OpenCode stores it as its own text part, which the stored read joins
 * back on a newline, so any run of newlines before it belongs to it.
 */
const PASTED_TEXT =
  /\n*<pasted-text name="([^"\n]*)">\n([\s\S]*?)\n<\/pasted-text>/g;

/**
 * A user turn split back into what the reader typed and the files they
 * attached to it. A block that does not close stays in the text as written.
 */
function pastedText(text: string): {
  typed: string;
  attachments?: NonNullable<BlockMetadata["attachments"]>;
} {
  const texts = Array.from(text.matchAll(PASTED_TEXT), (match) => ({
    kind: "text" as const,
    name: match[1],
    content: match[2],
  }));
  const { typed, files = [] } = attachedFiles(
    texts.length ? text.replace(PASTED_TEXT, "").trimEnd() : text
  );
  const attachments = [...texts, ...files];
  return attachments.length ? { typed, attachments } : { typed };
}

const TASK_NOTIFICATION_SUMMARY = /<summary>([\s\S]*?)<\/summary>/;
const TASK_NOTIFICATION_TOOL_USE_ID = /<tool-use-id>(\S+?)<\/tool-use-id>/;
const LOCAL_COMMAND_NAME = /<command-name>([\s\S]*?)<\/command-name>/;

/** Harness-injected content arrives with role "user" but is not the human. */
function systemNote(
  text: string
): { kind: string; title: string; taskToolId?: string } | null {
  const head = text.trimStart().slice(0, 200);
  // Anchored, not `includes`: an operator who merely TYPES the tag mid-sentence
  // ("fix the <task-notification> renderer") must keep their own voice — only a
  // message the block itself opens is the harness speaking.
  if (
    head.startsWith("[SYSTEM NOTIFICATION") ||
    head.startsWith("<task-notification>")
  ) {
    const summary = TASK_NOTIFICATION_SUMMARY.exec(text)?.[1]?.trim();
    // The tool-use id names the Task call this notification echoes. When that
    // call's branch is in the transcript, the branch already shows the same
    // report — the renderer folds this note away on it.
    const taskToolId = TASK_NOTIFICATION_TOOL_USE_ID.exec(text)?.[1];
    return {
      kind: "Task notification",
      title: summary ?? firstPlainLine(text),
      ...(taskToolId ? { taskToolId } : {}),
    };
  }
  // A slash command's local echo (`<local-command-caveat>`, `<command-name>`,
  // `<local-command-stdout>`): the harness's bookkeeping, not the human's words
  // — raw XML in a user bubble otherwise.
  if (
    head.startsWith("<local-command-caveat>") ||
    head.startsWith("<command-name>") ||
    head.startsWith("<local-command-stdout>")
  ) {
    const command = LOCAL_COMMAND_NAME.exec(text)?.[1]?.trim();
    return { kind: "Local command", title: command ?? firstPlainLine(text) };
  }
  if (head.startsWith("<system-reminder>")) {
    return { kind: "System reminder", title: firstPlainLine(text) };
  }
  if (
    head.startsWith(
      "This session is being continued from a previous conversation"
    )
  ) {
    return COMPACT_SUMMARY;
  }
  return null;
}

/**
 * The `noteKind` of a compaction's summary: the text the harness condensed the
 * conversation before it into. One kind for every harness, so a client draws a
 * compaction the same way wherever it was reported.
 */
export const COMPACT_SUMMARY_KIND = "Session continued";

const COMPACT_SUMMARY = {
  kind: COMPACT_SUMMARY_KIND,
  title: "Compaction summary",
};

/**
 * A stored entry its harness marked as a compaction summary
 * (`SessionMessage.compactSummary`), as the note Claude's own summary makes
 * live: pi stores it in the user's role and opencode in the assistant's, and
 * neither opens with the words {@link systemNote} knows Claude's by.
 */
export function compactSummaryRow(
  entry: SessionMessage,
  base: BlockBase
): TranscriptBlock {
  return compactSummaryNote(transcriptUserText(entry.message) ?? "", base);
}

/** A compaction's summary as its note, from the words alone. */
function compactSummaryNote(content: string, base: BlockBase): TranscriptBlock {
  return {
    ...base,
    type: "ui.system_note",
    content,
    metadata: {
      noteKind: COMPACT_SUMMARY.kind,
      noteTitle: COMPACT_SUMMARY.title,
    },
  };
}

/** A note's opening line, with the markup that wraps it taken back out. */
function firstPlainLine(text: string): string {
  const plain = text
    .replace(/<[^>]+>/g, "")
    .replace("[SYSTEM NOTIFICATION - NOT USER INPUT]", "");
  const line = plain
    .split("\n")
    .map((each) => each.trim())
    .find(Boolean);
  if (!line) {
    return "";
  }
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

/**
 * What an entry that opens a main-loop turn said, and null for everything else —
 * including the user-role entries that carry nothing but a tool result, and the
 * harness's line closing a turn it was stopped in ({@link interruptLine}).
 * A turn that was nothing but an image still opened one.
 */
export function turnStart(
  entry: SessionMessage
): { text: string; images?: BlockMetadata["images"] } | null {
  if (entry.type !== "user" || entry.parent_tool_use_id) {
    return null;
  }
  const text = transcriptUserText(entry.message);
  const images = transcriptUserImages(entry.message);
  if ((text === null && !images) || interruptLine(text)) {
    return null;
  }
  return { text: text ?? "", images };
}

/**
 * A message cawco put into the session on someone else's behalf, read off
 * the marker line it opens with (`injected.ts` builds and parses every one).
 * This is the one classification the live stream, a mid-turn delivery and a
 * stored transcript share, so each renders the same row. Null for text with no
 * marker: the reader's own words.
 */
function injectedBlock(text: string, base: BlockBase): TranscriptBlock | null {
  const rule = parseRuleMarker(text);
  if (rule) {
    return {
      ...base,
      type: "user.rule",
      content: rule.body,
      metadata: { ruleName: rule.name },
    };
  }
  const ask = parseDelegateAsk(text);
  if (ask) {
    return {
      ...base,
      type: "user.delegate_ask",
      content: ask.body,
      metadata: {
        peerSession: ask.instance,
        askRequestId: ask.request,
        askLabel: ask.label,
      },
    };
  }
  // Only the short id survives storage; consumers pair it with the delegate's
  // full id by prefix.
  const report = parseReportMarker(text);
  if (report) {
    return {
      ...base,
      type: "user.peer",
      content: report.body,
      metadata: {
        peerName: `${report.name}#${report.short}`,
        peerSession: report.short,
        reportKind: report.failed ? "failed" : "report",
      },
    };
  }
  const notice = parseWorkflowNotice(text);
  if (notice) {
    return {
      ...base,
      type: "user.peer",
      content: notice.body,
      metadata: { peerName: notice.workflow, workflowEvent: notice.event },
    };
  }
  const handoff = parseHandoffMarker(text);
  if (handoff) {
    return {
      ...base,
      type: "user.peer",
      content: handoff.body,
      metadata: { peerName: handoff.from },
    };
  }
  return null;
}

/**
 * A message sent to the session, as a row: cawco's own (a rule, a hand-off,
 * a delegate's report or ask) by its marker line, anything else as the
 * reader's words. A send's record and a stored user turn the hub has no
 * record for both come through here.
 */
export function sentRow(
  text: string,
  message: unknown,
  base: BlockBase
): TranscriptBlock {
  return (
    injectedBlock(text, base) ?? {
      ...base,
      ...userBody(text, transcriptUserImages(message)),
    }
  );
}

/** Folds a tool result into the `tool.use` it answers; returns the block it changed. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one dispatch over every tool-result shape a `tool.use` can be answered by
export function applyToolResult(
  blocks: TranscriptBlock[],
  {
    toolId,
    result,
    images,
    isError,
    structuredContent,
    questionResult,
  }: ToolResult
): TranscriptBlock | null {
  // `tool.handoff` is a tool call too — it just renders as a receipt. Matching
  // only `tool.use` left it stuck on "sending…" with the answer never applied.
  const target = blocks.find(
    (m) =>
      (m.type === "tool.use" || m.type === "tool.handoff") &&
      m.metadata?.toolId === toolId
  );
  if (!target) {
    return null;
  }

  let delegateInstanceId: string | undefined;
  let delegateTitle: string | undefined;
  // The routing payload may live in result JSON while structuredContent contains
  // only OpenCode transport metadata. Explicit structured fields take precedence.
  let sc = structuredContent;
  if (target.type === "tool.handoff" && typeof result === "string") {
    try {
      const parsed: unknown = JSON.parse(result);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        sc = { ...(parsed as Record<string, unknown>), ...structuredContent };
      }
    } catch {
      // Most tool results are not JSON; there is no structured payload to read.
    }
  }
  if (target.type === "tool.handoff" && !isError && sc) {
    if (
      target.metadata?.handoffKind === "delegate" &&
      typeof sc.delegateInstanceId === "string"
    ) {
      ({ delegateInstanceId } = sc as { delegateInstanceId: string });
    } else if (
      target.metadata?.handoffKind === "start" &&
      typeof sc.instanceId === "string"
    ) {
      delegateInstanceId = sc.instanceId;
    }
    if (typeof sc.title === "string") {
      delegateTitle = sc.title;
    }
  }

  target.metadata = {
    ...target.metadata,
    toolResult: result,
    ...(target.metadata?.toolName === "apply_patch" &&
    typeof structuredContent?.diff === "string"
      ? { toolDiff: structuredContent.diff }
      : {}),
    ...(images ? { resultImages: images } : {}),
    toolStatus: isError ? "error" : "success",
    ...(questionResult ? { toolUseResult: questionResult } : {}),
    ...(delegateInstanceId ? { delegateInstanceId } : {}),
    ...(delegateTitle ? { delegateTitle } : {}),
  };
  return target;
}

/* --------------------------------------------------------------- sends — */

/**
 * Where every send stands in a transcript, and what its row says.
 *
 * The hub keeps one record per send (`SendRecord`) and is its only writer. A
 * transcript is the harness's own rows with a placeholder (`send.ref`)
 * wherever a send was read (live: at the record frame that said so) or stored
 * (history: the entry the hub linked). {@link placeSends} puts each send's row
 * in: at its placeholder once it is read or failed there; right after its
 * anchor when it failed without being stored — or, with no anchor, after the
 * last row dated before it was accepted; at the end, waiting, while it is
 * pending. So a reload draws what the live stream drew: the same ids, in the
 * same order, with the same words and the same clock.
 */

/** The place a send was read or stored at, among the harness's rows. */
export const sendRef = (
  instanceId: string,
  uuid: string,
  sdkUuid?: string
): TranscriptBlock => ({
  type: "send.ref",
  id: uuid,
  instanceId,
  content: "",
  ...(sdkUuid ? { sdkUuid } : {}),
});

export const isSendRef = (block: TranscriptBlock): boolean =>
  block.type === "send.ref";

/**
 * The order a record's states come in: the hub only ever moves a record
 * forward along it.
 */
const STATE_ORDER: Record<SendRecord["state"], number> = {
  pending: 0,
  read: 1,
  failed: 2,
  replaced: 3,
  cancelled: 3,
};

/** Whether `record` says something `held` has not heard yet. */
export const newer = (
  held: SendRecord | undefined,
  record: SendRecord
): boolean =>
  held === undefined || STATE_ORDER[record.state] >= STATE_ORDER[held.state];

/**
 * A send's row, from its record alone: the words the sender submitted, the
 * hub's clock, the record's state. `sdkUuid` is the stored entry's own id,
 * when it has one — the handle a rewind goes by.
 */
export function sendRow(
  record: SendRecord,
  sdkUuid: string | undefined = record.harnessId
): TranscriptBlock {
  const { message } = record.body;
  const row = sentRow(transcriptUserText(message) ?? "", message, {
    id: record.uuid,
    instanceId: record.instanceId,
    timestamp: isoOf(record.acceptedAt),
    ...(sdkUuid ? { sdkUuid } : {}),
  });
  const metadata = {
    ...row.metadata,
    ...(record.reason ? { sendFailed: record.reason } : {}),
    ...(record.mode === "urgent" ? { urgent: true as const } : {}),
  };
  return {
    ...row,
    // A replaced record is never drawn (see `placeSends`).
    state: record.state as Exclude<SendRecord["state"], "replaced">,
    queued: record.state === "pending",
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

const byAcceptance = (a: SendRecord, b: SendRecord): number =>
  a.acceptedAt.localeCompare(b.acceptedAt);

/**
 * A row's clock, as its row shows it: a placeholder by the record it draws
 * there (`acceptedAt`), anything else by when the harness stored it. None for
 * a placeholder that draws nothing here, or a row the harness gave no time.
 */
const clockOf = (
  row: TranscriptBlock,
  records: Record<string, SendRecord>
): number | undefined => {
  if (!isSendRef(row)) {
    return row.timestamp ? Date.parse(row.timestamp) : undefined;
  }
  const record = records[row.id];
  return record?.state === "read" || record?.state === "failed"
    ? Date.parse(record.acceptedAt)
    : undefined;
};

/**
 * Where each anchored failure stands: after the last row its anchor names,
 * by id or by the frame the row came from (one assistant frame is several
 * rows). One whose anchor is not among `rows` is put nowhere.
 */
function placeAnchored(
  rows: TranscriptBlock[],
  anchored: Map<string, SendRecord[]>,
  put: (at: number, failed: SendRecord[]) => void
): void {
  const lastAt = new Map<string, number>();
  rows.forEach((row, index) => {
    for (const key of [row.id, row.sdkUuid]) {
      if (key && anchored.has(key)) {
        lastAt.set(key, index);
      }
    }
  });
  for (const [anchor, failed] of anchored) {
    const at = lastAt.get(anchor);
    if (at !== undefined) {
      put(at, failed);
    }
  }
}

/**
 * Where each unanchored failure stands: after the last row dated before it
 * was accepted ({@link clockOf}). Returns the ones no row is dated before.
 */
function placeDated(
  rows: TranscriptBlock[],
  records: Record<string, SendRecord>,
  dated: SendRecord[],
  put: (at: number, failed: SendRecord[]) => void
): SendRecord[] {
  const clocks = rows.map((row) => clockOf(row, records));
  return dated.filter((record) => {
    const accepted = Date.parse(record.acceptedAt);
    const at = clocks.findLastIndex(
      (clock) => clock !== undefined && clock < accepted
    );
    if (at >= 0) {
      put(at, [record]);
    }
    return at < 0;
  });
}

/**
 * THE ONE DERIVE: the harness's rows with every send drawn in its place.
 *
 * - A placeholder draws its send's row when the record is read or failed; a
 *   pending one waits at the end instead, and a replaced one draws nothing.
 * - A failed send that was never stored goes right after its anchor — the
 *   last row the anchor names. One whose anchor is not among these rows is not
 *   drawn.
 * - One with no anchor (the hub knew of nothing the session had said when it
 *   failed) goes after the last row dated before it was accepted, or first of
 *   all when none is.
 * - Pending sends wait in `queued`, oldest accepted first.
 *
 * Read and failed sends with no placeholder and no place of their own are
 * not drawn: their stored entries are not among these rows.
 */
export function placeSends(
  rows: TranscriptBlock[],
  records: Record<string, SendRecord>
): { blocks: TranscriptBlock[]; queued: TranscriptBlock[] } {
  const referenced = new Set(
    rows.flatMap((row) => (isSendRef(row) ? [row.id] : []))
  );
  // A send the harness stored as its own row is drawn by that row: an id
  // names one block.
  const stored = new Set(
    rows.flatMap((row) => (isSendRef(row) ? [] : [row.id]))
  );
  const first: SendRecord[] = [];
  const waiting: SendRecord[] = [];
  const anchored = new Map<string, SendRecord[]>();
  const dated: SendRecord[] = [];
  for (const record of Object.values(records)) {
    if (stored.has(record.uuid)) {
      continue;
    }
    if (record.state === "pending") {
      waiting.push(record);
    } else if (record.state === "failed" && !referenced.has(record.uuid)) {
      if (record.anchor) {
        anchored.set(record.anchor, [
          ...(anchored.get(record.anchor) ?? []),
          record,
        ]);
      } else {
        dated.push(record);
      }
    }
  }

  const after = new Map<number, SendRecord[]>();
  const put = (at: number, failed: SendRecord[]): void => {
    after.set(at, [...(after.get(at) ?? []), ...failed]);
  };
  placeAnchored(rows, anchored, put);
  first.push(...placeDated(rows, records, dated, put));

  const placed: TranscriptBlock[] = first
    .sort(byAcceptance)
    .map((r) => sendRow(r));
  rows.forEach((row, index) => {
    if (isSendRef(row)) {
      const record = records[row.id];
      if (record?.state === "read" || record?.state === "failed") {
        placed.push(sendRow(record, row.sdkUuid));
      }
    } else {
      placed.push(row);
    }
    const failed = after.get(index);
    if (failed) {
      placed.push(...failed.sort(byAcceptance).map((r) => sendRow(r)));
    }
  });
  return {
    blocks: placed,
    queued: waiting.sort(byAcceptance).map((r) => sendRow(r)),
  };
}
