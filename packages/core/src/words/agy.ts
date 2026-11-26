/**
 * What CawCo says of an Antigravity session it refuses or ends (agent
 * harnesses/agy-launch.ts, agy-runtime.ts, agy-sessiond.ts): an account
 * that cannot start one, a session kind Antigravity runs none of yet, and a
 * turn that ends without a reply or at the account's quota. Read by the
 * agent alone; the app draws none of it. Decided by Gemini 4 Neon on
 * 2026-11-26 (the project's `assets/eb689d78/neon-answer.md`; the picture
 * strings, `assets/046b2a6e/neon-answer.md`).
 */

export const agyWords = {
  /** A start that names no account. */
  needsAccount: "Antigravity needs an account. Add one on this machine.",
  /** An account with no sign-in method on this machine, or one CawCo can't read. */
  noMethod:
    "This Antigravity account has no sign-in method on this machine. Add it again.",
  /** A key method whose key this machine doesn't hold. */
  noKey: (method: "Gemini API key" | "Agent Platform") =>
    `This ${method} account has no key on this machine. Connect it again.`,
  /** Gemini Enterprise without its Google Cloud project and location. */
  noBusinessPlace:
    "This Gemini Enterprise account needs a Google Cloud project and location.",
  /** Agent Platform with neither a key nor a project and location. */
  noPlatformAccess:
    "This Agent Platform account needs an API key, or a Google Cloud project and location.",
  /** A work item's session, which Antigravity runs none of yet. */
  noWorkItems: "Antigravity can't run work items yet. Use another agent.",
  /** A fork, which agy's ACP has no method for. */
  noFork: "Antigravity can't fork a session. Start a new one.",
  /** agy's own sign-in refused the account's method, in agy's words. */
  signInRefused: (said: string) => `Antigravity sign-in failed: ${said}`,
  /**
   * A turn on an Agent Platform account that ended with no reply twice, the
   * second time after agy was started again with a fresh sign-in (agy issue
   * #1722: its Google Cloud token stops refreshing after an hour).
   */
  emptyTurn:
    "No reply; Google Cloud sign-in may have expired. Send again, or sign in with gcloud on this machine.",
  /** The account's quota for the model is used up (`QUOTA_EXHAUSTED`). */
  quota: (resetsAt: string | undefined) =>
    resetsAt
      ? `Out of quota for this model until ${resetsAt}.`
      : "Out of quota for this model.",
  /** agy ended the turn on an error from Google's API, in Google's words. */
  apiError: (said: string) => `Turn failed: ${said}`,
  /** A session whose agy is another version than the machine's. */
  outdated: (runs: string, machine: string) =>
    `This session runs Antigravity ${runs}; this machine has ${machine}. It sleeps when idle, and the next message wakes it on ${machine}.`,
  /** A send to a session whose agy has ended. */
  ended: "Antigravity stopped. Send again to restart.",
  /** A live install of a credential other than the launch's. */
  liveCredential: "New credentials apply only on Antigravity's next start.",
  /** agy ended a turn on an error step whose words CawCo can't read. */
  unknownError: "Turn failed.",
  /**
   * Which of a send's pictures a refusal names (agy-pictures.ts): `at` is
   * its place among them, from 0; `of` how many the send carries.
   */
  picture: (at: number, of: number) =>
    of === 1 ? "The picture" : `Picture ${at + 1}`,
  /** A picture whose bytes don't decode as the type it was sent as. */
  pictureUnreadable: (picture: string, type: string) =>
    `${picture} isn't a readable ${type} file.`,
  /** A picture over the size each model agy runs takes. */
  pictureTooBig: (picture: string, limit: string) =>
    `${picture} is over ${limit}.`,
  /** A picture wider or taller than each model agy runs takes. */
  pictureTooWide: (picture: string, pixels: number) =>
    `${picture} is over ${pixels} pixels wide or tall.`,
  /** A send whose pictures and words together are over Google's request size. */
  sendTooBig: (limit: string) => `This message is over ${limit}.`,
  /**
   * Google refused a turn's pictures after agy took them, in Google's words
   * when it said any; the conversation that holds them is set aside, and the
   * next message goes to a new one carrying its transcript (agy-runtime.ts).
   */
  pictureRefused: (said: string | undefined) =>
    said
      ? `Google refused the picture. ${said}`
      : "Google refused the picture.",
} as const;
