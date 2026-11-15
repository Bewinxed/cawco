/**
 * "Continue in new session": what the summariser reads and what the new
 * session opens with. Pure — the hub runs the sessions, and the source's
 * machine extracts what a continuation takes from its transcript (core
 * continuation-read.ts); this file only decides the words.
 */
import { SUMMARY_CAP_TOKENS } from "@cawco/core/continuation";
import { blocksOf, type Extracted } from "@cawco/core/continuation-read";
import type { GitChanges } from "@cawco/core/session/controls";
import type { SessionMessage } from "@cawco/core/session-messages";
import type { ContinuationSource } from "./db/stored-types";
import { passedValue, type Redacted, type Typed } from "./redactor";

/** Lines of git output the artifact index carries before it says how many it cut. */
const GIT_LINES_SHOWN = 200;

/**
 * The artifact index's git section: what git itself says changed in the
 * source's directory since the session started — ground truth for edits no
 * tool call names (a heredoc, a script, a build). Verbatim, capped.
 */
export function gitSection(changes: GitChanges, since: string): string {
  const title = "### Git changes since this session started";
  if (changes.repo === false) {
    return `${title}\nnot a git repository`;
  }
  if (changes.repo === "unread") {
    return `${title}\n${
      changes.limitMs === undefined
        ? `git ${changes.command} failed (exit ${changes.exitCode}) in this folder`
        : `git ${changes.command} did not answer within ${changes.limitMs / 1000} s in this folder`
    }`;
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
  "(the user's stated requirements, in plain words, never quoting them)",
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
    "Below is the transcript of a coding-agent session, up to its last few turns. Tool calls and their results are kept, each clipped to its head and tail. A section labelled as compacted by the source session is that session's own earlier summary.",
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
 * The tail's parts, turn by turn, as one side holds them: its own part's
 * words where it said that part, null where the other side did. The two
 * sides of one tail have the same shape.
 */
export type TailSide = (string | null)[][];

/**
 * What of a continuation's opening its agents wrote: the summariser's
 * summary of the source (absent while the session is short enough to carry
 * whole), the artifact index (its tool calls and git), its Open items
 * section (open-items.ts, from the records it filed; absent while sizing,
 * before anything is filed), and every part of the last turns that is not
 * the person's own words (`tail`: the agent's replies, a parent's brief or
 * hand-off, the hub's word). One session's words reaching another: only as
 * the redactor passed them (redactor.ts).
 */
export interface AgentOpening {
  artifacts: string;
  open?: string;
  summary?: string;
  tail: TailSide;
}

/**
 * What of a continuation's opening is the person's own: the messages they
 * typed among the last turns (`tail`) and their note, carried whole.
 */
export interface PersonOpening {
  note: string | undefined;
  tail: TailSide;
}

/**
 * The tail's two sides (core `Extracted.tailTurns`): the agents' words,
 * for the redactor, and the person's, whole. A machine whose agent predates
 * `tailTurns` says only the tail's text, whose speakers it does not tell
 * apart: all of it is then the agents' side, cut where it holds a
 * credential.
 */
export const tailSides = (
  extracted: Pick<Extracted, "tail" | "tailTurns">
): { agent: TailSide; person: TailSide } => {
  const turns = extracted.tailTurns ?? [
    [{ who: "agent" as const, text: extracted.tail }],
  ];
  return {
    agent: turns.map((parts) =>
      parts.map((part) => (part.who === "agent" ? part.text : null))
    ),
    person: turns.map((parts) =>
      parts.map((part) => (part.who === "person" ? part.text : null))
    ),
  };
};

/**
 * The new session's first message, in the order it should be read: the
 * agents' part (`agent`, which only the redactor makes) and the person's
 * (`person`, whole), put together here alone, the last turns interleaved
 * back in the order they were said.
 */
export function openingMessage<F extends Redacted<AgentOpening>>(
  source: ContinuationSource,
  agent: Typed<F>,
  person: PersonOpening
): string {
  const { summary, open, artifacts, tail: agentTail } = passedValue(agent);
  const { tail: personTail, note } = person;
  const tail = agentTail
    .map((parts, turn) =>
      parts
        .map((said, part) => said ?? personTail[turn]?.[part] ?? "")
        .join("\n")
    )
    .join("\n\n");
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
    artifacts,
    "",
    "## The last turns, verbatim",
    tail,
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
