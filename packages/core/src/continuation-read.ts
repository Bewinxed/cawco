/**
 * What a continuation reads of its source's transcript, extracted where the
 * transcript lives: the source's machine reads its stored messages and
 * answers {@link CONTROL_READ_CONTINUATION} with this alone (agent
 * session.ts), never the transcript itself, which runs to hundreds of
 * megabytes. Pure: it only decides what is taken.
 *
 * Scope is the source's live context: its last compaction summary and every
 * message after it — what its model holds now. From that scope, code takes:
 * - the tail, the newest user turns that fit {@link TAIL_CHARS}: only what was
 *   said, verbatim. No tool calls and no tool output: they are re-fetchable
 *   from disk and git, the artifact index already names every file and
 *   command, and a busy turn's calls ran to 200k characters of opening
 *   message ("clearing tool calls and results" is Anthropic's first example
 *   of superfluous context: anthropic.com/engineering/effective-context-engineering-for-ai-agents);
 * - the middle, every turn before the tail, with one line per tool call so
 *   the summariser can say what was done, which alone is summarised, in one
 *   pass.
 * The artifact index (files changed and read, commands run) is built from the
 * WHOLE transcript by code, so identifiers are copied, never paraphrased, and
 * what a compaction forgot about files is still there.
 */
import type { NeutralContentBlock, SessionMessage } from "./harness";
import { FILE_CHANGE_TOOLS, toolNamesOf } from "./tool-names";
import { askedWords } from "./transcript-rules";

/**
 * Machine-scoped catalog control: a session's continuation inputs
 * ({@link ContinuationRead}), read on the machine that stores its
 * transcript. Args: the session key, then `{ dir, askers }`: `askers`, the
 * short ids of the sessions whose hand-offs it was asked (a delegate's
 * parent), {@link ContinuationReadOptions}.
 */
export const CONTROL_READ_CONTINUATION = "readContinuation";

/** {@link CONTROL_READ_CONTINUATION}'s second argument. */
export interface ContinuationReadOptions {
  /** The short ids (eight characters) of the sessions whose hand-offs count as its asks: a delegate's parent. */
  askers?: string[];
  dir?: string;
}

/** What {@link CONTROL_READ_CONTINUATION} answers: a continuation's inputs, small whatever the transcript's size. */
export interface ContinuationRead {
  /** The live scope opens on a compaction summary. */
  compacted: boolean;
  /** How many stored messages each read held. */
  entries: { live: number; whole: number; scope: number };
  extracted: Extracted;
  /** The newest assistant turn's model; null when none recorded one. */
  model: string | null;
  /** The characters a model reads of the live scope ({@link scopeChars}). */
  scopeChars: number;
}

/**
 * A continuation's inputs from a session's stored messages: `live`, its
 * conversation as its harness reads it; `whole`, every stored message.
 */
export function readContinuation(
  live: SessionMessage[],
  whole: SessionMessage[],
  askers: readonly string[]
): ContinuationRead {
  const scope = liveScope(live);
  return {
    compacted: scope[0]?.compactSummary === true,
    entries: { live: live.length, whole: whole.length, scope: scope.length },
    extracted: extractTranscript(scope, whole, askers),
    model: transcriptModel(live) ?? null,
    scopeChars: scopeChars(scope),
  };
}

/** What code extracts from a transcript, before any model reads it. */
export interface Extracted {
  /** Files changed, files read, commands run — as plain text. */
  artifacts: string;
  /**
   * Every message the session was asked, over its whole transcript,
   * verbatim and oldest first ({@link askedWords}): the person's, and a
   * delegate's parent's brief and hand-offs. What a continuation from its
   * asks opens with, and all it carries.
   */
  asks: string[];
  /**
   * The uuid of the last transcript entry before the tail: how far a summary
   * of {@link middle} reaches. A summary made at another `covers` answers
   * for another conversation. Null when nothing comes before the tail.
   */
  covers: string | null;
  /** Everything before the tail, one string per user turn. */
  middle: string[];
  /** The newest user turns that fit the tail budget. */
  tail: string;
}

/** At most this many user turns at the end are carried into the new session… */
const TAIL_USER_TURNS = 6;
/** …and only as many of them as fit here, newest first; the newest always goes. */
const TAIL_CHARS = 16_000;
const ERROR_CHARS = 300;
const TOOL_ARGUMENT_CHARS = 300;
const FILES_CHANGED_SHOWN = 30;
const FILES_READ_SHOWN = 30;
const COMMANDS_SHOWN = 40;
/** Read tools by every harness's name, lowercased, as the transcript reads them (tool-names.ts); {@link FILE_CHANGE_TOOLS} the ones that change files. */
const READ_TOOLS = toolNamesOf("read");
/**
 * Shell calls are listed as commands, never read for the files they wrote:
 * a command's text holds `>` in a comparison, a commit message or a heredoc
 * as often as in a redirect, and every such read named files that never
 * existed. The git section is what changed on disk.
 */
const SHELL_TOOLS = toolNamesOf("bash");
/** Where each harness's file tools put the path. */
const PATH_ARGUMENTS = ["file_path", "filePath", "notebook_path", "path"];
/** The input fields that name what a tool call acted on, most telling first. */
const MAIN_ARGUMENTS = [
  ...PATH_ARGUMENTS,
  "command",
  "pattern",
  "url",
  "query",
  "skill",
  "target",
  "subject",
  "description",
  "prompt",
];
/** The files an apply-patch body names (`*** Update File: path`). */
const PATCH_FILE = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gmu;
const WHITESPACE = /\s+/gu;

interface StoredMessage {
  content: string | NeutralContentBlock[];
  model?: string;
  role: "user" | "assistant";
}

type ToolUse = Extract<NeutralContentBlock, { type: "tool_use" }>;
type ToolResult = Extract<NeutralContentBlock, { type: "tool_result" }>;

const messageOf = (entry: SessionMessage): StoredMessage =>
  entry.message as StoredMessage;

/**
 * A user or assistant entry's content blocks. A `system` entry carries a
 * frame (a failed turn's `result`, a notice), not a message, and has none.
 */
export const blocksOf = (entry: SessionMessage): NeutralContentBlock[] => {
  if (entry.type === "system") {
    return [];
  }
  const { content } = messageOf(entry);
  return typeof content === "string"
    ? [{ type: "text", text: content }]
    : content;
};

const clip = (text: string, limit: number): string =>
  text.length > limit
    ? `${text.slice(0, limit)}… [${text.length - limit} more chars]`
    : text;

const oneLine = (text: string, limit: number): string =>
  clip(text.trim().replace(WHITESPACE, " "), limit);

/** What a user entry says in words — empty for a tool-result-only entry. */
const userText = (entry: SessionMessage): string =>
  blocksOf(entry)
    .flatMap((block) => {
      if (block.type === "text") {
        return [block.text];
      }
      return block.type === "image" ? ["[image]"] : [];
    })
    .join("\n")
    .trim();

const resultText = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part: { type?: string; text?: string }) =>
        part.type === "text" ? (part.text ?? "") : `[${part.type}]`
      )
      .join("\n");
  }
  return JSON.stringify(content);
};

const stringField = (
  input: Record<string, unknown>,
  keys: readonly string[]
): string | undefined => {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

/** The files one change call touched: its path, or every file a patch names. */
const changedPaths = (call: ToolUse): string[] => {
  const path = stringField(call.input, PATH_ARGUMENTS);
  if (path) {
    return [path];
  }
  const patch = stringField(call.input, ["patchText", "patch", "input"]);
  return patch
    ? [...patch.matchAll(PATCH_FILE)].map((match) => match[1].trim())
    : [];
};

const mainArgument = (input: Record<string, unknown>): string => {
  const value = stringField(input, MAIN_ARGUMENTS);
  return value ? oneLine(value, TOOL_ARGUMENT_CHARS) : "";
};

/** The newest assistant turn's model, for a session whose row never recorded one. */
export const transcriptModel = (
  entries: SessionMessage[]
): string | undefined => {
  const last = entries.findLast(
    (entry) => entry.type === "assistant" && messageOf(entry).model
  );
  return last ? messageOf(last).model : undefined;
};

/** Every tool result, by the id of the call it answers. */
const resultsOf = (entries: SessionMessage[]): Map<string, ToolResult> => {
  const results = new Map<string, ToolResult>();
  for (const block of entries.flatMap(blocksOf)) {
    if (block.type === "tool_result") {
      results.set(block.tool_use_id, block);
    }
  }
  return results;
};

/** What the artifact index has gathered so far. */
interface Artifacts {
  changed: Map<string, number>;
  commands: string[];
  read: Map<string, number>;
}

/** Counts one more touch of `path`; re-inserting keeps the map in last-touch order. */
const touch = (touched: Map<string, number>, path: string) => {
  const count = (touched.get(path) ?? 0) + 1;
  touched.delete(path);
  touched.set(path, count);
};

/** Files `call` changed or read, or the command it ran and how that went. */
function noteArtifact(
  artifacts: Artifacts,
  call: ToolUse,
  result: ToolResult | undefined
): void {
  const kind = call.name.toLowerCase();
  if (FILE_CHANGE_TOOLS.has(kind)) {
    for (const path of changedPaths(call)) {
      touch(artifacts.changed, path);
    }
    return;
  }
  const path = stringField(call.input, PATH_ARGUMENTS);
  if (READ_TOOLS.has(kind) && path) {
    touch(artifacts.read, path);
    return;
  }
  const command = stringField(call.input, ["command"]);
  if (SHELL_TOOLS.has(kind) && command) {
    const outcome = result?.is_error
      ? `failed: ${oneLine(resultText(result.content), ERROR_CHARS)}`
      : "ok";
    artifacts.commands.push(
      `- \`${oneLine(command, TOOL_ARGUMENT_CHARS)}\` — ${outcome}`
    );
  }
}

/** Files changed, files read and commands run, over the whole session. */
function artifactIndex(entries: SessionMessage[]): string {
  const results = resultsOf(entries);
  const artifacts: Artifacts = {
    changed: new Map(),
    read: new Map(),
    commands: [],
  };
  for (const entry of entries) {
    if (entry.type !== "assistant") {
      continue;
    }
    for (const block of blocksOf(entry)) {
      if (block.type === "tool_use") {
        noteArtifact(artifacts, block, results.get(block.id));
      }
    }
  }
  const files = (touched: Map<string, number>, limit: number) =>
    [...touched]
      .reverse()
      .slice(0, limit)
      .map(([path, count]) => `- ${path} (${count}×)`);
  const section = (title: string, lines: string[]) => [
    `### ${title}`,
    ...(lines.length ? lines : ["- none"]),
  ];
  return [
    ...section(
      `Files changed by edit tools (${FILES_CHANGED_SHOWN} most recent, with number of changes; the git section has the rest)`,
      files(artifacts.changed, FILES_CHANGED_SHOWN)
    ),
    "",
    ...section(
      `Files read (${FILES_READ_SHOWN} most recent, with number of reads)`,
      files(artifacts.read, FILES_READ_SHOWN)
    ),
    "",
    ...section(
      `Commands run (last ${COMMANDS_SHOWN}, oldest first)`,
      artifacts.commands.slice(-COMMANDS_SHOWN)
    ),
  ].join("\n");
}

/** How the source's own compaction summary is labelled wherever it appears. */
const COMPACTED_LABEL =
  "## Earlier in this session (compacted by the source session)";

/**
 * One tool call as a reader of the transcript sees it: one line naming what
 * it acted on, and the head of its error if it failed. Never its output.
 */
function callLines(call: ToolUse, result: ToolResult | undefined): string[] {
  const argument = mainArgument(call.input);
  return [
    `→ ${call.name}${argument ? `: ${argument}` : ""}`,
    ...(result?.is_error
      ? [`✗ ${oneLine(resultText(result.content), ERROR_CHARS)}`]
      : []),
  ];
}

/**
 * What one assistant entry said, as lines — and, with `calls`, what it did,
 * one line per tool call.
 */
const assistantLines = (
  entry: SessionMessage,
  results: Map<string, ToolResult>,
  calls: boolean
): string[] =>
  blocksOf(entry).flatMap((block) => {
    if (block.type === "text") {
      return block.text.trim() ? [block.text.trim()] : [];
    }
    return calls && block.type === "tool_use"
      ? callLines(block, results.get(block.id))
      : [];
  });

/**
 * One turn — a user message and everything up to the next. The source's
 * compaction summary is its own turn, verbatim under its label. `calls` for
 * the summariser's reading; without, for the new session's.
 */
function renderTurn(
  turn: SessionMessage[],
  results: Map<string, ToolResult>,
  calls: boolean
): string {
  const lines: string[] = [];
  let speaker: string | null = null;
  const say = (heading: string, said: string[]) => {
    if (said.length === 0) {
      return;
    }
    if (speaker !== heading) {
      lines.push(heading);
      speaker = heading;
    }
    lines.push(...said);
  };
  for (const entry of turn) {
    if (entry.compactSummary) {
      say(COMPACTED_LABEL, [
        blocksOf(entry)
          .flatMap((block) => (block.type === "text" ? [block.text] : []))
          .join("\n")
          .trim(),
      ]);
    } else if (entry.type === "user") {
      const text = userText(entry);
      say("## User", text ? [text] : []);
    } else if (entry.type === "assistant") {
      say("## Assistant", assistantLines(entry, results, calls));
    }
  }
  return lines.join("\n");
}

/**
 * The characters a model reads of these messages: text, thinking, tool input
 * and tool output. Images are left out — their base64 is not what a model is
 * billed for, and counting it would size a screenshot as a novel.
 */
export const scopeChars = (entries: SessionMessage[]): number =>
  entries.flatMap(blocksOf).reduce((sum, block) => {
    switch (block.type) {
      case "text":
        return sum + block.text.length;
      case "thinking":
        return sum + block.thinking.length;
      case "tool_use":
        return sum + JSON.stringify(block.input).length;
      case "tool_result":
        return sum + resultText(block.content).length;
      case "image":
      case "redacted_thinking":
        break;
    }
    return sum;
  }, 0);

/** The session's own messages: a subagent's (opencode nests them in) are its business. */
const ownMessages = (entries: SessionMessage[]): SessionMessage[] =>
  entries.filter((entry) => !entry.parent_tool_use_id);

/**
 * What the session's model holds now: its last compaction summary and every
 * message after it — or everything, for a session never compacted. A harness
 * that kept a tail from before the compaction (pi) stores the summary where
 * the compaction happened and names where that tail begins
 * (`SessionMessage.keptFrom`): the summary, then the tail, then what followed.
 */
export function liveScope(entries: SessionMessage[]): SessionMessage[] {
  const own = ownMessages(entries);
  const last = own.findLastIndex((entry) => entry.compactSummary);
  if (last < 0) {
    return own;
  }
  const summary = own[last];
  const kept = summary.keptFrom
    ? own.findIndex((entry) => entry.uuid === summary.keptFrom)
    : last;
  return [summary, ...own.slice(kept, last), ...own.slice(last + 1)];
}

/**
 * The three parts: middle and tail from the live scope, the artifact index
 * from the whole transcript (both oldest first, as a machine answers them).
 */
export function extractTranscript(
  scope: SessionMessage[],
  whole: SessionMessage[],
  askers: readonly string[]
): Extracted {
  const results = resultsOf(scope);
  const turns: SessionMessage[][] = [];
  for (const entry of scope) {
    const current = turns.at(-1);
    const opens =
      !current ||
      current[0].compactSummary ||
      entry.compactSummary ||
      (entry.type === "user" && userText(entry));
    if (opens) {
      turns.push([entry]);
    } else {
      current.push(entry);
    }
  }
  const said = turns.map((turn) => renderTurn(turn, results, false));
  // The tail grows back from the newest turn while it fits; what does not fit
  // is the summariser's to read.
  let split = said.length;
  let size = 0;
  while (split > Math.max(0, said.length - TAIL_USER_TURNS)) {
    const next = size + said[split - 1].length;
    if (split < said.length && next > TAIL_CHARS) {
      break;
    }
    size = next;
    split -= 1;
  }
  return {
    artifacts: artifactIndex(ownMessages(whole)),
    asks: ownMessages(whole).flatMap(
      (entry) => askedWords(entry, askers) ?? []
    ),
    covers: turns[split - 1]?.at(-1)?.uuid ?? null,
    middle: turns
      .slice(0, split)
      .map((turn) => renderTurn(turn, results, true))
      .filter(Boolean),
    tail: said.slice(split).filter(Boolean).join("\n\n"),
  };
}
