/**
 * pi adapter: a pi session file's records as documents, for the same sync
 * and the same index as Claude Code's (docs.ts `scanDocs`).
 *
 * pi 1.4.0 keeps one append-only JSONL file per session, at
 * `<agent dir>/sessions/--<cwd, separators as dashes>--/<timestamp>_<id>.jsonl`
 * (@earendil-works/pi-coding-agent dist/core/session-manager.js
 * `getDefaultSessionDirPath`, and `newSession`'s `${fileTimestamp}_${this.sessionId}.jsonl`).
 * Its first line is the header, `{type: "session", version, id, timestamp,
 * cwd}`: the only line that names the session and its folder. Each line after
 * it is an entry, `{type, id, parentId, timestamp, ...}`, and one of `type`
 * `"message"` carries an `AgentMessage` under `message`, its `role` saying
 * which (dist/core/session-manager.d.ts `SessionMessageEntry`).
 *
 * A session's words are its `message` entries. Its other entries add none
 * that a search is after, and OpenCode's source leaves the same out: a
 * compaction's or a branch's summary retells entries pi keeps in the file (a
 * compaction deletes nothing), and a `custom_message` is what an extension
 * said to the model (CawCo's hook context, a loaded skill, a notice).
 */

import { type ContentBlock, type TranscriptRecord } from "./types.ts";
import { contentWords, type ExtractOptions, type TranscriptDoc } from "./text.ts";

/** The entry types a document is made from, as the byte prefilter matches them (scan.ts `typeFilter`). */
export const PI_DOC_TYPES = ["message"] as const;

/** What a session file's header says of every entry after it. */
export interface PiSession {
  cwd?: string;
  id: string;
}

/** `record` as a session file's header, or null when it is not one. */
export function piSessionOf(record: TranscriptRecord | undefined): PiSession | null {
  const header = record as { cwd?: unknown; id?: unknown; type?: unknown } | undefined;
  if (header?.type !== "session" || typeof header.id !== "string" || header.id === "") {
    return null;
  }
  return { id: header.id, ...(typeof header.cwd === "string" ? { cwd: header.cwd } : {}) };
}

/** An `AgentMessage` as a session file holds it: each role's own fields. */
interface PiMessage {
  /** `bashExecution`: what the person ran with `!`. */
  command?: string;
  content?: string | PiBlock[];
  /** `assistant`: the model that answered. */
  model?: string;
  /** `bashExecution`: what it printed. */
  output?: string;
  role: string;
  /** `toolResult`: the call it answers. */
  toolCallId?: string;
}

/** A block of pi's content: `text` and `thinking` as Claude Code's are; a call is pi's own `toolCall`. */
interface PiBlock {
  [key: string]: unknown;
  arguments?: Record<string, unknown>;
  id?: string;
  name?: string;
  type: string;
}

/**
 * Which role a message is in a document, and its content in Claude Code's
 * blocks (text.ts `contentWords`), so a tool's name, what it answered and how
 * much of that is kept follow one rule: a tool's answer and a command the
 * person ran are records under the user's role, as Claude Code writes them.
 * Null for a role with no words of a conversation (`system`, the prompt).
 */
function asBlocks(
  message: PiMessage,
): { content: string | ContentBlock[] | undefined; role: TranscriptDoc["role"] } | null {
  const { content } = message;
  switch (message.role) {
    case "user":
      return { role: "user", content };
    case "assistant":
      return {
        role: "assistant",
        content: (Array.isArray(content) ? content : []).map((block) =>
          block.type === "toolCall"
            ? {
                type: "tool_use",
                id: block.id ?? "",
                name: block.name ?? "",
                input: block.arguments ?? {},
              }
            : block,
        ),
      };
    case "toolResult":
      return {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: message.toolCallId ?? "", content }],
      };
    case "bashExecution":
      return {
        role: "user",
        content: [
          { type: "text", text: message.command ?? "" },
          { type: "tool_result", tool_use_id: "", content: message.output ?? "" },
        ],
      };
    default:
      return null;
  }
}

/**
 * A session file's entry as a document, or null for one with no words (any
 * other entry, a role {@link asBlocks} leaves out, a turn that was only
 * reminders).
 */
export function piDoc(
  record: TranscriptRecord,
  session: PiSession,
  options: ExtractOptions = {},
): TranscriptDoc | null {
  const entry = record as { id?: string; message?: PiMessage; timestamp?: string; type: string };
  if (entry.type !== "message" || !entry.message) {
    return null;
  }
  const blocks = asBlocks(entry.message);
  const words = blocks && contentWords(blocks.role, blocks.content, options);
  if (!(blocks && words)) {
    return null;
  }
  return {
    harness: "pi",
    sessionId: session.id,
    id: entry.id ?? "",
    role: blocks.role,
    timestamp: entry.timestamp,
    cwd: session.cwd,
    model: blocks.role === "assistant" ? entry.message.model : undefined,
    ...words,
  };
}
