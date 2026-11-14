/**
 * The agent's search process, as its refusals and its log say it (agent
 * search/process.ts): a question of the transcript index past its limit, or
 * let go by its asker, and the process that held it stopped.
 */
export const searchWords = {
  /** A question that ran past its limit. */
  pastLimit: (seconds: number) => `passed its limit of ${seconds} s`,
  /** A question its asker (the hub) let go. */
  letGo: "was let go by its asker",
  /** A find's coverage, when the machines left out the short last word of the words being typed (jsonl-parser fts5.ts `matchQueries`). */
  droppedWord: (word: string) => `searched without “${word}” (under 3 letters)`,
  /** A find's coverage, when a machine's index could not read some transcripts: its part is short by them. */
  unreadTranscripts: (count: number, machine: string) =>
    `${count === 1 ? "1 transcript" : `${count} transcripts`} on ${machine} could not be read`,
  /** The log's line for a process stopped, after why. */
  stopped: (why: string) => `[search] ${why}: its search process was stopped`,
};
