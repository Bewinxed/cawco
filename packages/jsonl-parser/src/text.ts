/**
 * Text extraction: turn transcript records into indexable documents.
 *
 * On a real 1 GB corpus the searchable message/thinking text is ~2.3% of the
 * bytes — everything else is tool results, metadata, and envelopes. This
 * module defines the document shape the BM25 layers consume.
 */

import type {
  AssistantRecord,
  AttachmentRecord,
  ContentBlock,
  TranscriptRecord,
  UserRecord,
} from "./types.ts";

/**
 * Who a document's words are: `owner`, the person's own; `agent`, a model's
 * prose (its own, or another session's hand-off brief arriving as a user
 * turn); `report`, a delegate's report arriving as a user turn; `injected`,
 * everything else a harness or CawCo puts under the user's role (slash
 * command echoes, hook output, notices, interruptions, a compaction's
 * summary). Only `owner` is "said by me".
 */
export type DocAuthor = "owner" | "agent" | "report" | "injected";

/** A normalized, harness-agnostic searchable document. */
export interface TranscriptDoc {
  /** Which harness produced it (claude-code, opencode, ...). */
  harness: string;
  sessionId: string;
  /** Record uuid (claude-code) or message id (opencode). */
  id: string;
  role: "user" | "assistant";
  author: DocAuthor;
  /** ISO timestamp when known. */
  timestamp?: string;
  /** What was said: the message's text, without thinking and without system reminders. */
  text: string;
  /** The model's thinking, apart from what it said. */
  thinking?: string;
  /** Names of tools invoked in this record, space-joined (searchable facet). */
  tools?: string;
  /**
   * What the tools answered in this record (a tool result's words), each cut
   * to {@link ExtractOptions.toolOutputChars}: searched only when a search
   * asks for it (an agent's `find`).
   */
  output?: string;
  cwd?: string;
  model?: string;
  /** True for sidechain/subagent records. */
  sidechain?: boolean;
}

export interface ExtractOptions {
  /** Include thinking blocks, in their own field (default true). */
  thinking?: boolean;
  /** Include stringified tool_use inputs, capped per block (default 0 = off). */
  toolInputBytes?: number;
  /** Skip system-injected user records (isMeta) (default true). */
  skipMeta?: boolean;
  /** How much of each tool result's words is kept, characters (default {@link TOOL_OUTPUT_CHARS}; 0 = none). */
  toolOutputChars?: number;
}

/**
 * How much of one tool result's words the index keeps. Tool results are most
 * of a transcript's bytes (a file read, a build log), and the index holds a
 * copy of what it searches: the head of each result is where a command's
 * error, a test's failure or a value it printed stands, and a search past it
 * is a read of the transcript. Our own call.
 */
export const TOOL_OUTPUT_CHARS = 4000;

/** A tool result's words: its text, or its text parts' (an image is no words). */
function resultWords(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .flatMap((part: { text?: unknown; type?: unknown }) =>
      part?.type === "text" && typeof part.text === "string" ? [part.text] : [],
    )
    .join("\n");
}

/**
 * Claude Code's reminders, appended to the person's own turns and to tool
 * results: the same CLAUDE.md and skill lists in every session, never words
 * anyone said there. Left out of the index whole.
 */
const SYSTEM_REMINDER = /<system-reminder>[\s\S]*?<\/system-reminder>/g;

/**
 * The machine tag every message CawCo puts into a session opens with (core
 * injected.ts `markerTag`): `[cawco:<kind> …]`, its kind read and nothing
 * else. Kept here, not imported: the parser parses in workers and depends on
 * nothing of CawCo's.
 */
const CAWCO_TAG = /^\[cawco:([a-z-]+)[ \]]/;

/** Who wrote a message CawCo tagged, by its kind: a report, another agent's words, or CawCo's own notice. */
const TAGGED: Readonly<Record<string, DocAuthor>> = {
  report: "report",
  handoff: "agent",
};

/**
 * What a harness or the hub writes under the user's role that nobody typed:
 * Claude Code's slash-command echoes, local command output, task
 * notifications, hook output, its caveat line, an interruption, a
 * compaction's summary and a skill's loaded text; and the hub's own prompts
 * for a continuation (hub continuation.ts): the summariser's prompt, which
 * quotes the source session's transcript whole, and the new session's
 * opening, which quotes its summary and its last turns or the person's asks.
 * Both carry the person's words, copied: indexed as the person's, every
 * summarised session's words came back twice under `by: person`, the copy
 * ranked above the turn. The summariser's prompt is {@link COPIED}, never
 * indexed. Keep these in step with continuation.ts's `summariserPrompt`,
 * `openingMessage` and `asksOpening`.
 */
const INJECTED = [
  /^<(?:command-name|command-message|command-args|local-command-stdout|local-command-stderr|local-command-caveat|task-notification|user-prompt-submit-hook|bash-stdout|bash-stderr)>/,
  /^Caveat: The messages below were generated by the user/,
  /^\[Request interrupted by user/,
  /^This session is being continued from a previous conversation/,
  /^Base directory for this skill: /,
  /^(?:Continuing|Restarting) session ".*" \(instance [0-9a-f-]+, /,
];

/**
 * The hub's summariser prompt (continuation.ts `summariserPrompt`): another
 * session's transcript quoted whole as one user turn, each of its words
 * already indexed where it was said, in a session no find ever answers with
 * (hub find.ts `hubMade`). Indexed, it held every word of any long query
 * and answered first: 116 of them (13.7 MB, up to 739 KB each) were 21 of a
 * 19-word query's 24 moments on obelisk's index, and FTS5's `snippet()`
 * over them, quadratic in their ~7,800 matches each, was 5.6 s of its 5.9 s
 * (2026-10-25). Never indexed.
 */
const COPIED = "Below is the transcript of a coding-agent session, up to its last few turns.";

/**
 * The version of the rules {@link userAuthor} reads by: raised whenever
 * {@link INJECTED}, {@link TAGGED} or {@link COPIED} changes, so an index
 * re-reads who said what it already holds (fts5.ts `#reattribute`) instead
 * of being rebuilt.
 */
export const AUTHOR_RULES = 3;

/**
 * Who wrote a user turn's `text`, and the words to index for it; null for
 * a turn whose words are a copy of another session's ({@link COPIED}),
 * which is not indexed.
 */
export function userAuthor(text: string): { author: DocAuthor; text: string } | null {
  const said = text.replace(SYSTEM_REMINDER, "").trim();
  if (said.startsWith(COPIED)) {
    return null;
  }
  const tagged = CAWCO_TAG.exec(said)?.[1];
  if (tagged) {
    return { author: TAGGED[tagged] ?? "injected", text: said };
  }
  if (INJECTED.some((marker) => marker.test(said))) {
    return { author: "injected", text: said };
  }
  return { author: "owner", text: said };
}

function blocksToText(
  content: string | ContentBlock[] | undefined,
  options: ExtractOptions,
): { output: string; text: string; thinking: string; tools: string[] } {
  const tools: string[] = [];
  if (typeof content === "string") {
    return { text: content, thinking: "", tools, output: "" };
  }
  if (!Array.isArray(content)) {
    return { text: "", thinking: "", tools, output: "" };
  }
  const parts: string[] = [];
  const thoughts: string[] = [];
  const outputs: string[] = [];
  const outputCap = options.toolOutputChars ?? TOOL_OUTPUT_CHARS;
  for (const block of content) {
    switch (block.type) {
      case "text":
        parts.push(block.text as string);
        break;
      case "thinking":
        if (options.thinking !== false) {
          thoughts.push(block.thinking as string);
        }
        break;
      case "tool_use": {
        tools.push(block.name as string);
        const cap = options.toolInputBytes ?? 0;
        if (cap > 0) {
          try {
            parts.push(JSON.stringify(block.input).slice(0, cap));
          } catch {
            // circular or non-serializable input: skip
          }
        }
        break;
      }
      case "tool_result": {
        const words =
          outputCap > 0 ? resultWords(block.content).replace(SYSTEM_REMINDER, "").trim() : "";
        if (words) {
          outputs.push(words.slice(0, outputCap));
        }
        break;
      }
      default:
        break;
    }
  }
  return {
    text: parts.join("\n"),
    thinking: thoughts.join("\n"),
    tools,
    output: outputs.join("\n"),
  };
}

/**
 * The record types a document is made from, as the byte prefilter matches
 * them (scan.ts `typeFilter`): a `queued_command` is matched by its
 * attachment's own `type`, so no other attachment is parsed.
 */
export const DOC_TYPES = ["user", "assistant", "queued_command"] as const;

/**
 * A message that arrived while a turn ran, from Claude Code's `queued_command`
 * attachment ({@link AttachmentRecord}): a user turn whose author is read as
 * any user turn's, or null for any other attachment and for a meta command.
 */
function queuedDoc(record: AttachmentRecord, options: ExtractOptions): TranscriptDoc | null {
  const command = record.attachment;
  if (command?.type !== "queued_command" || command.isMeta === true) {
    return null;
  }
  const words = blocksToText(command.prompt, options);
  const said = userAuthor(words.text);
  if (!said?.text) {
    return null;
  }
  return {
    harness: "claude-code",
    sessionId: record.sessionId ?? "",
    id: record.uuid ?? "",
    role: "user",
    author: said.author,
    timestamp: command.timestamp ?? record.timestamp,
    text: said.text,
    cwd: record.cwd,
    sidechain: record.isSidechain === true ? true : undefined,
  };
}

/**
 * Extract a searchable document from a record, or null when the record has
 * no indexable text (tool_result-only user records, metadata records, a turn
 * that was only reminders, ...).
 */
export function extractDoc(
  record: TranscriptRecord,
  options: ExtractOptions = {},
): TranscriptDoc | null {
  if (record.type === "attachment") {
    return queuedDoc(record as AttachmentRecord, options);
  }
  if (record.type !== "user" && record.type !== "assistant") {
    return null;
  }
  const r = record as UserRecord | AssistantRecord;
  if (record.type === "user" && options.skipMeta !== false && (r as UserRecord).isMeta) {
    return null;
  }
  const message = r.message;
  if (!message) {
    return null;
  }
  const words = blocksToText(message.content, options);
  // A user record of tool results alone is the agent's tools answering, never the person.
  const said =
    record.type === "user" && (words.text.trim() || !words.output)
      ? userAuthor(words.text)
      : { author: "agent" as const, text: words.text.trim() };
  if (!said || (!said.text && !words.thinking && words.tools.length === 0 && !words.output)) {
    return null;
  }
  return {
    harness: "claude-code",
    sessionId: r.sessionId ?? "",
    id: r.uuid ?? "",
    role: record.type,
    author: said.author,
    timestamp: r.timestamp,
    text: said.text,
    ...(words.thinking ? { thinking: words.thinking } : {}),
    tools: words.tools.length > 0 ? words.tools.join(" ") : undefined,
    ...(words.output ? { output: words.output } : {}),
    cwd: r.cwd,
    model: record.type === "assistant" ? (message as { model?: string }).model : undefined,
    sidechain: r.isSidechain === true ? true : undefined,
  };
}
