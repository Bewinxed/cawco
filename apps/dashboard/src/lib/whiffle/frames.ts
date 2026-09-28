/**
 * Raw `SDKMessage` → the `Message` shape the ported renderers already consume.
 *
 * Pure by design: it returns what a frame means and the client store applies it.
 * The SDK's own types are the input contract (tunnelled through `@whiffle/core`),
 * so nothing here re-models them.
 */
import type {
  QueuedMessage,
  SDKAssistantMessage,
  SDKMessage,
  SDKStatus,
  SendPayload,
  SessionMessage,
  SessionPulse,
  SlashCommand,
  UserQuestionResult,
} from "@whiffle/core";
import {
  MESSAGE_DEQUEUED,
  MESSAGE_QUEUED,
  parseDelegateAsk,
  parseHandoffMarker,
  parseReportMarker,
  parseRuleMarker,
  parseWorkflowNotice,
} from "@whiffle/core";
import type { SubagentState } from "$lib/utils/flow-types";
import { getToolGlance } from "$lib/utils/tool-display";
import { newId } from "./id";
import type {
  DelegateEvent,
  JsonValue,
  Message,
  MessageMetadata,
  MessageType,
} from "./types";

type AssistantBlock = SDKAssistantMessage["message"]["content"][number];

/** A tool result to fold into the `tool.use` message that opened it. */
export interface ToolResult {
  images?: Array<{ mediaType: string; src: string }>;
  isError: boolean;
  /** The answer payload of an `AskUserQuestion`, normalised by the harness adapter. */
  questionResult?: UserQuestionResult;
  result: string;
  structuredContent?: Record<string, unknown>;
  toolId: string;
}

/** The tool a session is running right now — the fleet view's glance line. */
export interface ToolGlance {
  glance: string;
  name: string;
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
  status?: SubagentState["status"];
  subagentType?: string;
  /** `agentProgressSummaries`' present-tense line, when enabled. */
  summary?: string;
  taskId?: string;
  toolUseId?: string;
}

export interface FrameMapping {
  /**
   * The subagent branch `messages` and `toolResults` belong to. Absent means the
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
  /** Text to append to the instance's streaming buffer. */
  delta: string;
  /**
   * The id of a queue entry that is no longer waiting: the session pulled it.
   * Its real turn arrives a moment later carrying the same id on
   * {@link FrameMapping.echo} — either retires the row, because a dequeue frame
   * can be raced by the turn it announces, or lost with a dropped subscription.
   */
  dequeued?: string;
  /**
   * The main loop's own user turn, which the local copy already renders. The
   * copy is pushed without an SDK uuid — this is that uuid, so the store can
   * stamp it and edit/fork can anchor on a message the reader just sent
   * instead of waiting for a transcript re-read.
   */
  echo?: { uuid: string; text: string; queueId?: string };
  /** The turn is over — the session is idle again. */
  endsTurn: boolean;
  /**
   * The turn the `result` frame closes answered with an error, whatever its
   * subtype claims. The SDK's own flag — not a reading of what was said.
   */
  failedTurn?: boolean;
  /** Appended to the transcript, in order. */
  messages: Message[];
  /**
   * A message the session took but was too busy to start — the daemon's own
   * word on its input queue, which used to be private to the harness. The
   * store files it under {@link SessionState.queued}; the transcript draws it
   * after the live tail, where it is waiting.
   */
  queued?: QueuedMessage;
  /**
   * What the session says it is doing right now: `compacting` while it rewrites
   * its own context, `requesting` while it waits on the model, `null` when it
   * has stopped saying. The only live word on a compaction — `compact_boundary`
   * arrives once the work is already done.
   */
  status?: SDKStatus;
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
const TASK_STATUS: Record<string, SubagentState["status"]> = {
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
  // The input queue moving. Both are session STATE, drawn as a pending row
  // after the live tail — a transcript line for each would narrate the reader's
  // own send back at them, twice.
  MESSAGE_QUEUED,
  MESSAGE_DEQUEUED,
]);

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
export function streamPhase(
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
  mcp__whiffle__handoff: "handoff",
  mcp__whiffle__start_session: "start",
  mcp__whiffle__delegate: "delegate",
  // OpenCode uses a single underscore between the MCP server and tool names.
  whiffle_handoff: "handoff",
  whiffle_start_session: "start",
  whiffle_delegate: "delegate",
  // pi registers the same tools under bare names (no MCP namespace).
  handoff: "handoff",
  start_session: "start",
  delegate: "delegate",
};

export const SHOW_IMAGE_TOOLS = new Set([
  "mcp__whiffle__show_image",
  "whiffle_show_image",
  "show_image",
]);

export const SHOW_PREVIEW_TOOLS = new Set([
  "mcp__whiffle__show_preview",
  "whiffle_show_preview",
  "show_preview",
]);

/**
 * Whether a parked ask was routed to its parent session rather than to the
 * user's attention queue. The hub tags such a frame's payload with
 * `routedTo: 'parent'`; the attention queue reads this back to keep it out
 * while the delegate's own transcript still shows the ask. Structural so it
 * needs no store type and stays testable on its own.
 */
export function routedToParent(request: { routedTo?: string }): boolean {
  return request.routedTo === "parent";
}

const empty = (): FrameMapping => ({
  messages: [],
  toolResults: [],
  delta: "",
  clearsStream: false,
  endsTurn: false,
});

const uuidOf = (sdk: SDKMessage): string | undefined =>
  "uuid" in sdk ? sdk.uuid : undefined;

const parentOf = (sdk: SDKMessage): string | undefined =>
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

function blockToMessage(
  block: AssistantBlock,
  base: Omit<Message, "type" | "content">
): Message | null {
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
            toolInput: block.input as MessageMetadata["toolInput"],
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
          toolInput: block.input as MessageMetadata["toolInput"],
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

function systemLine(
  base: Omit<Message, "type" | "content">,
  type: MessageType,
  content: string,
  metadata?: MessageMetadata
): Message {
  return { ...base, type, content, metadata };
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

/** What one SDK frame does to an instance's UI state. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one switch over every SDK message subtype, each case self-contained
export function mapFrame(instanceId: string, sdk: SDKMessage): FrameMapping {
  const mapping = empty();
  const uuid = uuidOf(sdk);
  // `forwardSubagentText` forwards a subagent's own turns with their
  // `parent_tool_use_id` set to the Task call that spawned them, so this is the
  // attribution the tree is built from — not `parent_agent_id`, which only ever
  // names a *grandparent* and is always null at the SDK's depth cap of 1.
  const agentId = parentOf(sdk);
  const base: Omit<Message, "type" | "content"> = {
    id: uuid ?? newId(),
    instanceId,
    timestamp: new Date(),
    sdkUuid: uuid,
    parentToolUseId: agentId,
  };
  mapping.agentId = agentId;

  switch (sdk.type) {
    case "assistant": {
      sdk.message.content.forEach((block, index) => {
        const message = blockToMessage(block, {
          ...base,
          id: `${base.id}:${(sdk.contentOffset ?? 0) + index}`,
        });
        if (message) {
          mapping.messages.push(message);
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
          mapping.branch = {
            toolUseId: block.id,
            ...spawn,
            status: "starting",
          };
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
      // A subagent's opening prompt has no local copy to render from, and it is
      // the first thing its branch should say. The main loop's own text does
      // have one, added on send, so it is skipped — except when it isn't the
      // human's at all, which nothing echoes either.
      const text = transcriptUserText(sdk.message);
      // Anything whiffle put into the session on someone else's behalf — a rule,
      // a hand-off, a workflow notice, a delegate's report or ask. Nothing else
      // will ever render it: the reader never typed it, so there is no local
      // copy, and it must not read as the reader's own words. It is classified
      // off its marker line exactly as a stored copy is, so the live and stored
      // rows carry identical content and metadata.
      const injected =
        text &&
        "origin" in sdk &&
        (sdk.origin?.kind === "peer" || sdk.origin?.kind === "system")
          ? injectedMessage(text, base)
          : null;
      if (injected) {
        mapping.messages.push(injected);
        break;
      }
      // A message queued for a busy session loses its `origin` and is re-wrapped
      // as human speech at drain time, so it arrives here as a plain user frame
      // whose text still carries its marker under the wrapper. Unwrapped, it is
      // classified the same way — a genuinely human mid-turn message has no
      // marker and falls through to the echo path below with the wrapper intact.
      const inner = text ? unwrapMidTurn(text) : null;
      const queued = inner ? injectedMessage(inner, base) : null;
      if (queued) {
        mapping.messages.push(queued);
        break;
      }
      // A turn the session had to QUEUE carries the id it waited under. It has
      // no local copy left to render it — the queued row replaced that copy the
      // moment the daemon announced it, and the row is about to be retired — so
      // this one is pushed rather than echoed. The id rides along on `echo`
      // too: retiring the row is what the store does with it, and it happens
      // whether or not the `message_dequeued` frame arrived first.
      const queueId = "queueId" in sdk ? sdk.queueId : undefined;
      if (text && (agentId || systemNote(text))) {
        mapping.messages.push({
          ...base,
          ...userBody(text, transcriptUserImages(sdk.message)),
        });
      } else if (text && uuid && !agentId && queueId) {
        mapping.messages.push({
          ...base,
          ...userBody(text, transcriptUserImages(sdk.message)),
        });
        mapping.echo = { uuid, text, queueId };
      } else if (text && uuid && !agentId) {
        // The human's own turn: rendered by the local copy, so nothing is
        // pushed — but the copy has no SDK uuid until now.
        mapping.echo = { uuid, text };
      }
      if (typeof content === "string") {
        break;
      }
      for (const block of content) {
        if (block.type !== "tool_result") {
          continue;
        }
        const { text: resultBody, images } = resultParts(block.content);
        // A launch is not a report. It says the delegate started, so that is all
        // it does here: the branch moves to running and the metadata stops —
        // it never reaches a `result`, a message, or the card.
        if (subagentLaunch(resultBody)) {
          mapping.branch = { toolUseId: block.tool_use_id, status: "running" };
          continue;
        }
        mapping.toolResults.push({
          toolId: block.tool_use_id,
          result: resultBody,
          ...(images ? { images } : {}),
          isError: block.is_error === true,
          structuredContent: block.structuredContent,
          questionResult: block.questionResult,
        });
      }
      break;
    }

    case "stream_event": {
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
      if (sdk.subtype === "success") {
        break;
      }
      mapping.messages.push(
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
        mapping.messages.push(
          systemLine(base, "system.model_fallback", fallback.content, {
            subtype: "model_fallback",
            model: fallback.model,
          })
        );
        break;
      }
      switch (sdk.subtype) {
        case "init":
          mapping.messages.push(
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
            })
          );
          break;
        case "commands_changed":
          mapping.commands = sdk.commands;
          break;
        // The harness's input queue, made observable. Read defensively: a
        // daemon that predates the frame sends neither, and one that sends a
        // half-formed announcement should move nothing rather than draw a row
        // with no words in it.
        case MESSAGE_QUEUED:
          if (sdk.queueId && typeof sdk.text === "string" && sdk.timestamp) {
            mapping.queued = {
              queueId: sdk.queueId,
              text: sdk.text,
              timestamp: sdk.timestamp,
              ...(typeof sdk.images === "number" ? { images: sdk.images } : {}),
            };
          }
          break;
        case MESSAGE_DEQUEUED:
          if (sdk.queueId) {
            mapping.dequeued = sdk.queueId;
          }
          break;
        case "status":
          mapping.status = sdk.status as SDKStatus | undefined;
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
          // `task_notification` carries no `subagent_type` at all (the SDK type
          // has none), so a plain tool task and a real subagent look identical
          // here — only a branch that already exists tells them apart, which is
          // `applyBranchEvent`'s call. The branch event still updates a real
          // subagent's report; the compact line keeps a plain task's completion
          // visible without a wall of logs.
          //
          // The line is ALWAYS emitted here and dropped at the seam
          // (`suppressesTaskLine`) when a real subagent's branch owns it. It
          // cannot be skipped at the source: a plain tool task mints no branch
          // (see `applyBranchEvent`), so for a background Bash this line is the
          // only place its completion ever shows — emitting nothing made those
          // tasks finish invisibly.
          mapping.messages.push(
            systemLine(
              base,
              "system.task",
              done ? "task done" : "task failed",
              {
                result: truncateSummary(sdk.summary),
                // Named so the fold can drop this line when the harness ALSO
                // delivers its richer XML notification for the same task.
                taskId: sdk.task_id,
              }
            )
          );
          mapping.branch = {
            toolUseId: sdk.tool_use_id,
            taskId: sdk.task_id,
            status: done ? "complete" : "error",
            summary: sdk.summary,
            result: sdk.summary,
          };
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
          mapping.messages.push(
            systemLine(base, "system.compact_boundary", "Context compacted", {
              subtype: "compact_boundary",
              preTokens: sdk.compact_metadata?.pre_tokens,
              trigger: sdk.compact_metadata?.trigger,
            })
          );
          break;
        case "hook_response":
          mapping.messages.push(
            systemLine(
              base,
              "system.hook_response",
              sdk.subtype.replace(/_/g, " "),
              {
                subtype: "hook_response",
                hookName: sdk.hook_name,
                exitCode: sdk.exit_code,
                stdout: sdk.stdout,
                stderr: sdk.stderr,
              }
            )
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
          mapping.messages.push(
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
          if (!QUIET.has(sdk.subtype)) {
            mapping.messages.push(
              // A subtype this switch does not name still says what it came to
              // say: harnesses put their own words in `content` (a provider's
              // retry notice, a quota message), and losing them here is how a
              // real error once hid behind a generic label.
              systemLine(
                base,
                `system.${sdk.subtype}`,
                sdk.content ?? sdk.subtype.replace(/_/g, " "),
                {
                  subtype: sdk.subtype,
                }
              )
            );
          }
      }
      break;
    }

    default:
      // The daemon wraps an SDK message type its normalizer predates as
      // `type: 'raw'` with the original riding along. A line that says "raw"
      // tells the operator nothing (the anonymous-line class again) — the
      // INNER message's own type at least names what arrived, and any words
      // it carries are shown behind a fold rather than lost.
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
        mapping.messages.push(
          systemLine(base, "ui.system_note", text ?? "", {
            noteKind: "Unrecognised frame",
            noteTitle: (innerType || "unrecognised frame").replace(/_/g, " "),
          })
        );
        break;
      }
      if (!QUIET.has(sdk.type)) {
        mapping.messages.push(
          systemLine(base, `system.${sdk.type}`, sdk.type.replace(/_/g, " "))
        );
      }
  }

  return mapping;
}

/**
 * The branch a subagent's messages belong to, created on first sight. Callers
 * must use the returned value rather than the literal: when `branches` is a
 * `$state` proxy, writes land on the proxy's signals and never on the object
 * that was assigned in.
 */
export function branchFor(
  branches: Record<string, SubagentState>,
  instanceId: string,
  toolUseId: string
): SubagentState {
  const existing = branches[toolUseId];
  if (existing) {
    return existing;
  }

  branches[toolUseId] = {
    toolUseId,
    instanceId,
    subagentType: "subagent",
    status: "starting",
    startedAt: new Date(),
    messages: [],
    streaming: "",
  };
  return branches[toolUseId];
}

/** Folds a frame's branch event into the session's subagent branches. */
export function applyBranchEvent(
  branches: Record<string, SubagentState>,
  instanceId: string,
  event: BranchEvent
): void {
  // `task_updated` names only the task, so an already-known branch answers for it.
  const key =
    event.toolUseId ??
    Object.values(branches).find((row) => row.taskId === event.taskId)
      ?.toolUseId;
  if (!key) {
    return;
  }

  // A terminal-status event that names no existing branch and carries no real
  // `subagent_type` is a plain tool task's `task_notification` (a foreground or
  // background Bash). Minting a branch for it is the bug that turned a command
  // into a generic "subagent" card — its tool card already tells that story, so
  // nothing is created here.
  const existing = branches[key];
  const terminal = event.status === "complete" || event.status === "error";
  if (!(existing || event.subagentType) && terminal) {
    return;
  }

  const branch = branchFor(branches, instanceId, key);
  branch.lastEventAt = new Date();
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
      branch.completedAt = new Date();
    }
  }
}

/**
 * Whether a `system.task` line must be dropped: it reports a `tool_use_id` whose
 * branch already exists, so the branch card owns that task's completion — the
 * "task done" pill is a stray for a real subagent. A plain tool task mints no
 * branch (see `applyBranchEvent`), so its line stays. The branch key comes from
 * the mapping's branch event, not the message: `mapFrame` is stateless and the
 * message itself carries no `tool_use_id`.
 */
export function suppressesTaskLine(
  branches: Record<string, SubagentState>,
  message: Message,
  toolUseId: string | undefined
): boolean {
  if (message.type !== "system.task") {
    return false;
  }
  return Boolean(toolUseId && branches[toolUseId]);
}

/**
 * A subagent branch as something to WATCH rather than a string to print: what it
 * is doing right now, what it finally reported, and how many steps that took.
 * Each field keeps its own source — collapsing them into one display line is
 * what let the launch metadata be shown as a delegate's "result", and it loses
 * the live line either way.
 */
export interface SubagentView {
  /** Present tense, what it is doing NOW. Empty once the branch has settled. */
  currentStep: string;
  /** Its final report: the Task result, or the last thing it said. */
  report: string;
  /** Whether the branch is still working. */
  running: boolean;
  /** Tool calls it has made — what the status pill counts. */
  steps: number;
}

/**
 * Present-tense verbs for the tools a delegate's live line names. Anything not
 * listed says its own name, which reads as a step already (`WebSearch whiffle`).
 */
const STEP_VERB: Record<string, string> = {
  Read: "Reading",
  Write: "Writing",
  Edit: "Editing",
  NotebookEdit: "Editing",
  Bash: "Running",
  Grep: "Searching",
  Glob: "Globbing",
  WebFetch: "Fetching",
  WebSearch: "Searching the web",
  Task: "Delegating",
  TodoWrite: "Updating its plan",
};

/** An MCP tool's own name, out of the `mcp__<server>__<tool>` it is called by. */
const stepVerb = (name: string): string => {
  const tool = name.split("__").pop() ?? name;
  return STEP_VERB[tool] ?? tool;
};

const stepLine = (message: Message): string => {
  const verb = stepVerb(message.metadata?.toolName ?? message.content);
  const glance = getToolGlance(
    (message.metadata?.toolInput ?? undefined) as
      | Record<string, unknown>
      | undefined
  );
  return glance ? `${verb} ${glance}` : verb;
};

/**
 * What the delegate is doing at this instant. The call still in flight is the
 * truest answer — it is literally what it is inside — and the progress summary,
 * the text it is writing, and the last call it made are what is left when there
 * is none.
 */
function currentStep(branch: SubagentState, tools: Message[]): string {
  const inFlight = [...tools]
    .reverse()
    .find((m) => m.metadata?.toolStatus === "pending");
  if (inFlight) {
    return stepLine(inFlight);
  }
  if (branch.summary) {
    return branch.summary;
  }
  const writing = branch.streaming.trim().split("\n").filter(Boolean).pop();
  if (writing) {
    return writing;
  }
  const last = tools.at(-1);
  if (last) {
    return stepLine(last);
  }
  if (branch.lastToolName) {
    return stepVerb(branch.lastToolName);
  }
  return branch.description ?? "Working";
}

/** {@link SubagentView} for a branch, recomputed as its frames arrive. */
export function subagentView(branch: SubagentState): SubagentView {
  const running = branch.status === "starting" || branch.status === "running";
  const tools = branch.messages.filter((m) => m.type === "tool.use");
  const said = [...branch.messages]
    .reverse()
    .find((m) => m.type === "assistant" && m.content.trim());
  return {
    running,
    steps: tools.length,
    currentStep: running ? currentStep(branch, tools) : "",
    report: branch.result?.trim() || said?.content.trim() || "",
  };
}

/** A gap longer than this is a clock that moved, not a model that thought. */
const THINKING_MAX_MS = 60 * 60 * 1000;
/**
 * Under this the gap measures the writer rather than the model: two blocks of
 * one assistant frame are stamped milliseconds apart, and a duration that
 * rounds to `0.0s` is a number nobody measured.
 */
const THINKING_MIN_MS = 100;

/**
 * How long the thinking message at `index` stood before the turn moved on: the
 * gap to the message after it, in milliseconds. `null` whenever there is
 * nothing honest to report — it is still the transcript's tail, a timestamp is
 * missing or unreadable, or the numbers are impossible.
 *
 * Adjacency is the whole turn model here, because a `Message` carries no turn
 * id and needs none: only a user-role message opens a turn, so everything else
 * that follows a thinking block is in its turn. The gap to a *user* message is
 * the reader's own time and is refused.
 */
export function thinkingDurationMs(
  messages: Message[],
  index: number
): number | null {
  const message = messages[index];
  const next = messages[index + 1];
  if (!(message && next)) {
    return null;
  }
  if (next.type === "user" || next.type.startsWith("user.")) {
    return null;
  }
  // A stored transcript carries no timestamps at all (see `Message.timestamp`),
  // so "missing" is the ordinary case here, not the exceptional one.
  if (!(message.timestamp && next.timestamp)) {
    return null;
  }
  const from = new Date(message.timestamp).getTime();
  const to = new Date(next.timestamp).getTime();
  if (!(Number.isFinite(from) && Number.isFinite(to))) {
    return null;
  }
  const elapsed = to - from;
  if (elapsed < THINKING_MIN_MS || elapsed > THINKING_MAX_MS) {
    return null;
  }
  return elapsed;
}

/**
 * The user's own text, which live frames never echo (the local copy covers it)
 * but a stored transcript is the only source of.
 */
function transcriptUserText(message: unknown): string | null {
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
function transcriptUserImages(message: unknown): MessageMetadata["images"] {
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
 * When a stored entry was actually written, as the harness recorded it — the
 * only honest clock a replayed transcript has. `undefined` whenever the field
 * is absent (a daemon older than it, or a harness with no source for one) or
 * unparseable, because the alternative is dating the turn to the moment the
 * reader opened the session.
 */
function storedAt(entry: SessionMessage): Date | undefined {
  if (!entry.timestamp) {
    return undefined;
  }
  const at = new Date(entry.timestamp);
  return Number.isNaN(at.getTime()) ? undefined : at;
}

/**
 * What a user-role message renders as. Both the live and the stored path build
 * their user messages from this, so the harness's own voice is never mistaken
 * for the human's on one of them.
 */
function userBody(
  text: string,
  images?: MessageMetadata["images"]
): Pick<Message, "type" | "content" | "metadata"> {
  const note = systemNote(text);
  if (!note) {
    return {
      type: "user",
      content: text,
      metadata: images ? { images } : undefined,
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
  // message the block itself opens is the harness speaking. Matches the
  // anchoring `rows.ts`'s `isHarnessNote` uses, so the two layers agree.
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
    return {
      kind: "Session continued",
      title: "Compacted conversation summary",
    };
  }
  return null;
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

/** A stored session, split the same way a live one is. */
export interface Transcript {
  messages: Message[];
  /** Subagent branches, keyed by the Task `tool_use_id` that spawned them. */
  subagents: Record<string, SubagentState>;
}

/**
 * What an entry that opens a main-loop turn said, and null for everything else —
 * including the user-role entries that carry nothing but a tool result. Only one
 * of these can begin a chunk: anywhere else a slice would open mid-turn, with
 * results arriving for a `tool.use` that is on the other side of the cut. A turn
 * that was nothing but an image still opened one.
 */
export function turnStart(
  entry: SessionMessage
): { text: string; images?: MessageMetadata["images"] } | null {
  if (entry.type !== "user" || entry.parent_tool_use_id) {
    return null;
  }
  const text = transcriptUserText(entry.message);
  const images = transcriptUserImages(entry.message);
  if (text === null && !images) {
    return null;
  }
  return { text: text ?? "", images };
}

/**
 * A message whiffle put into the session on someone else's behalf, read off
 * the marker line it opens with (`@whiffle/core` builds and parses every one).
 * This is the one classification the live stream, a mid-turn delivery and a
 * stored transcript share, so each renders the same row. Null for text with no
 * marker: the reader's own words.
 */
function injectedMessage(
  text: string,
  base: Omit<Message, "type" | "content">
): Message | null {
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
  // Only the short id survives storage; `matchesSession` pairs it with the
  // delegate's full id wherever a consumer needs the row.
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
 * The CLI's mid-turn delivery wrapper, reversed. A message queued for a busy
 * session loses its `origin` inside the native binary, which re-materializes
 * it wrapped as human speech at drain time. The wrapper prose is stable, so
 * it is stripped here before the peer markers are consulted — and a report
 * only reaches a delegate card whose own id it names, so ordinary prose cannot
 * impersonate peer traffic.
 */
const MID_TURN_PREFIXES = [
  "The user sent a new message while you were working:\n",
  "Another Claude session sent a message while you were working:\n",
];
const MID_TURN_SUFFIX_START = "\nThis is how Claude Code surfaces";
export function unwrapMidTurn(text: string): string | null {
  const prefix = MID_TURN_PREFIXES.find((p) => text.startsWith(p));
  if (!prefix) {
    return null;
  }
  const inner = text.slice(prefix.length);
  const cut = inner.lastIndexOf(MID_TURN_SUFFIX_START);
  return (cut === -1 ? inner : inner.slice(0, cut)).trim();
}

/**
 * Whether a message's `peerSession` names this session. A live copy carries the
 * full id; a stored report carries only its 8-char prefix — so the match is
 * exact or by prefix, and never on anything shorter than 8 characters. Legacy
 * with the markers it reads: `delegate_events` rows name the session outright.
 */
export function matchesSession(
  peerSession: string | undefined,
  id: string
): boolean {
  if (!peerSession) {
    return false;
  }
  return (
    peerSession === id ||
    (peerSession.length >= 8 && id.startsWith(peerSession))
  );
}

/**
 * A routed ask's body as the hub serialises it: `<tool> — <input JSON>`
 * (`renderDelegateAsk`, packages/hub). Question-form bodies (`Q1: …`) and
 * anything that does not parse return null and render as plain text.
 *
 * Legacy: an ask's input arrives as an object on its `delegate_events` row, so
 * this only unpacks the transcripts written before that table existed.
 */
const ASK_BODY_PATTERN = /^([A-Za-z_][\w-]*) — (\{.*\})$/s;

export function askBodyParts(
  body: string
): { tool: string; input: Record<string, JsonValue> } | null {
  const match = ASK_BODY_PATTERN.exec(body);
  if (!match) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(match[2]);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    return { tool: match[1], input: parsed as Record<string, JsonValue> };
  } catch {
    return null;
  }
}

/**
 * A question ask's input as the hub words it (`renderDelegateAsk`): one block
 * per question, its options listed under it. Empty for anything else, which is
 * how the callers below tell a question ask from a tool ask.
 */
function questionBlocks(input: Record<string, JsonValue>): string[] {
  const { questions } = input;
  if (!Array.isArray(questions)) {
    return [];
  }
  return questions.map((entry, index) => {
    const question =
      typeof entry === "object" && entry !== null && !Array.isArray(entry)
        ? entry
        : {};
    const text = typeof question.question === "string" ? question.question : "";
    const options = Array.isArray(question.options)
      ? question.options
          .map((option) =>
            typeof option === "object" &&
            option !== null &&
            !Array.isArray(option)
              ? option.label
              : null
          )
          .filter((label): label is string => typeof label === "string")
          .map((label) => `- ${label}`)
          .join("\n")
      : "";
    return `Q${index + 1}: ${text}${options ? `\n${options}` : ""}`;
  });
}

/**
 * An ask's one-line form: the tool plus its most telling argument, never raw
 * JSON — the first question where the ask is a question. The tool name is what
 * the hub recorded, and an ask that never named one still reads as an ask.
 */
export function askShortOf(
  toolName: string | null,
  input: Record<string, JsonValue>
): string {
  const questions = questionBlocks(input);
  if (questions.length > 0) {
    return questions[0].split("\n")[0];
  }
  const tool = toolName ?? "ask";
  const filepath = input.filepath ?? input.filePath ?? input.path;
  if (typeof filepath === "string") {
    return `${tool} ${filepath.split("/").filter(Boolean).pop() ?? filepath}`;
  }
  if (typeof input.command === "string") {
    return `${tool} ${input.command.slice(0, 80)}`;
  }
  return tool;
}

/**
 * An ask's expanded detail: a diff shown as the diff (file path above), a
 * command as the command, a question ask as its questions and their options,
 * anything else as formatted JSON.
 */
export function askDetailOf(
  _toolName: string | null,
  input: Record<string, JsonValue>
): string {
  const questions = questionBlocks(input);
  if (questions.length > 0) {
    return questions.join("\n");
  }
  if (typeof input.diff === "string") {
    const filepath = input.filepath ?? input.filePath ?? input.path;
    return (typeof filepath === "string" ? `${filepath}\n\n` : "") + input.diff;
  }
  if (typeof input.command === "string") {
    return input.command;
  }
  return JSON.stringify(input, null, 2);
}

/**
 * {@link askShortOf} for a transcript-derived ask: the body is parsed first,
 * and one that never parsed (a question list) keeps its own first line.
 */
export function askShort(body: string): string {
  const parts = askBodyParts(body);
  if (!parts) {
    return body.split("\n")[0];
  }
  return askShortOf(parts.tool, parts.input);
}

/** {@link askDetailOf} for a transcript-derived ask; an unparsed body is itself. */
export function askDetail(body: string): string {
  const parts = askBodyParts(body);
  if (!parts) {
    return body;
  }
  return askDetailOf(parts.tool, parts.input);
}

/**
 * Files one of the hub's delegate events into a delegate's list, kept in row
 * order. An answer also settles the ask it belongs to: a settled ask is never
 * re-broadcast, so a reader watching the exchange live has only this to learn
 * the verdict from — the next fresh read carries it on the ask itself.
 */
export function foldDelegateEvent(
  list: DelegateEvent[],
  event: DelegateEvent
): void {
  // Both sources deliver the same rows — the read on arrival and the pushes
  // that follow it overlap by however long the read was out.
  if (list.some((row) => row.id === event.id)) {
    return;
  }
  const after = list.findIndex((row) => row.id > event.id);
  if (after === -1) {
    list.push(event);
  } else {
    list.splice(after, 0, event);
  }

  if (event.kind !== "answer" || !event.requestId) {
    return;
  }
  const ask = list.find(
    (row) => row.kind === "ask" && row.requestId === event.requestId
  );
  if (ask) {
    ask.status = event.payload.behavior === "deny" ? "denied" : "answered";
  }
}

/**
 * What an `answer_delegate` call did, read off its input: denied, answered
 * with choices, or plainly approved. Malformed input reads as a plain approval
 * with no requestId rather than a crash.
 */
export function answerVerdict(toolInput: JsonValue | undefined): {
  verb: "Approved" | "Denied" | "Answered";
  requestId: string | null;
  answers: Array<{ question: string; choice: string }>;
} {
  if (
    typeof toolInput !== "object" ||
    toolInput === null ||
    Array.isArray(toolInput)
  ) {
    return { verb: "Approved", requestId: null, answers: [] };
  }
  const requestId =
    typeof toolInput.requestId === "string" ? toolInput.requestId : null;
  if (toolInput.deny === true) {
    return { verb: "Denied", requestId, answers: [] };
  }
  const answers: Array<{ question: string; choice: string }> = [];
  const raw = toolInput.answers;
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    for (const [question, choice] of Object.entries(raw)) {
      if (typeof choice === "string") {
        answers.push({ question, choice });
      }
    }
  }
  return {
    verb: answers.length > 0 ? "Answered" : "Approved",
    requestId,
    answers,
  };
}

/**
 * The entries between a tool call and the result answering it, marked so no
 * chunk boundary can land inside one. A turn start is nearly always outside them
 * already, but the harness writes its own user-role text mid-turn (a skill's
 * base directory, for one), and a Task call has its subagent's whole branch in
 * there. A call that was never answered spans nothing and blocks nothing.
 */
function spannedByToolCalls(transcript: SessionMessage[]): Int32Array {
  const depth = new Int32Array(transcript.length + 1);
  const open = new Map<string, number>();

  transcript.forEach((entry, index) => {
    const content = (entry.message as { content?: unknown } | null)?.content;
    if (!Array.isArray(content)) {
      return;
    }
    for (const block of content as {
      type?: string;
      id?: string;
      tool_use_id?: string;
    }[]) {
      if (block.type === "tool_use" && block.id) {
        open.set(block.id, index);
      }
      if (block.type !== "tool_result" || !block.tool_use_id) {
        continue;
      }
      const from = open.get(block.tool_use_id);
      if (from === undefined) {
        continue;
      }
      open.delete(block.tool_use_id);
      depth[from + 1] += 1;
      depth[index] -= 1;
    }
  });

  for (let index = 1; index < depth.length; index += 1) {
    depth[index] += depth[index - 1];
  }
  return depth;
}

/**
 * Where a transcript can be split into chunks of roughly `size` entries,
 * ascending from 0. Each index is a multiple of `size` snapped back to the turn
 * it landed in, so mapping any `[boundary, next boundary)` slice on its own
 * gives what mapping the whole would have given for that stretch.
 */
export function turnBoundaries(
  transcript: SessionMessage[],
  size: number
): number[] {
  if (transcript.length <= size) {
    return [0];
  }
  const spanned = spannedByToolCalls(transcript);
  const cuttable = (index: number) =>
    !spanned[index] && turnStart(transcript[index]) !== null;

  const boundaries = [0];
  for (let cursor = size; cursor < transcript.length; cursor += size) {
    let index = cursor;
    while (index > 0 && !cuttable(index)) {
      index -= 1;
    }
    // A turn longer than one chunk snaps onto the boundary already taken, and
    // stays one chunk rather than being cut where the pairs would not survive.
    // biome-ignore lint/style/useAtIndex: boundaries always starts with [0] — .at(-1) would widen to number | undefined for no reason
    if (index > boundaries[boundaries.length - 1]) {
      boundaries.push(index);
    }
  }
  return boundaries;
}

/**
 * A stored session (`getSessionMessages`) as a transcript. Each entry's `message`
 * is the raw SDK message, so the live mapping does the work — only user text,
 * which live sessions render from the local copy, is handled here.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one pass folding every stored transcript entry kind into the live-session shape
export function mapTranscript(
  instanceId: string,
  transcript: SessionMessage[]
): Transcript {
  const messages: Message[] = [];
  const subagents: Record<string, SubagentState> = {};

  for (const entry of transcript) {
    // System messages have no transcript lines, but the `task_*` subtypes
    // carry branch lifecycle data that stored transcripts would otherwise lose
    // (subagentType, description, result summary).
    if (entry.type === "system") {
      const mapping = mapFrame(instanceId, entry as unknown as SDKMessage);
      if (mapping.branch) {
        applyBranchEvent(subagents, instanceId, mapping.branch);
      }
      continue;
    }

    // The one honest clock a replayed turn has; absent on entries an older
    // daemon or a non-Claude harness wrote (see {@link storedAt}).
    const recorded = storedAt(entry);

    // A hand-off is a user-role message and looks exactly like one the reader
    // typed — so this branch claimed it and rendered another agent's words as
    // the reader's own, which is the one thing the peer origin exists to stop.
    // `mapFrame` below knows the difference; let it have them.
    // Anything whiffle injected — another session's hand-off, or a rule — is not
    // the reader opening a turn, and claiming it as one renders it as their own.
    const injectedKind =
      "origin" in entry
        ? (entry as { origin?: { kind?: string } }).origin?.kind
        : undefined;
    const fromPeer = injectedKind === "peer" || injectedKind === "system";
    const opening = fromPeer ? null : turnStart(entry);
    if (opening) {
      // Storage stripped the origin, so a message whiffle injected is known
      // only by its marker line — classified exactly as the live frame was.
      //
      // The SDK filters queued entries out of stored reads today, so a wrapped
      // mid-turn delivery is theoretical here — but if a future version surfaces
      // one, classify on the unwrapped text. The userBody fallback keeps the
      // ORIGINAL wrapped text, so a stored human message renders as stored.
      const stored = {
        id: entry.uuid,
        instanceId,
        ...(recorded ? { timestamp: recorded } : {}),
        sdkUuid: entry.uuid,
      };
      messages.push(
        injectedMessage(
          unwrapMidTurn(opening.text) ?? opening.text,
          stored
        ) ?? {
          ...stored,
          ...userBody(opening.text, opening.images),
        }
      );
      continue;
    }

    const mapping = mapFrame(instanceId, entry as unknown as SDKMessage);
    if (mapping.branch) {
      applyBranchEvent(subagents, instanceId, mapping.branch);
    }

    // `mapFrame` stamps the client's clock, which is the truth for a frame
    // arriving live and a fiction for one read back off disk — it would date
    // every turn of a year-old session to the moment the reader opened it. The
    // entry's own recorded time replaces it where the harness sent one, and
    // where it did not (an older daemon, or a harness with no source for it)
    // the message carries none and renders none.
    for (const message of mapping.messages) {
      if (recorded) {
        message.timestamp = recorded;
      } else {
        message.timestamp = undefined;
      }
    }

    const sink = mapping.agentId
      ? branchFor(subagents, instanceId, mapping.agentId).messages
      : messages;
    sink.push(...mapping.messages);
    for (const result of mapping.toolResults) {
      applyToolResult(sink, result);
      // The Task call's own tool_result is the authoritative end of its branch,
      // mirroring what the live path does in client.svelte.ts.
      const branch = subagents[result.toolId];
      if (!branch) {
        continue;
      }
      branch.status = result.isError ? "error" : "complete";
      branch.completedAt ??= new Date();
      if (result.isError) {
        branch.error ??= result.result;
      } else {
        branch.result ??= result.result;
      }
    }
  }

  // Nothing further will arrive for a stored session; anything still open ended
  // with the session rather than being live.
  for (const branch of Object.values(subagents)) {
    if (branch.status !== "error" && branch.status !== "complete") {
      branch.status = "complete";
    }
  }

  return { messages, subagents };
}

/** The message optimistically shown for text the user just sent. */
export function localUserMessage(
  instanceId: string,
  text: string,
  { attachments, images }: Pick<SendPayload, "attachments" | "images"> = {}
): Message {
  const carried = Boolean(attachments?.length || images?.length);
  return {
    id: newId(),
    instanceId,
    type: "user",
    content: text,
    timestamp: new Date(),
    // Thumbnails come from the same base64 that went out: nothing comes back to
    // build them from, since the live path never echoes the user's own turn.
    metadata: carried
      ? {
          attachments: attachments?.map(({ name, content }) => ({
            name,
            chars: content.length,
          })),
          images: images?.map(({ mediaType, data }) => ({
            mediaType,
            src: `data:${mediaType};base64,${data}`,
          })),
        }
      : undefined,
  };
}

/** A client- or hub-side failure, rendered inline so it cannot be missed. */
export function errorMessage(instanceId: string, text: string): Message {
  return {
    id: newId(),
    instanceId,
    type: "ui.error",
    content: text,
    timestamp: new Date(),
  };
}

/** A session that died before it said anything — the registry row is all there is. */
export function sessionFailedMessage(
  instanceId: string,
  reason: string
): Message {
  return {
    id: `${instanceId}:failed`,
    instanceId,
    type: "ui.session_error",
    content: reason,
    timestamp: new Date(),
    metadata: { errorTitle: "Session failed to start" },
  };
}

/**
 * Folds an injected message (`user.rule`, `user.peer`, `user.delegate_ask`)
 * into the transcript without doubling it. Each reaches the reader twice —
 * once live, with no uuid, and once as the stored copy, which has one — and
 * both are classified to the same row, so the second arrival merges into the
 * first: one row, and the uuid (edit/fork's anchor) attached whichever way
 * round they arrived. Rules and peers pair by exact text ({@link sameArrival});
 * an ask pairs by its `askRequestId`. Returns true when the message was folded
 * in and must not be appended.
 */
export function mergePeerMessage(
  messages: Message[],
  incoming: Message
): boolean {
  if (incoming.type === "user.delegate_ask") {
    const requestId = incoming.metadata?.askRequestId;
    if (!requestId) {
      return false;
    }
    const existing = messages.find(
      (message) =>
        message.type === "user.delegate_ask" &&
        message.metadata?.askRequestId === requestId
    );
    if (!existing) {
      return false;
    }
    if (!existing.sdkUuid && incoming.sdkUuid) {
      existing.sdkUuid = incoming.sdkUuid;
      existing.id = incoming.id;
    }
    return true;
  }
  if (incoming.type !== "user.rule" && incoming.type !== "user.peer") {
    return false;
  }
  const existing = messages.find(
    (message) =>
      message.type === incoming.type &&
      message.content === incoming.content &&
      sameArrival(message, incoming)
  );
  if (!existing) {
    return false;
  }
  if (!existing.sdkUuid) {
    existing.sdkUuid = incoming.sdkUuid;
    existing.id = incoming.id;
  }
  return true;
}

/**
 * Whether two rows with the same text are one message arriving twice rather
 * than two messages that happen to read alike (a rule that nags resends the
 * same words). The live copy carries no uuid and the stored copy does, so they
 * pair; two stored copies pair only on the same uuid, and two live ones never.
 */
const sameArrival = (a: Message, b: Message): boolean =>
  a.sdkUuid ? a.sdkUuid === b.sdkUuid || !b.sdkUuid : !!b.sdkUuid;

/** Folds a tool result into the `tool.use` it answers. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one dispatch over every tool-result shape a `tool.use` can be answered by
export function applyToolResult(
  messages: Message[],
  {
    toolId,
    result,
    images,
    isError,
    structuredContent,
    questionResult,
  }: ToolResult
): void {
  // `tool.handoff` is a tool call too — it just renders as a receipt. Matching
  // only `tool.use` left it stuck on "sending…" with the answer never applied.
  const target = messages.find(
    (m) =>
      (m.type === "tool.use" || m.type === "tool.handoff") &&
      m.metadata?.toolId === toolId
  );
  if (!target) {
    return;
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
    ...(images ? { resultImages: images } : {}),
    toolStatus: isError ? "error" : "success",
    ...(questionResult ? { toolUseResult: questionResult } : {}),
    ...(delegateInstanceId ? { delegateInstanceId } : {}),
    ...(delegateTitle ? { delegateTitle } : {}),
  };
}

/**
 * Folds the hub's pulse snapshot — `instancesFrame.pulses` (ARCHITECTURE.md's
 * C3, a `Record<instanceId, SessionPulse>` riding the same frame every
 * `instances` push carries) — into the client's own pulse map.
 *
 * Pulled out of the runes module for the same reason as everything else here:
 * `client.svelte.ts` cannot be imported by this repo's bun tests. The rule
 * itself is a merge, not a replace, because a per-instance `pulse` frame
 * (thrown the moment a daemon reports one) is not ordered against a snapshot
 * the hub took moments before the `instances` frame carrying it left — either
 * can reach the browser first, so whichever pulse actually happened later, by
 * its own `at`, is the one kept.
 */
export function mergePulses(
  current: Record<string, SessionPulse>,
  incoming: Record<string, SessionPulse> | undefined
): Record<string, SessionPulse> {
  if (!incoming) {
    return current;
  }
  const next = { ...current };
  for (const [instanceId, pulse] of Object.entries(incoming)) {
    const existing = next[instanceId];
    if (!existing || pulse.at >= existing.at) {
      next[instanceId] = pulse;
    }
  }
  return next;
}
