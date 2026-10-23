/**
 * What a project's page says around its board: the head's actions and its
 * ⋯ menu, the stages, a task card's state. The dashboard renders them from
 * here, and the probe kit finds them by these same words
 * (scripts/probe-words-check.ts refuses a copy).
 */
export const projectWords = {
  /** The head's New session from the project's checkout. */
  spinOff: "Spin off",
  /** The head's ⋯. */
  pickStages: "Pick stages…",
  projectDetails: "Project details…",
  cawSettings: "Caw settings…",
  forgetProject: "Forget project…",
  /** The stages control on a project that keeps none of its own. */
  noStages: "This project has no stages of its own yet",
  /** A task card whose attempt the hub couldn't start. */
  cantStart: "Can't start",
};
