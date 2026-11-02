/**
 * What `delegate_list` with a `target` says of one delegate, as its parent
 * reads it (hub presenters/sessions.ts `delegatePeekWords`): who it is, what
 * it does now, its last steps, its context, what it has made and its last
 * words. Agent-facing words: no screen draws them.
 */
export const delegatePeekWords = {
  /** Its turn runs and a call is open: the call, and how long it has run. */
  nowStep: (step: string, lasted: string) => `Now: ${step}, for ${lasted}.`,
  /** Its turn runs between calls: it thinks or writes. */
  nowThinking: (since: string) =>
    `Now: thinking or writing, its last step ${since}.`,
  /** No turn runs. */
  nowIdle: (lasted: string) => `Now: idle for ${lasted}.`,
  /** Its session has ended. */
  nowEnded: "Now: ended.",
  stepsHeading: (shown: number) =>
    `Last ${shown === 1 ? "step" : `${shown} steps`}, newest first:`,
  stepsNone: "Steps: none yet.",
  stepsUnread: (why: string) =>
    `Steps: its transcript could not be read: ${why}`,
  /** A step that ended in an error. */
  failed: "failed",
  /** A step whose result has not landed. */
  running: "running",
  /** More steps than the answer names. */
  stepsMore:
    "Older steps: delegate_list with this target, response_format detailed and page 1, 2, … (50 a page, each with its time).",
  /** The walk back through its transcript stopped before the page's steps. */
  stepsCut: (pages: number) =>
    `Only its newest ${pages} transcript pages were read; steps older than these are not counted.`,
  context: (tokens: string, share: string) =>
    `Context: ${tokens} tokens in its window${share}.`,
  contextShare: (percent: number, window: string) =>
    `, ${percent}% of its model's ${window}`,
  contextWindowUnknown: (why: string) =>
    `; its model's window is unknown (${why})`,
  contextNone:
    "Context: its harness has reported no figure for its window yet.",
  madeHeading: "Made so far:",
  commits: (count: number, subjects: readonly string[]) =>
    `- ${count === 1 ? "1 commit" : `${count} commits`} on no remote${subjects.length > 0 ? `: ${subjects.map((subject) => `“${subject}”`).join("; ")}` : ""}`,
  uncommitted: (count: number) =>
    `- ${count === 1 ? "1 uncommitted changed file" : `${count} uncommitted changed files`}`,
  outputs: (paths: readonly string[]) =>
    paths.length === 0
      ? "- nothing in $TMPDIR/outputs/"
      : `- in $TMPDIR/outputs/: ${paths.join(", ")}`,
  outputsUnread:
    "- its clone is closed, so its outputs folder and commit subjects were not read",
  handed: (links: readonly string[]) =>
    links.length === 0
      ? "- no artifact handed up to you"
      : `- handed up to you: ${links.join(", ")}`,
  madeUnread: (why: string) => `- its workspace could not be read: ${why}`,
  lastWords: (when: string, text: string) => `Last words (${when}): ${text}`,
  lastWordsNone: "Last words: none yet.",
};
