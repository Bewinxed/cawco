/**
 * What the hub says around a project's review stage (hub stages.ts
 * `reviewStageOf`): where an attempt whose acceptance lines are not shown met
 * goes, what its reviewer's verdict did to the task (dispatch.ts
 * `settleReview`), and why a verdict handed in is refused (tasks.ts
 * `verdictChecked`, work-items.ts `heldAtFinish`).
 */

/** Its first lines, or nothing past a count of one. */
const these = (count: number, one: string, many: string): string =>
  count === 1 ? one : many;

export const reviewWords = {
  /** Where unshown acceptance lines go: the review stage `stage`, run by `type`. */
  toReview: (stage: string, type: string): string =>
    `go to ${stage}, for its reviewer (${type})`,
  /** Where they go in a project with no review stage. */
  toYou: "wait for you",
  /** A reviewer's finish_item before it handed in a verdict. */
  noVerdict:
    "Not yet: you review this task, and your verdict is its move. Hand it in with task_result (`summary` and `verdict`, one line per acceptance line: met, unmet or owner), then call finish_item again.",
  /** Lines the reviewer says are the owner's: `reviewer` names it, `lines` lists them. */
  owner: (reviewer: string, count: number, lines: string): string =>
    `${reviewer} says ${these(count, "this line is", "these lines are")} yours to decide, each asked on its card:\n\n${lines}`,
  /** Unmet lines beside the owner's, now to-dos. */
  unmetBeside: (lines: string): string => `\n\nUnmet, now to-dos:\n\n${lines}`,
  /** Lines the reviewer found unmet, now to-dos. */
  unmet: (reviewer: string, count: number, lines: string): string =>
    `${reviewer} found ${these(count, "this acceptance line", "these acceptance lines")} unmet, now to-dos:\n\n${lines}`,
  /** The to-do an unmet line becomes. */
  todo: (line: number, criterion: string, evidence: string): string =>
    `Make line ${line} true: ${criterion} (${evidence})`,
  /** A verdict from an attempt that does not review its task. */
  notReviewer:
    "`verdict` is a reviewer's: this attempt does not review its task in the project's review stage. Leave it out.",
  /** The task's reviewer's task_result with no verdict. */
  verdictMissing: (stage: string): string =>
    `You review this task in ${stage}: hand in \`verdict\`, one line per acceptance line (met, unmet or owner), with \`summary\`.`,
  /** An acceptance line judged `said` times, not once. */
  lineCount: (
    count: number,
    line: number,
    criterion: string,
    said: number
  ): string =>
    `\`verdict\` needs one line for each of the task's ${count} acceptance lines, by their place from 1: line ${line} (“${criterion}”) has ${said}.`,
  /** A line past the task's acceptance lines. */
  lineOutside: (line: number, count: number): string =>
    `\`verdict\` names line ${line}; the task has ${count} acceptance lines.`,
  /** A line with no evidence. */
  noEvidence: (line: number): string =>
    `\`verdict\` line ${line} says nothing in \`evidence\`.`,
  /** An owner's line with no card. */
  noCard: (line: number): string =>
    `\`verdict\` line ${line} is the owner's: name the decision card that asks him in \`card\` (\`<page>#<card>\`).`,
  /** An owner's line whose card does not read. */
  badCard: (line: number, why: string): string =>
    `\`verdict\` line ${line}'s card: ${why}`,
  /** An owner's line whose card is no decision card. */
  notCard: (line: number): string =>
    `\`verdict\` line ${line}'s card names no decision card: give \`<page>#<card>\`.`,
};
