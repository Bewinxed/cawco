/**
 * What the hub says on a task when a landed attempt's acceptance criteria
 * are judged (hub dispatch.ts `judgeCriteria`), what the judge reads of the
 * work (hub dispatch.ts `attemptWork`), and how the task then shows that
 * attempt (hub tasks.ts `endedHowOf`).
 */
import { shortSha } from "../short-id";

/** A sentence's end. */
const ENDED = /[.!?]$/u;

/** The head of Jev's comment over the lines it did not show met. */
const NOT_SHOWN_MET = "Not shown met:";

/** A signed count of lines: `+12`, `−3`. */
const signed = (sign: "+" | "−", count: number): string => `${sign}${count}`;

export const judgedWords = {
  /** A brief's comments, cut to the newest: how many older ones it leaves out. */
  olderComments: (count: number): string =>
    `${count} older ${count === 1 ? "comment is" : "comments are"} in the task file.`,
  /** Jev's comment on the task: the lines it did not show met, one `- ` line each. */
  notShownMet: (attempt: string, lines: string): string =>
    `Jev judged the acceptance criteria against the work of ${attempt}. ${NOT_SHOWN_MET}\n\n${lines}`,
  /** Its head, as the comment reads it. */
  notShownMetHead: NOT_SHOWN_MET,
  /**
   * Jev did not show these met over a diff cut to fit its window (`cut`, a
   * sentence): what was left out may show them, so they are not judged and
   * the task stays where it is. Never sent back unmet for that.
   */
  cutHides: (attempt: string, cut: string, lines: string, stage: string) =>
    `Jev judged the acceptance criteria against the work of ${attempt}, its diff cut to fit what Jev reads. ${cut} These were not shown met, and what the cut left out may show them, so they are not judged and the task stays in ${stage}:\n\n${lines}`,
  /**
   * The one line the session an attempt reports to hears after its landed
   * work was judged and lines were left: `task` (a link) stays in `stage`
   * with `criteria` not judged, or its attempt counts as failed with them
   * not shown met (`stage` undefined). Its next step: move the task on or
   * retry it.
   */
  toldStarter: (
    task: string,
    criteria: readonly string[],
    stage?: string
  ): string => {
    const lines = `${criteria.length} acceptance ${criteria.length === 1 ? "line" : "lines"}`;
    const listed = criteria.map((each) => `“${each}”`).join("; ");
    return stage === undefined
      ? `${task}: Jev did not show ${lines} met (${listed}), so its attempt counts as failed. task_retry starts it again.`
      : `${task} stays in ${stage}: Jev left ${lines} not judged (${listed}). Judge them and move the task with task_update, or task_retry it.`;
  },
  /** How an attempt sent back unmet ended, beside it on the task. */
  unmetHow: "Jev did not show its acceptance criteria met",
  /** Jev did not answer (`failed`, its words, a sentence): the work stays landed, the task where it is. */
  notJudged: (failed: string, attempt: string, stage: string): string =>
    `${failed.trim()}${ENDED.test(failed.trim()) ? "" : "."} The work of ${attempt} stays landed, and the task stays in ${stage} with its acceptance criteria not judged.`,

  // --- The work judged ------------------------------------------------------------

  /** The landed diff could not be read (`why`): said as {@link judgedWords.notJudged}'s `failed`. */
  diffUnread: (attempt: string, why: string): string =>
    `The diff ${attempt} landed could not be read: ${why.trim()}`,
  /** Why: the landing's record on its work item does not read. */
  landingUnread:
    "its landing's record does not read, so which commits it landed is not known",
  /** Why: the attempt's workspace is not on record. */
  noWorkspace: "its workspace is not on record",
  /** Why: the machine its workspace's checkout is on is not connected. */
  machineAway: "the machine its checkout is on is not connected",
  /** Why: git answered with no diff in what it said. */
  diffUnsaid: "git's answer held no diff",
  /** Why: git failed and said nothing. */
  gitExited: (code: number): string => `git exited ${code}`,
  /** Why: origin, fetched, does not hold the landed commit. */
  notOnOrigin: (sha: string): string =>
    `origin does not hold commit ${shortSha(sha)}`,
  /** Why: a pushed branch shares no history with its base. */
  noSharedHistory: (sha: string, base: string): string =>
    `commit ${shortSha(sha)} shares no history with origin/${base}`,
  /** The diff's heading: what was diffed, `from..sha`. */
  diffHead: (range: string): string => `The diff it landed (${range}):`,
  /** A landing that changed no file. */
  diffEmpty: "It changed no file.",
  /**
   * What a diff cut to fit leaves out: `left` of `files` files, their lines
   * added and removed, the first of their paths named and how many more.
   */
  diffCut: (cut: {
    added: number;
    files: number;
    left: number;
    more: number;
    paths: readonly string[];
    removed: number;
  }): string =>
    `${cut.left} of ${cut.files} changed files are left out of this diff (${signed("+", cut.added)} ${signed("−", cut.removed)} lines), cut to fit: ${cut.paths.join(", ")}${cut.more > 0 ? `, and ${cut.more} more` : ""}.`,
  /** The hand-in's `check` lines' heading: the attempt's caveats. */
  caveatsHead: "What it said needs attention (its hand-in's caveats):",
  /** A landed attempt that named no caveat. */
  noCaveats: "It named no caveat.",
  /**
   * The project's conversation's wake to judge a landed attempt (Jev off,
   * events on): it did not do the work, and judges it from `work`.
   */
  leadJudges: (
    task: string,
    attempt: string,
    criteria: readonly string[],
    work: string
  ): string =>
    `Judge ${task}: ${attempt} landed its work, and its acceptance criteria wait for your judgment (Jev is off; you did not do this work). Move the task to its done stage when the work shows every criterion met; else move it back to its todo stage with a task_comment naming what is missing.\n\nCriteria:\n${criteria.map((each) => `- ${each}`).join("\n")}\n\nThe attempt's work:\n\n${work}`,
} as const;
