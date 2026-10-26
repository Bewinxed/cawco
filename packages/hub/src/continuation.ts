/**
 * "Continue in new session": what the summariser reads and what the new
 * session opens with. Pure — the hub runs the sessions, and the source's
 * machine extracts what a continuation takes from its transcript (core
 * continuation-read.ts); this file only decides the words.
 */
import {
  blocksOf,
  type EffortLevel,
  type Extracted,
  type GitChanges,
  type HarnessKind,
  type PermissionMode,
  type SendAttachment,
  type SendPayload,
  type SessionMessage,
  SUMMARY_CAP_TOKENS,
} from "@cawco/core";

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
  /**
   * The new session opens on the messages it was asked alone (the
   * person's, and a delegate's parent's brief and hand-offs:
   * {@link Extracted.asks}), verbatim and in order ({@link asksOpening}):
   * nothing is summarised, and nothing the agent said or did is carried.
   */
  asksOnly?: true;
  /**
   * What rides the new session's opening message beside its words, as a
   * send carries it: texts and the hub's files, and images (base64). Kept
   * with the job until the opening goes; the summariser never sees them.
   */
  attachments?: SendAttachment[];
  images?: SendPayload["images"];
  note?: string;
  /**
   * Who writes the summary; absent only with {@link asksOnly}, which writes
   * none. Absent `model`: the harness's own default. Absent `account`:
   * placed as any start is.
   */
  summarizer?: { harness: HarnessKind; model?: string; account?: string };
  /** The same options a dashboard spawn sends; machine and cwd default to the source's. */
  target: {
    /** The account it runs on; absent, placed as any start is. */
    account?: string;
    bootstrap?: { repo: string; baseDir: string };
    cwd?: string;
    effort?: EffortLevel;
    harness: HarnessKind;
    machineId?: string;
    /** Absent: the harness's own default. */
    model?: string;
    /** The mode asked for; settled with the fallback by the hub's one rule (`settleMode`). */
    permissionMode?: PermissionMode;
    /** The caller's own mode, taken when none is asked and the harness has modes. */
    fallbackPermissionMode?: PermissionMode;
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
 * or the last tool result), in order — once that turn has ended; before then,
 * nothing. `ended` is the live word that it has (the turn's `result` frame);
 * without it, the transcript's own {@link SessionMessage.turnEnd} must say so,
 * as it must for an answer that finished while the hub was not listening. A
 * harness writes that mark after the frame goes out (opencode stamps the
 * message complete a beat later), so a reader that just saw the frame must not
 * wait on it. Read from storage because a harness's live frames can repeat
 * what they carry (opencode streams a block's text as it grows).
 */
export function finishedAnswer(
  entries: SessionMessage[],
  ended: boolean
): string | undefined {
  let start = entries.length;
  while (start > 0 && entries[start - 1].type !== "user") {
    start -= 1;
  }
  const answer = entries
    .slice(start)
    .filter((entry) => entry.type === "assistant");
  // Only a turn its model ended: one still being written, stopped on a tool
  // call, or cut short has no answer yet.
  if (!(ended || answer.at(-1)?.turnEnd)) {
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

/**
 * The new session's first message, in the order it should be read. `open`:
 * the source's Open items section (open-items.ts), built from its records
 * as the opening is sent; absent while sizing, before anything is filed.
 */
export function openingMessage(
  source: ContinuationSource,
  summary: string | undefined,
  extracted: Extracted,
  note: string | undefined,
  open?: string
): string {
  return [
    `Continuing session "${source.title}" (instance ${source.instanceId}, ${source.harness}, ${source.model}, in ${source.cwd}).`,
    "",
    "Before acting, run `git status` and `git diff --stat` to confirm the current state; the summary below may be stale.",
    "",
    "## Summary of the session before its last turns",
    summary ?? "(the session is short: its last turns below are all of it)",
    ...(open ? ["", open] : []),
    "",
    "## Artifact index",
    extracted.artifacts,
    "",
    "## The last turns, verbatim",
    extracted.tail,
    ...(note ? ["", `Next: ${note}`] : []),
  ].join("\n");
}

/** The heading each message it was asked goes under in {@link asksOpening}. */
const askHeading = (at: number): string => `## Message ${at + 1}`;

/**
 * The new session's first message when it restarts from its asks: every
 * message the source was asked (the person's, and a delegate's parent's
 * brief and hand-offs), verbatim and in order, then the
 * source's Open items section (`open`, from its records), and none of what
 * its agent said or did.
 */
export function asksOpening(
  source: ContinuationSource,
  asks: string[],
  note: string | undefined,
  open?: string
): string {
  return [
    `Restarting session "${source.title}" (instance ${source.instanceId}, ${source.harness}, ${source.model}, in ${source.cwd}) from the messages it was asked: every one the person sent it, and a delegate's every brief and hand-off from its parent, verbatim and in order, then the open items it filed in its records. Nothing else its agent said or did is carried. Some of that work may already be on disk: run \`git status\` and \`git log\` before acting.`,
    ...asks.flatMap((ask, at) => ["", askHeading(at), ask]),
    ...(open ? ["", open] : []),
    ...(note ? ["", `Next: ${note}`] : []),
  ].join("\n");
}
