/**
 * The drawings' fixtures: one review of an agent's "New routine" page, the
 * comments a person really leaves on such a page, newest first.
 */

export type PinState = "provisional" | "unsent" | "sent" | "resolved";

export interface Comment {
  age: string;
  /** The thread's last line once it has more than one entry. */
  last?: string;
  /** The agent is working on it now. */
  live?: boolean;
  n: number;
  /** The element's name, or "Whole page". */
  on: string;
  state: PinState;
  words: string;
}

export const AGENT = "Orchestrate cockpit";

export const COMMENTS: Comment[] = [
  {
    n: 14,
    on: "Save",
    age: "2m",
    words: "Save jumps down when the error shows. Keep it where it is.",
    last: "Agent: Fixed. Save stays put now.",
    state: "sent",
  },
  {
    n: 13,
    on: "Whole page",
    age: "20m",
    words: "Too much air between the sections; it reads as three pages.",
    state: "sent",
    live: true,
  },
  {
    n: 12,
    on: "Schedule",
    age: "1h",
    words: "Say when it runs next, under the field.",
    last: "Agent: Added the next run under it.",
    state: "sent",
  },
];

/** The same three, not yet heard by the session (pick 3's unsent state). */
export const UNSENT: Comment[] = [
  {
    n: 14,
    on: "Save",
    age: "now",
    words: "Save jumps down when the error shows. Keep it where it is.",
    state: "unsent",
  },
  {
    n: 13,
    on: "Whole page",
    age: "1m",
    words: "Too much air between the sections; it reads as three pages.",
    state: "unsent",
  },
  {
    n: 12,
    on: "Schedule",
    age: "3m",
    words: "Say when it runs next, under the field.",
    state: "unsent",
  },
];

/** The thread of comment 14, as the transcript's turns draw it. */
export const THREAD = [
  {
    by: "you" as const,
    at: "2026-10-21T09:12:00Z",
    text: "Save jumps down when the error shows. Keep it where it is.",
  },
  {
    by: "agent" as const,
    at: "2026-10-21T09:14:00Z",
    text: "Fixed. The error has its own row now, so Save stays put.",
    file: "RoutineForm.svelte",
  },
];
