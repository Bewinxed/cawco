/**
 * What CawCo says of an Antigravity session it refuses or ends (agent
 * harnesses/agy-launch.ts, agy-runtime.ts, agy-sessiond.ts): an account
 * that cannot start one, a session kind Antigravity runs none of yet, and a
 * turn that ends without a reply or at the account's quota. Read by the
 * agent alone; the app draws none of it. Decided by Gemini 4 Neon on
 * 2026-11-26 (the project's `assets/eb689d78/neon-answer.md`).
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
} as const;
