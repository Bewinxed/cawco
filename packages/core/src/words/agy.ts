/**
 * What CawCo says of an Antigravity session it refuses or ends (agent
 * harnesses/agy-launch.ts, agy-runtime.ts, agy-sessiond.ts, agy-canary.ts,
 * agy-judge.ts, agy.ts): an account that cannot start one, a workspace
 * session stopped or a write it refused, a turn that ends without a reply
 * or at the account's quota, and what it says of its stored conversations.
 * Said by the agent; the app draws `ownSettings` as a transcript's line.
 * Decided by Gemini 4 Neon on 2026-11-26 (the project's
 * `assets/eb689d78/neon-answer.md`; the picture strings,
 * `assets/046b2a6e/neon-answer.md`; the workspace words,
 * `assets/9eb4dcba/neon-answer.md`; an account's methods and sign-in,
 * `assets/b6a2f599/neon-answer.md`; the stored-conversation strings,
 * `assets/9c99dae2/neon-answer.md`).
 */

export const agyWords = {
  /** A start that names no account. */
  needsAccount: "Antigravity needs an account. Add one on this machine.",
  /** An account with no sign-in method on this machine, or one CawCo can't read. */
  noMethod:
    "This Antigravity account has no sign-in method on this machine. Add it again.",
  /** A key given to Agent Platform, which agy runs on gcloud's credentials alone. */
  platformNoKey: "Agent Platform uses gcloud credentials, not a key.",
  /** A key method whose key this machine doesn't hold. */
  noKey: (method: "Gemini API key") => `No ${method} on this machine.`,
  /** Gemini Enterprise without its Google Cloud project and location. */
  noBusinessPlace:
    "Gemini Enterprise needs a Google Cloud project and location.",
  /** Agent Platform without its Google Cloud project and location, which agy needs with a key too. */
  noPlatformPlace: "Agent Platform needs a Google Cloud project and location.",
  /** A Google account or Gemini Enterprise not signed in on this machine: no agy runs, so none opens a browser here. */
  notSignedIn: "Not signed in on this machine.",
  /** An Antigravity account asked for with no sign-in method, or another provider's with one. */
  methodOnlyForAgy: "Only an Antigravity account has a sign-in method.",
  /** An Antigravity account asked for with no sign-in method. */
  pickMethod: "Choose a sign-in method.",
  /** A method asked for under the other kind of account (a key method as a browser sign-in, or the reverse). */
  methodNotKind: (method: string) => `${method} doesn't sign in that way.`,
  /** A Google Cloud place given to a method that takes none. */
  noPlace: (method: string) => `${method} takes no Google Cloud project.`,
  /** A Google Cloud place with one of its two names left empty. */
  halfPlace: "Enter both the Google Cloud project and location.",
  /** Agent Platform by project and location, on a machine with no gcloud default credentials. */
  noAdc: (path: string) =>
    `No Google Cloud credentials at ${path}. Run gcloud auth application-default login on this machine.`,
  /** agy showed no sign-in link in time, with its last words. */
  noLink: (screen: string) =>
    screen ? `No sign-in link: ${screen}` : "No sign-in link.",
  /** A sign-in started on a machine whose agy is already signed in to the account. */
  alreadySignedIn: "Already signed in on this machine.",
  /** A code pasted for a sign-in no longer waiting on this machine. */
  notWaiting: "Sign-in expired.",
  /** A Gemini Enterprise sign-in pasted something other than the address Google sent the browser to. */
  notCallback: "Paste the full localhost URL.",
  /** agy ended its sign-in without signing in, in its own words. */
  signInEnded: (said: string) =>
    said ? `Sign-in didn't finish: ${said}` : "Sign-in didn't finish.",
  /** agy took the machine's own keyring sign-in in place of the account's: the launch is stopped and what it wrote removed. */
  keyringRefused: "Stopped: agy used this machine's own Google sign-in.",
  /** agy said it signed in but left no sign-in in the account's home. */
  noToken: "Sign-in wasn't saved.",
  /**
   * A workspace session asked to start below its clone's root, where agy
   * would read project config from folders no workspace denies hold.
   */
  notAtRoot: "Antigravity must start at the clone's root.",
  /**
   * The account's hook check showed agy does not run CawCo's hook, or does
   * not obey it (`why`), so no session on the account starts.
   */
  hookNotHeld: (why: string) =>
    `Antigravity didn't follow the safety hook on this account (${why}).`,
  /** The account's hook check could not finish (`why`); the next start runs it again. */
  hookUnchecked: (why: string) =>
    `Couldn't check the safety hook on this Antigravity account (${why}). Start again to retry.`,
  /** A workspace command ran and agy did not say CawCo's hook rewrote it. */
  commandNotRewritten:
    "Session stopped. A command ran without the sandbox rewrite.",
  /** A workspace command ran that CawCo's hook never judged. */
  commandNotJudged: "Session stopped. A command ran without the safety hook.",
  /**
   * The model's words for a write to an instruction file a workspace holds
   * read-only for Antigravity (`tool` as agy called it, `path` as named).
   */
  instructionsHeld: (tool: string, path: string) =>
    `cawco: ${tool} did not run because ${path} is read-only in this session. Leave it unchanged and report any needed changes in your reply.`,
  /** A fork, which agy's ACP has no method for. */
  noFork: "Antigravity can't fork a session. Start a new one.",
  /** A fleet hook's `UserPromptSubmit` block, its reason in the hook's words. This line and the next as Gemini 4 Neon decided them (the project's `assets/5f081fab/neon-answer.md`). */
  promptRefused: (said: string) => `A fleet hook refused this prompt: ${said}`,
  /** A session dir whose fleet CawCo couldn't place, at `link`. */
  noFleetLink: (link: string) => `Couldn't link the fleet into ${link}.`,
  /** A session dir CawCo couldn't copy the account's agy setup into. */
  noSessionDir: (dir: string) => `Couldn't set up ${dir}.`,
  /** A session CawCo opened no MCP gate for, so it can reach none of its tools. Decided by Gemini 4 Neon (the project's `assets/9a2f4c11/neon-answer.md`), as are `noSessionDir` and `callCancelled`. */
  noGate: "Couldn't start without an MCP relay.",
  /** agy's own sign-in refused the account's method, in agy's words. */
  signInRefused: (said: string) => `Antigravity sign-in failed: ${said}`,
  /**
   * A turn on an Agent Platform account that ended with no reply twice, the
   * second time after agy was started again with a fresh sign-in (agy issue
   * #1722: its Google Cloud token stops refreshing after an hour).
   */
  emptyTurn:
    "No reply; Google Cloud sign-in may have expired. Send again, or sign in with gcloud on this machine.",
  /**
   * A call's result when it ended without one: an interrupt, or agy's own
   * end, stopped it (a timer, a command in the background, a command
   * part-way), and agy wrote no result of it. Said live and read back alike.
   */
  callCancelled: "Cancelled",
  /**
   * The account's quota for the model is used up (`QUOTA_EXHAUSTED`), and
   * when it resets as Google said it: a day and a UTC time, since the
   * reader's own zone isn't known where this is written.
   */
  quota: (resetsAt: number | undefined) =>
    resetsAt === undefined
      ? "Out of quota for this model."
      : `Out of quota for this model until ${new Date(resetsAt).toLocaleString(
          "en-GB",
          {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "UTC",
          }
        )} UTC.`,
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
  /** A delete of a conversation in agy's own default home, which CawCo never writes. */
  ownDeleteRefused: "Can't delete it here. Delete it in Antigravity.",
  /** A folder move to another machine, which agy's store can't follow. */
  staysOnMachine: "Antigravity conversations can't move to another machine.",
  /** A rename or tag of a conversation no Antigravity store on the machine holds. */
  noConversation: "Conversation isn't on this machine.",
  /** The line a session continued from agy's own history starts with. */
  ownSettings:
    "Uses Antigravity's own settings. Permission modes and fleet setup don't apply.",

  // ── An account's usage windows (agent usage/agy.ts) ─────────────────────
  /** What an account's windows of each of agy's model groups are scoped to, as a limit's label names it ("Week · Gemini"). */
  groups: { gemini: "Gemini", thirdParty: "Claude and GPT" },
  /** A machine whose connections go through a proxy: the read would reach Google around it, so it isn't made. */
  usageBehindProxy: "Can't read usage through a proxy.",
  /** The read needed a host it may not reach (agent usage/agy.ts `AGY_USAGE_HOSTS`). */
  usageHostRefused: (hosts: string) => `Usage read needs ${hosts}.`,
  /** The read ended without its windows, in agy's words when it said any. */
  usageFailed: (said: string) =>
    said ? `Usage read failed: ${said}` : "Usage read failed.",
  /** agy gave the read no answer in time. */
  usageUnanswered: (seconds: number) =>
    `Usage read timed out after ${seconds} s.`,
  /** The read spent tokens, which it never has: its windows aren't taken. */
  usageSpent: (tokens: number) =>
    `Usage read failed. It spent ${tokens} tokens.`,
} as const;
