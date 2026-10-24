/**
 * What a project's page says around its board: the head's actions and its
 * ⋯ menu, the stages, a task card's state. The dashboard renders them from
 * here, and the probe kit finds them by these same words
 * (scripts/probe-words-check.ts refuses a copy).
 */
export const projectWords = {
  /** The head's way to a session without Caw: the New Session form on the project's checkout. */
  newSession: "New session",
  /** The head's one coral action: his panel on a new thread. */
  askCaw: "Ask Caw",
  /** The head's ⋯. */
  pickStages: "Pick stages…",
  projectDetails: "Project details…",
  cawSettings: "Caw settings…",
  forgetProject: "Forget project…",
  /** The stages control on a project that keeps none of its own. */
  noStages: "This project has no stages of its own yet",
  /** A task card whose attempt the hub couldn't start. */
  cantStart: "Can't start",
  /** A task's one state line (board card), and its pane's session row. */
  working: "Working",
  retrying: "Retrying",
  attempt: (n: number) => `attempt ${n}`,
  asksYou: "Asks you",
  waitsOnYou: "Waits on you",
  failed: "Failed",
  stopped: "Stopped",
  /** Its file could not be read whole, or names a stage the project lacks. */
  fileProblem: "Problem",
  afterTask: (id: string) => `After ${id}`,
  /** The empty Routines block's own starter, after the project's. */
  askForRoutine: "Ask Caw for a routine",
  /** What it puts in Caw's composer, unsent: the caret after it. */
  routineAsk: (project: string) => `Make a routine for ${project}: `,
};
