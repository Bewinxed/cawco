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
  /** The log's line for a process stopped, after why. */
  stopped: (why: string) => `[search] ${why}: its search process was stopped`,
};
