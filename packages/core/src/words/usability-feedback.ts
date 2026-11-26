/**
 * Usability feedback's words (core usability-feedback.ts): what an agent
 * reads of the `usability_feedback` tool and at the end of every refusal
 * while feedback is on, and what the person reads where they allow it (the
 * first run, Configure › Feedback).
 */

/** The tool's name, as every harness lists it under CawCo's prefix. */
export const USABILITY_FEEDBACK_TOOL = "usability_feedback";

/** The person's two answers, as the options name them. */
type FeedbackAnswer = "allow" | "deny";

export const usabilityFeedbackWords = {
  /** The tool, as an agent reads it in its list (lesson L-743cb7: what it is, then when to use it). */
  tool: {
    description:
      "Usability feedback on a CawCo tool, filed as an issue on CawCo's repository. Use it when a CawCo tool refuses you wrongly, leaves you no route to what you need, or you work around it.",
    tool: "The CawCo tool, as you called it.",
    wanted: "What you were trying to do, in one sentence.",
    got: "What came back, word for word: the refusal, the error, or what was missing.",
    workaround: "What you did instead.",
  },

  /** The line every CawCo refusal and DevTools gate refusal ends with while feedback is on. */
  refusalLine:
    "If this refusal is wrong or leaves you no way forward, tell CawCo with usability_feedback.",

  /** The tool's answers. */
  opened: (url: string) =>
    `Filed a new issue: ${url}. Carry on with your work.`,
  commented: (url: string) =>
    `Added your report to the issue already open for this problem: ${url}. Carry on with your work.`,

  /** Why nothing was filed. */
  off: "usability_feedback is off for this fleet, so nothing was filed. Carry on with your work.",
  noSender:
    "No machine signed in to GitHub is online, so nothing was filed. Carry on with your work.",
  failed: (why: string) => `Nothing was filed: ${why} Carry on with your work.`,

  /** The consent question, as the owner wrote it (ask_27921e94). */
  question:
    "Allow agents used through CawCo to submit feedback to improve CawCo?",
  options: {
    allow: {
      name: "Allow",
      line: "When a CawCo tool fails them, agents file it as a public issue on CawCo's GitHub through your GitHub sign-in, with your machines, paths, projects and emails taken out.",
    },
    deny: {
      name: "Don't allow",
      line: "Nothing about your agents' trouble leaves your machines.",
    },
  } satisfies Record<FeedbackAnswer, { line: string; name: string }>,
  /** While no machine of the fleet is signed in to GitHub. */
  needsSignIn:
    "Needs a machine signed in to GitHub with gh (gh auth login). Until then agents can't send any.",

  /** Configure › Feedback to CawCo. */
  saving: "Saving…",
  saved: "Saved",
  notSaved: "Not saved",
  refused: (said: string) => `${said}. The earlier answer stays.`,
  unsent: (why: string) => `${why} The earlier answer stays.`,
  unread: (clause: string) =>
    `Could not read the feedback setting — ${clause}.`,

  /** The first run's step. */
  step: "Choose whether agents send feedback",
  stepDone: (allowed: boolean) =>
    allowed ? "Feedback to CawCo: allowed" : "Feedback to CawCo: not allowed",
  stepNote: "Change it in Configure › Feedback to CawCo.",
};
