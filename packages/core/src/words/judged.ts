/**
 * What the hub says on a task when Jev judges a landed attempt's acceptance
 * criteria (hub dispatch.ts `judgeCriteria`), and how the task then shows
 * that attempt (hub tasks.ts `endedHowOf`).
 */
/** A sentence's end. */
const ENDED = /[.!?]$/u;

/** The head of Jev's comment over the lines it did not show met. */
const NOT_SHOWN_MET = "Not shown met:";

export const judgedWords = {
  /** A brief's comments, cut to the newest: how many older ones it leaves out. */
  olderComments: (count: number): string =>
    `${count} older ${count === 1 ? "comment is" : "comments are"} in the task file.`,
  /** Jev's comment on the task: the lines it did not show met, one `- ` line each. */
  notShownMet: (attempt: string, lines: string): string =>
    `Jev judged the acceptance criteria against the report of ${attempt}. ${NOT_SHOWN_MET}\n\n${lines}`,
  /** Its head, as the comment reads it. */
  notShownMetHead: NOT_SHOWN_MET,
  /** How an attempt sent back unmet ended, beside it on the task. */
  unmetHow: "Jev did not show its acceptance criteria met",
  /** Jev did not answer (`failed`, its words, a sentence): the work stays landed, the task where it is. */
  notJudged: (failed: string, attempt: string, stage: string): string =>
    `${failed.trim()}${ENDED.test(failed.trim()) ? "" : "."} The work of ${attempt} stays landed, and the task stays in ${stage} with its acceptance criteria not judged.`,
} as const;
