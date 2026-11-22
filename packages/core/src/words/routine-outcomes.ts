/**
 * What the project's Routines view says when it lays the routines out by
 * the outcome each one serves (dashboard routines-view/): an outcome's one
 * reading of where it stands, a routine's state in a word for its glyph's
 * name, a run's question answered in place, a turned-off routine set going
 * again. For the dashboard and the native app alike: `bun run words`
 * writes these into the app, so a word is changed here or nowhere.
 */
export const routineOutcomeWords = {
  /** The group of routines that serve no outcome, in the place an outcome's sentence takes. */
  unplaced: "Not under an outcome",

  /** An outcome's reading, worked out from its routines alone: what they do, never a state of the outcome. */
  standing: {
    /** A run's question holds `routine` until he answers. */
    asks: (routine: string) => `${routine} asks you`,
    /** `routine` was turned off after failing; nothing looks after the outcome there now. */
    failing: (routine: string) => `${routine} is off after failing`,
    /** Every routine under it runs on its own: `count` of them. */
    running: (count: number) =>
      count === 1
        ? "Its routine runs on its own"
        : `All ${count} routines run on their own`,
    /** Some of its routines run on their own and the rest are paused: `running` of `total`. */
    someRun: (running: number, total: number) =>
      `${running} of ${total} routines run on their own`,
    /** Every routine under it is paused, by him or by a session. */
    paused: "Paused",
    /** Every routine under it stopped because its work is finished. */
    finished: "Every routine stopped, its work done",
  },

  /** A routine's state, for its glyph's tooltip and accessible name. */
  state: {
    asks: "Waiting for your answer",
    failing: "Off after failing",
    paused: "Paused",
    running: "Runs on its own",
    going: "Running now",
    finished: "Stopped, its work done",
  },

  /** A run's question, answered where it stands. */
  ask: {
    /** When the run asked, and that the routine waits. */
    askedAt: (time: string) =>
      `Asked at ${time}. It runs again once you answer.`,
    /** The field's name, read out; the field shows no words of its own. */
    fieldLabel: "Your answer",
    /** Beside the run's ready answers: write another one. */
    other: "Other…",
    send: "Send answer",
    sending: "Sending…",
    /** After his answer: the routine runs again on its schedule. */
    answered: (next: string) => `Answered. It runs again ${next}.`,
  },

  /** A routine turned off after failing, set going again in place. */
  off: {
    turnOn: "Turn routine back on",
    turningOn: "Turning on…",
    /** After it was turned on again. */
    on: (next: string) => `On again. It runs ${next}.`,
  },

  /** A routine's row, read out: the whole row opens it. */
  open: (routine: string) => `Open ${routine}`,

  /** The disclosure that shows an outcome's routines where room is short. */
  show: (count: number) =>
    count === 1 ? "Show 1 routine" : `Show ${count} routines`,
  hide: "Hide routines",
};

/** How long a run took, in words. */
const took = (minutes: number): string => {
  if (minutes < 1) {
    return "under a minute";
  }
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
};

/** The routine opened beside the view: what it is and what its last run found. */
export const openedRoutineWords = {
  /** The card, read out. */
  label: "Routine",
  /** When it runs, and its next start ("Every 2 hours, next at 11:00"). */
  when: (schedule: string, next: string | null) =>
    next ? `${schedule}, next at ${next}` : schedule,
  /** The last run: when it started and how long it took ("Last run at 09:00, took 4 minutes"). */
  ran: (at: string, minutes: number) =>
    `Last run at ${at}, took ${took(minutes)}`,
  /** A run with nothing to say, where its words would stand. */
  nothing: "The run had nothing to report.",
  /** A run no session took, where the button would stand. */
  noSession: "This run had no session.",
};
