/**
 * OpenCode 2.0's sessions as the fleet's transcript: the rows a tool call,
 * a question, a Code Mode program and a compaction become, live and read
 * back alike, and {@link toTranscript}, which is the whole of what a
 * reopened OpenCode transcript is.
 *
 * 2.0 keeps a session as projected messages (`GET /api/session/{id}/message`,
 * `Session.Message.Info`): `user`, `synthetic`, `system`, `assistant` (its
 * `content` the text, reasoning and tool blocks in the order they began),
 * `compaction`, `idle` (a turn's end, with its outcome) and the switches of
 * agent, model and location. There are no parts: a message is whole.
 */
import type {
  NeutralAssistantBlock,
  NeutralContentBlock,
  NeutralSystemMessage,
  SessionMessage,
  UserAnswers,
  UserQuestion,
  UserQuestionResult,
} from "@cawco/core";
import {
  ASK_USER_QUESTION,
  MCP_NOT_CONNECTED,
  REPEATED_FAILURE,
} from "@cawco/core";
import type {
  SessionInboxInfo,
  SessionMessageAssistant,
  SessionMessageCompaction,
  SessionMessageInfo,
  ToolContent1,
} from "@opencode/client";
import { errorText } from "./opencode-client";
import { CODE_MODE_TOOL } from "./opencode-plugin";

type ToolUseBlock = Extract<NeutralContentBlock, { type: "tool_use" }>;
type ToolResultBlock = Extract<NeutralContentBlock, { type: "tool_result" }>;

/** A tool block of an assistant message, as 2.0 keeps it. */
export type ToolBlock = Extract<
  SessionMessageAssistant["content"][number],
  { type: "tool" }
>;

/** OpenCode's own name for the tool a question rides on. */
export const QUESTION_TOOL = "question";

/**
 * What a tool call is written down as. OpenCode calls the question tool
 * `question`; the rest of the fleet calls it {@link ASK_USER_QUESTION}, and
 * the renderer keys off that name.
 */
export const toolNameOf = (tool: string): string =>
  tool === QUESTION_TOOL ? ASK_USER_QUESTION : tool;

/**
 * A tool call's input as the fleet sees it. The session credential the
 * plugin stamps into a CawCo call (`__cawco`) is the session's secret, never
 * the transcript's.
 */
export const toolInputOf = (input: unknown): Record<string, unknown> => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const { __cawco: _secret, ...rest } = input as Record<string, unknown>;
  return rest;
};

/** A `data:` URI's media type and base64 body, when it is one. */
const DATA_URI = /^data:([^;,]+);base64,(.*)$/s;

/** One block of a tool's content (`Tool.Content`), as events and stored messages both carry it. */
type ContentBlock =
  | ToolContent1
  | { type: "file"; uri: string; mime: string; name?: string | null };

/**
 * A tool's content (`Tool.Content[]`: text and files) as a tool result's:
 * its words joined, and each file a `data:` URI carries as a picture after
 * them. A file named by any other URI is said by its URI.
 */
export const toolContentOf = (
  content: readonly ContentBlock[] | undefined
): string | NeutralContentBlock[] => {
  const blocks = content ?? [];
  const words: string[] = [];
  const images: NeutralContentBlock[] = [];
  for (const block of blocks) {
    if (block.type === "text") {
      words.push(block.text);
      continue;
    }
    const data = DATA_URI.exec(block.uri);
    if (data && block.mime.startsWith("image/")) {
      images.push({
        type: "image",
        source: {
          type: "base64",
          media_type: block.mime,
          data: data[2] ?? "",
        },
      });
    } else {
      words.push(block.uri);
    }
  }
  const text = words.join("\n\n");
  return images.length ? [{ type: "text", text }, ...images] : text;
};

/** An MCP call's content (`{type, text}` / `{type, data, mimeType}` blocks) as a direct call's result would read. */
const mcpContentOf = (content: unknown): string | NeutralContentBlock[] => {
  const blocks = Array.isArray(content)
    ? (content as {
        type?: string;
        text?: string;
        data?: string;
        mimeType?: string;
        uri?: string;
        mime?: string;
      }[])
    : [];
  const text = blocks
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n\n");
  const images: NeutralContentBlock[] = blocks.flatMap((block) => {
    if (
      block.type === "image" &&
      typeof block.data === "string" &&
      typeof block.mimeType === "string"
    ) {
      return [
        {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: block.mimeType,
            data: block.data,
          },
        },
      ];
    }
    const data = block.type === "file" ? DATA_URI.exec(block.uri ?? "") : null;
    return data && block.mime?.startsWith("image/")
      ? [
          {
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: block.mime,
              data: data[2] ?? "",
            },
          },
        ]
      : [];
  });
  return images.length ? [{ type: "text", text }, ...images] : text;
};

/** OpenCode's question shape, which says `multiple` where the fleet says `multiSelect`. */
export const questionsOf = (raw: unknown): UserQuestion[] | null => {
  if (!Array.isArray(raw)) {
    return null;
  }
  const questions: UserQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return null;
    }
    const q = item as {
      question?: unknown;
      header?: unknown;
      options?: unknown;
      multiple?: unknown;
    };
    if (typeof q.question !== "string" || !Array.isArray(q.options)) {
      return null;
    }
    questions.push({
      question: q.question,
      header: typeof q.header === "string" ? q.header : q.question,
      options: q.options as UserQuestion["options"],
      multiSelect: q.multiple === true,
    });
  }
  return questions;
};

/**
 * How a question ended, read off its `question` tool call: the asked
 * questions are its input, and the reader's choices its result's
 * `metadata.answers`, one label array per question in the order they were
 * asked (observed on 2.0.28: `"answers":[["Red"],["S","L"]]`). The call
 * completes on every route the form is answered by, and OpenCode stores it,
 * so a reloaded transcript draws the answered card too. `null` for any call
 * that is not a question.
 */
export const questionResultOf = (
  tool: string,
  input: unknown,
  metadata: unknown
): UserQuestionResult | null => {
  if (tool !== QUESTION_TOOL) {
    return null;
  }
  const questions = questionsOf(
    (input as { questions?: unknown } | undefined)?.questions
  );
  if (!questions) {
    return null;
  }
  const raw = (metadata as { answers?: unknown } | undefined)?.answers;
  // A question that completed carrying no answers is one the reader walked
  // away from, not an answered question with an empty map.
  if (!Array.isArray(raw)) {
    return { outcome: "dismissed", questions };
  }
  const answers: UserAnswers = {};
  questions.forEach((question, i) => {
    const picked = Array.isArray(raw[i]) ? (raw[i] as string[]) : [];
    answers[question.question] = question.multiSelect
      ? picked
      : (picked[0] ?? "");
  });
  return { outcome: "answered", questions, answers };
};

/** What a program's call answered, as the plugin writes it onto the program (`metadata.calls`). */
interface AnsweredCall {
  content?: unknown;
  input?: Record<string, unknown>;
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  tool: string;
}

/** A program's own record of a call it made (`metadata.toolCalls`). */
interface ProgramCall {
  input?: unknown;
  status: string;
  tool: string;
}

/** A Code Mode program's state, as a live event or a stored tool block carries it. */
export interface ProgramState {
  /** The program's own call id. */
  id: string;
  metadata?: Record<string, unknown>;
  /** It has ended, one way or the other. */
  settled: boolean;
  /** Its error, when the program failed or threw. */
  threw?: string;
}

/**
 * The calls a Code Mode program ({@link CODE_MODE_TOOL}) made, each as the
 * tool call and result it would be made directly. OpenCode records each
 * call's path, input and status as the program runs (`metadata.toolCalls`,
 * `tools.<server>.<tool>`, in the order they started); the plugin writes what
 * each answered, under its own tool name (`<server>_<tool>`), as the program
 * ends (`metadata.calls`, in the same order). Every call of a program carries
 * the program's call id, so a call is matched to its answer by tool name and
 * order: the n-th call of a tool to that tool's n-th answer.
 */
export const codeModeCalls = (
  program: ProgramState
): { key: string; use: ToolUseBlock; result?: ToolResultBlock }[] => {
  const meta = program.metadata ?? {};
  const calls = (meta.toolCalls as ProgramCall[] | undefined) ?? [];
  const answers = (meta.calls as AnsweredCall[] | undefined) ?? [];
  const seen = new Map<string, number>();
  return calls.map((call, index) => {
    // `server.tool` is the path the program wrote; the hook's name is the one a direct call carries.
    const name = call.tool.replace(".", "_");
    const nth = seen.get(name) ?? 0;
    seen.set(name, nth + 1);
    const answered = answers.filter((answer) => answer.tool === name)[nth];
    const key = `${program.id}/${index + 1}`;
    const use: ToolUseBlock = {
      type: "tool_use",
      id: key,
      name,
      input: toolInputOf(answered?.input ?? call.input),
    };
    if (answered && "content" in answered) {
      return {
        key,
        use,
        result: {
          type: "tool_result",
          tool_use_id: key,
          content: mcpContentOf(answered.content),
          is_error: answered.isError === true,
          ...(answered.structuredContent
            ? { structuredContent: answered.structuredContent }
            : {}),
        },
      };
    }
    if (!program.settled) {
      return { key, use };
    }
    return {
      key,
      use,
      result: {
        type: "tool_result",
        tool_use_id: key,
        content:
          call.status === "completed"
            ? ""
            : (program.threw ??
              "Failed inside its Code Mode program; OpenCode keeps no words for it."),
        is_error: call.status !== "completed",
      },
    };
  });
};

/** A tool call's result: its content, its metadata (bar a program's), and a question's outcome. */
export const toolResultOf = (
  id: string,
  tool: string,
  input: unknown,
  outcome:
    | { content?: readonly ContentBlock[]; metadata?: Record<string, unknown> }
    | { error: { message: string; type?: string } },
  failed: boolean
): ToolResultBlock => {
  if ("error" in outcome) {
    return {
      type: "tool_result",
      tool_use_id: id,
      content: errorText(outcome.error),
      is_error: true,
    };
  }
  const { metadata } = outcome;
  const structuredContent =
    tool !== CODE_MODE_TOOL && metadata && Object.keys(metadata).length > 0
      ? metadata
      : undefined;
  const question = questionResultOf(tool, input, metadata);
  return {
    type: "tool_result",
    tool_use_id: id,
    content: toolContentOf(outcome.content),
    // A program that threw ends completed, saying so in its metadata.
    is_error: failed || (tool === CODE_MODE_TOOL && metadata?.error === true),
    ...(structuredContent ? { structuredContent } : {}),
    ...(question ? { questionResult: question } : {}),
  };
};

/** What a stored program ended on when it failed or threw (a throw ends `completed`, with `metadata.error`). */
const programThrew = (block: ToolBlock): string | undefined => {
  const { state } = block;
  if (state.status === "error") {
    return errorText(state.error);
  }
  return state.status === "completed" &&
    (state.metadata as { error?: unknown } | undefined)?.error === true
    ? String(toolContentOf(state.content))
    : undefined;
};

/** A tool block of a stored message as a program's state. */
const programOf = (block: ToolBlock): ProgramState => {
  const threw = programThrew(block);
  return {
    id: block.id,
    metadata: (block.state as { metadata?: Record<string, unknown> }).metadata,
    settled:
      block.state.status === "completed" || block.state.status === "error",
    ...(threw === undefined ? {} : { threw }),
  };
};

/** A compaction as the boundary frame the transcript draws, under its message's id live and read back alike. */
export const compactBoundary = (
  id: string,
  sessionId: string,
  reason: "auto" | "manual",
  timestamp: string | undefined,
  outcome?: { result: "success" } | { result: "failed"; error: string }
): NeutralSystemMessage => ({
  type: "system",
  subtype: "compact_boundary",
  uuid: id,
  session_id: sessionId,
  ...(timestamp ? { timestamp } : {}),
  compact_metadata: { trigger: reason, ...outcome },
});

/** How a stored compaction ended. */
const compactionOutcome = (
  message: SessionMessageCompaction
): { result: "success" } | { result: "failed"; error: string } | undefined => {
  if (message.status === "completed") {
    return { result: "success" };
  }
  return message.status === "failed"
    ? { result: "failed", error: errorText(message.error) }
    : undefined;
};

/** The id a compaction's summary row has: its compaction's, marked. */
export const summaryId = (compactionId: string): string =>
  `${compactionId}:summary`;

/** An entry of the transcript, with the fields every entry carries. */
const entry = (
  sessionKey: string,
  timestamp: string,
  row: Omit<
    SessionMessage,
    "session_id" | "parent_tool_use_id" | "parent_agent_id" | "timestamp"
  >
): SessionMessage =>
  ({
    session_id: sessionKey,
    parent_tool_use_id: null,
    parent_agent_id: null,
    timestamp,
    ...row,
  }) as SessionMessage;

/**
 * 2.0's projected messages → the neutral transcript entries the folder reads.
 * `waiting` are the sends OpenCode admitted and has yet to give the model
 * (`GET …/inbox`): each is a queued row after the stored ones.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one switch over every kind of projected message
export function toTranscript(
  sessionKey: string,
  messages: readonly SessionMessageInfo[],
  waiting: readonly SessionInboxInfo[] = []
): SessionMessage[] {
  const entries: SessionMessage[] = [];
  for (const message of messages) {
    // Every entry of a message carries when OpenCode created it; a tool
    // result, when its call completed.
    const timestamp = new Date(message.time.created).toISOString();
    switch (message.type) {
      case "user": {
        const content = toolContentOf([
          { type: "text", text: message.text },
          ...(message.files ?? []).map((file) => ({
            type: "file" as const,
            uri: `data:${file.mime};base64,${file.data}`,
            mime: file.mime,
          })),
        ]);
        // A sent message is keyed back to its send's uuid by the hub, which
        // was told this message id when the send was dispatched (`storedAs`).
        entries.push(
          entry(sessionKey, timestamp, {
            type: "user",
            uuid: message.id,
            message: { role: "user", content },
          })
        );
        break;
      }
      case "synthetic": {
        // CawCo's own stop of a session failing the same way again and again
        // (`noteStopped`), and its word that an MCP server did not connect
        // (`sayUnconnected`), read back as the lines the live stream drew. Any
        // other synthetic input is OpenCode's or a plugin's, not anyone's words.
        const meta = message.metadata as
          | {
              cawco?: unknown;
              words?: unknown;
              server?: unknown;
              line?: unknown;
            }
          | undefined;
        if (meta?.cawco === MCP_NOT_CONNECTED) {
          entries.push(
            entry(sessionKey, timestamp, {
              type: "system",
              uuid: message.id,
              message: {
                type: "system",
                subtype: MCP_NOT_CONNECTED,
                uuid: message.id,
                session_id: sessionKey,
                timestamp,
                mcp_server: String(meta.server),
                content: String(meta.line),
              },
            })
          );
        }
        if (meta?.cawco === REPEATED_FAILURE) {
          entries.push(
            entry(sessionKey, timestamp, {
              type: "system",
              uuid: message.id,
              message: {
                type: "system",
                subtype: REPEATED_FAILURE,
                uuid: message.id,
                session_id: sessionKey,
                timestamp,
                content: String(meta.words ?? ""),
              },
            })
          );
        }
        break;
      }
      case "compaction": {
        entries.push(
          entry(sessionKey, timestamp, {
            type: "system",
            uuid: message.id,
            message: compactBoundary(
              message.id,
              sessionKey,
              message.reason,
              timestamp,
              compactionOutcome(message)
            ),
          })
        );
        if (message.status === "completed" && message.summary) {
          entries.push(
            entry(sessionKey, timestamp, {
              type: "assistant",
              uuid: summaryId(message.id),
              message: {
                role: "assistant",
                content: [{ type: "text", text: message.summary }],
              },
              compactSummary: true,
            })
          );
        }
        break;
      }
      case "assistant": {
        entries.push(...assistantEntries(sessionKey, message, timestamp));
        break;
      }
      case "idle": {
        // A turn that failed or was stopped, read back as the result frame
        // the live stream closed it with: a reload draws the same line, and
        // the turn reads as ended rather than cut. A stop is the reader's own.
        if (message.outcome !== "succeeded") {
          const uuid = `${message.id}:result`;
          entries.push(
            entry(sessionKey, timestamp, {
              type: "system",
              uuid,
              message: {
                type: "result",
                uuid,
                session_id: sessionKey,
                ...(message.outcome === "interrupted"
                  ? { subtype: "aborted", is_error: false }
                  : {
                      subtype: "error_during_execution",
                      is_error: true,
                      errors: [
                        message.error
                          ? errorText(message.error)
                          : "The turn failed.",
                      ],
                    }),
              },
            })
          );
        }
        break;
      }
      default:
        // System updates, skill activations, user shells and switches of
        // agent, model or location: no one's words, and the live stream
        // draws none of them.
        break;
    }
  }
  for (const item of waiting) {
    if (item.type !== "user") {
      continue;
    }
    entries.push(
      entry(sessionKey, new Date(item.time.created).toISOString(), {
        type: "user",
        uuid: item.id,
        message: { role: "user", content: item.payload.text },
        queued: true,
      })
    );
  }
  return entries;
}

/** One assistant message: its blocks as one entry, then each tool's result. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one pass over an assistant message's text, reasoning, tool and Code Mode blocks
function assistantEntries(
  sessionKey: string,
  message: SessionMessageAssistant,
  timestamp: string
): SessionMessage[] {
  const entries: SessionMessage[] = [];
  const blocks: NeutralAssistantBlock[] = [];
  for (const block of message.content) {
    if (block.type === "text") {
      blocks.push({ type: "text", text: block.text });
    } else if (block.type === "reasoning") {
      blocks.push({ type: "thinking", thinking: block.text });
    } else {
      blocks.push({
        type: "tool_use",
        id: block.id,
        name: toolNameOf(block.name),
        input: toolInputOf(block.state.input),
      });
      if (block.name === CODE_MODE_TOOL) {
        blocks.push(...codeModeCalls(programOf(block)).map(({ use }) => use));
      }
    }
  }
  if (blocks.length) {
    entries.push(
      entry(sessionKey, timestamp, {
        type: "assistant",
        uuid: message.id,
        message: {
          role: "assistant",
          model: `${message.model.providerID}/${message.model.id}`,
          content: blocks,
        },
        ...(message.time.completed &&
        message.finish === "stop" &&
        !message.error
          ? { turnEnd: true as const }
          : {}),
      })
    );
  }
  for (const block of message.content) {
    if (block.type !== "tool") {
      continue;
    }
    const ended = block.time.completed
      ? new Date(block.time.completed).toISOString()
      : timestamp;
    if (block.name === CODE_MODE_TOOL) {
      for (const { key, result } of codeModeCalls(programOf(block))) {
        if (result) {
          entries.push(
            entry(sessionKey, ended, {
              type: "user",
              uuid: `${message.id}:${key}`,
              message: { role: "user", content: [result] },
            })
          );
        }
      }
    }
    const { state } = block;
    if (state.status !== "completed" && state.status !== "error") {
      continue;
    }
    entries.push(
      entry(sessionKey, ended, {
        type: "user",
        uuid: `${message.id}:${block.id}`,
        message: {
          role: "user",
          content: [
            toolResultOf(
              block.id,
              block.name,
              state.input,
              state.status === "completed"
                ? {
                    content: state.content,
                    metadata: state.metadata as Record<string, unknown>,
                  }
                : { error: state.error },
              state.status === "error"
            ),
          ],
        },
      })
    );
  }
  return entries;
}
