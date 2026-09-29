/**
 * "Continue in new session": what is extracted from a transcript, what the
 * summariser reads, and what the new session opens with. Pure — the hub reads
 * the transcript and runs the sessions; this file only decides the words.
 *
 * Scope is the source's live context: its last compaction summary and every
 * message after it — what its model holds now. From that scope, code takes:
 * - the tail, the last user turns verbatim with their tool calls and output;
 * - the middle, everything before the tail with old tool output hidden (it is
 *   re-fetchable from disk and git), which alone is summarised, in one pass.
 * The artifact index (files changed and read, commands run) is built from the
 * WHOLE transcript by code, so identifiers are copied, never paraphrased, and
 * what a compaction forgot about files is still there.
 */
import {
  type EffortLevel,
  type GitChanges,
  type HarnessKind,
  type NeutralContentBlock,
  type PermissionMode,
  type SessionMessage,
  SUMMARY_CAP_TOKENS,
} from "@whiffle/core";

/** The session being continued, as the header names it. */
export interface ContinuationSource {
  cwd: string;
  harness: HarnessKind;
  instanceId: string;
  model: string;
  title: string;
}

/** What "continue in new session" is asked: who summarises, what starts. */
export interface ContinueRequest {
  note?: string;
  summarizer: { harness: HarnessKind; model: string };
  /** The same options a dashboard spawn sends; machine and cwd default to the source's. */
  target: {
    bootstrap?: { repo: string; baseDir: string };
    cwd?: string;
    effort?: EffortLevel;
    harness: HarnessKind;
    machineId?: string;
    model: string;
    permissionMode?: PermissionMode;
    projectId?: string;
    scratch?: { worktree?: boolean; baseCwd?: string };
  };
}

/**
 * A continuation's inputs as read when it was asked for: the source, what was
 * extracted from it, the summariser's prompt (none when there is nothing
 * before the tail) and the sizes the fit was judged by. Kept with the job, so
 * a job resumed after a restart hands on exactly what it was started with.
 */
export interface PreparedContinuation {
  compacted: boolean;
  entries: { live: number; whole: number; scope: number };
  extracted: Extracted;
  liveContextTokens: number;
  openingTokens: number;
  prompt: string | undefined;
  source: ContinuationSource & { machineId: string };
  summariseInputTokens: number;
}

/** What code extracts from a transcript, before any model reads it. */
export interface Extracted {
  /** Files changed, files read, commands run — as plain text. */
  artifacts: string;
  /** Everything before the tail, one string per user turn. */
  middle: string[];
  /** The last user turns, verbatim. */
  tail: string;
}

/** User turns at the end carried verbatim into the new session. */
const TAIL_USER_TURNS = 6;
const TAIL_OUTPUT_CHARS = 2000;
const ERROR_CHARS = 300;
const TOOL_ARGUMENT_CHARS = 300;
const FILES_READ_SHOWN = 30;
const COMMANDS_SHOWN = 40;
/**
 * Tool names by what they do, across harnesses (lowercased): claude
 * (`Write`, `Edit`, `MultiEdit`, `NotebookEdit`, `Read`, `Bash`), opencode
 * (`write`, `edit`, `patch`, `read`, `bash`) and pi (`write`, `edit`,
 * `read`, `bash`).
 */
const CHANGE_TOOLS = new Set([
  "write",
  "edit",
  "multiedit",
  "notebookedit",
  "patch",
  "apply_patch",
]);
const READ_TOOLS = new Set(["read"]);
const SHELL_TOOLS = new Set(["bash"]);
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
const PATCH_FILE = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm;
const WHITESPACE = /\s+/g;
/**
 * Files a shell command wrote, as the command text names them: an output
 * redirect (`>`/`>>`, heredocs included), `tee`, and Python's
 * `open("path", "w"|"a")`. A write through a variable holds no path to copy.
 */
const SHELL_WRITES = [
  /(?:^|[^<>&\d])>>?\s*(?!&)(["']?)([\w./~@+-][^\s;&|<>"'()]*)\1/g,
  /\btee\s+(?:-a\s+)?(["']?)([\w./~@+-][^\s;&|<>"'()]*)\1/g,
  /\bopen\(\s*(["'])([^"']+)\1\s*,\s*["'][wa]/g,
];
/** `sed -i` edits the files its last arguments name. */
const SED_IN_PLACE =
  /\bsed\s+-i\S*\s+(?:-e\s+)?(?:'[^']*'|"[^"]*"|\S+)\s+([^;&|<>]+)/g;
/** One file of a git diffstat (`path | 12 ++--`), as git answers `--stat`. */
const DIFFSTAT_FILE = /^\s*(\S+)\s+\|\s+(?:\d+|Bin)/gm;
const NOT_FILES = new Set(["/dev/null", "/dev/stderr", "/dev/stdout"]);

/** The files a shell command changed, by its text and by the git output it printed. */
function shellChanges(command: string, output: string): string[] {
  const paths = [
    ...SHELL_WRITES.flatMap((pattern) =>
      [...command.matchAll(pattern)].map((match) => match[2])
    ),
    ...[...command.matchAll(SED_IN_PLACE)].flatMap((match) =>
      match[1].trim().split(WHITESPACE)
    ),
    ...(command.includes("git ")
      ? [...output.matchAll(DIFFSTAT_FILE)].map((match) => match[1])
      : []),
  ];
  return paths.filter((path) => path && !NOT_FILES.has(path));
}

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
const blocksOf = (entry: SessionMessage): NeutralContentBlock[] => {
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
  if (CHANGE_TOOLS.has(kind)) {
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
    for (const changed of shellChanges(
      command,
      result ? resultText(result.content) : ""
    )) {
      touch(artifacts.changed, changed);
    }
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
      "Files changed (most recent first, with number of changes; by edit tools, shell writes and git diffstats)",
      files(artifacts.changed, artifacts.changed.size)
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

/** Lines of git output the artifact index carries before it says how many it cut. */
const GIT_LINES_SHOWN = 200;

/**
 * The artifact index's git section: what git itself says changed in the
 * source's directory since the session started — ground truth for edits no
 * tool call names (a heredoc, a script, a build). Verbatim, capped.
 */
export function gitSection(changes: GitChanges, since: string): string {
  const title = "### Git changes since this session started";
  if (!changes.repo) {
    return `${title}\nnot a git repository`;
  }
  const lines = [
    "$ git status --porcelain",
    ...(changes.status.trim()
      ? changes.status.trimEnd().split("\n")
      : ["(clean)"]),
    "",
    `$ git log --since=${since} --name-status --format='%h %s'`,
    ...(changes.log.trim()
      ? changes.log.trimEnd().split("\n")
      : ["(no commits)"]),
  ];
  const shown = lines.slice(0, GIT_LINES_SHOWN);
  return [
    title,
    "```",
    ...shown,
    ...(lines.length > shown.length
      ? [
          `… ${lines.length - shown.length} more lines cut (${lines.length} in total)`,
        ]
      : []),
    "```",
  ].join("\n");
}

/** How the source's own compaction summary is labelled wherever it appears. */
const COMPACTED_LABEL =
  "## Earlier in this session (compacted by the source session)";

/**
 * One tool call as the new session reads it. Verbatim (the tail): the call's
 * input and its output, each cut at 2000 characters. Otherwise (the middle):
 * one line naming what it acted on, and the head of its error if it failed.
 */
function callLines(
  call: ToolUse,
  result: ToolResult | undefined,
  verbatim: boolean
): string[] {
  if (verbatim) {
    return [
      `→ ${call.name}: ${clip(JSON.stringify(call.input), TAIL_OUTPUT_CHARS)}`,
      ...(result
        ? [
            `${result.is_error ? "✗" : "←"} ${clip(resultText(result.content), TAIL_OUTPUT_CHARS)}`,
          ]
        : []),
    ];
  }
  const argument = mainArgument(call.input);
  return [
    `→ ${call.name}${argument ? `: ${argument}` : ""}`,
    ...(result?.is_error
      ? [`✗ ${oneLine(resultText(result.content), ERROR_CHARS)}`]
      : []),
  ];
}

/** What one assistant entry said and did, as lines. */
const assistantLines = (
  entry: SessionMessage,
  results: Map<string, ToolResult>,
  verbatim: boolean
): string[] =>
  blocksOf(entry).flatMap((block) => {
    if (block.type === "text") {
      return block.text.trim() ? [block.text.trim()] : [];
    }
    return block.type === "tool_use"
      ? callLines(block, results.get(block.id), verbatim)
      : [];
  });

/**
 * One turn — a user message and everything up to the next. The source's
 * compaction summary is its own turn, verbatim under its label.
 */
function renderTurn(
  turn: SessionMessage[],
  results: Map<string, ToolResult>,
  verbatim: boolean
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
      say("## Assistant", assistantLines(entry, results, verbatim));
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
      default:
        return sum;
    }
  }, 0);

/** The session's own messages: a subagent's (opencode nests them in) are its business. */
const ownMessages = (entries: SessionMessage[]): SessionMessage[] =>
  entries.filter((entry) => !entry.parent_tool_use_id);

/**
 * What the session's model holds now: its last compaction summary and every
 * message after it — or everything, for a session never compacted.
 */
export function liveScope(entries: SessionMessage[]): SessionMessage[] {
  const own = ownMessages(entries);
  const last = own.findLastIndex((entry) => entry.compactSummary);
  return last < 0 ? own : own.slice(last);
}

/**
 * The three parts: middle and tail from the live scope, the artifact index
 * from the whole transcript (both oldest first, as a machine answers them).
 */
export function extractTranscript(
  scope: SessionMessage[],
  whole: SessionMessage[]
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
  const split = Math.max(0, turns.length - TAIL_USER_TURNS);
  return {
    artifacts: artifactIndex(ownMessages(whole)),
    middle: turns
      .slice(0, split)
      .map((turn) => renderTurn(turn, results, false))
      .filter(Boolean),
    tail: turns
      .slice(split)
      .map((turn) => renderTurn(turn, results, true))
      .filter(Boolean)
      .join("\n\n"),
  };
}

const SECTIONS = [
  "## Goal and constraints",
  "(the user's stated requirements, quoted verbatim where short)",
  "## Decisions and reasons",
  "## Tried and rejected, and why",
  "## Current state",
  "## Open items and next step",
];

/**
 * What a session's last turn answered with, as its transcript stores it: the
 * text blocks of the assistant entries after the last user entry (the prompt,
 * or the last tool result), in order — once that turn has ended
 * ({@link SessionMessage.turnEnd}); before then, nothing. Read from storage
 * because a harness's live frames can repeat what they carry (opencode
 * streams a block's text as it grows), and because the transcript is the one
 * record of an answer that finished while the hub was not listening.
 */
export function finishedAnswer(entries: SessionMessage[]): string | undefined {
  let start = entries.length;
  while (start > 0 && entries[start - 1].type !== "user") {
    start -= 1;
  }
  const answer = entries
    .slice(start)
    .filter((entry) => entry.type === "assistant");
  // Only a turn its model ended: one still being written, stopped on a tool
  // call, or cut short has no answer yet.
  if (!answer.at(-1)?.turnEnd) {
    return undefined;
  }
  const text = answer
    .flatMap((entry) =>
      blocksOf(entry).flatMap((block) =>
        block.type === "text" ? [block.text] : []
      )
    )
    .join("\n\n")
    .trim();
  return text || undefined;
}

/** What the summariser is asked, in one pass: the middle first, instructions last. */
export function summariserPrompt(
  middle: string[],
  note: string | undefined
): string {
  return [
    "Below is the transcript of a coding-agent session, up to its last few turns. Old tool output is hidden; failed calls keep the head of their error. A section labelled as compacted by the source session is that session's own earlier summary.",
    "",
    "<transcript>",
    middle.join("\n\n"),
    "</transcript>",
    "",
    "Use no tools. Reply only with the summary.",
    "",
    `Write a summary under ${SUMMARY_CAP_TOKENS.toLocaleString("en")} tokens with exactly these sections as markdown headings, in this order:`,
    ...SECTIONS,
    "",
    "Be literal and specific. Keep file paths, commands, ids, URLs and error text verbatim. Write no preamble and no closing remarks.",
    ...(note ? ["", `Focus: ${note}`] : []),
  ].join("\n");
}

/** The new session's first message, in the order it should be read. */
export function openingMessage(
  source: ContinuationSource,
  summary: string | undefined,
  extracted: Extracted,
  note: string | undefined
): string {
  return [
    `Continuing session "${source.title}" (instance ${source.instanceId}, ${source.harness}, ${source.model}, in ${source.cwd}).`,
    "",
    "Before acting, run `git status` and `git diff --stat` to confirm the current state; the summary below may be stale.",
    "",
    "## Summary of the session before its last turns",
    summary ?? "(the session is short: its last turns below are all of it)",
    "",
    "## Artifact index",
    extracted.artifacts,
    "",
    "## The last turns, verbatim",
    extracted.tail,
    ...(note ? ["", `Next: ${note}`] : []),
  ].join("\n");
}
