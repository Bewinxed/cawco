/**
 * What the hub's log says of a relaunch at rest (hub server.ts
 * `relaunchAtRest`): a session whose CLI runs a boundary hook that fails
 * open, whose Claude Code process ran a manual `/compact`, or whose process
 * names another MCP gateway port than its agent serves on, relaunched on
 * its conversation between turns, and the hold on a boundary relaunch; and
 * of an account move's relaunch (`relaunchOnAccount`, `relaunchMoved`),
 * which starts only a session whose process worked (`processWorks`).
 * Written to the machine's log only: no screen draws it, so it is not
 * written into the app (scripts/words-swift.ts).
 */

/** The words every account move's relaunch line carries. */
const RELAUNCHES_ON = "relaunches on";

/** What each relaunch is for: its log tag, and where it relaunches the session. */
const RELAUNCH_FOR = {
  boundary: { tag: "boundary", onto: "onto the fail-closed hook" },
  compact: {
    tag: "compact",
    onto: "into a process that never held its compacted history",
  },
  gateway: { tag: "gateway", onto: "onto the MCP gateway's port" },
} as const;

export type RelaunchFor = keyof typeof RELAUNCH_FOR;

export const relaunchWords = {
  /** Relaunched now. */
  relaunching: (why: RelaunchFor, instanceId: string) =>
    `[hub] ${RELAUNCH_FOR[why].tag}: relaunching ${instanceId} ${RELAUNCH_FOR[why].onto}`,
  /** Not idle: left to its next turn's end, which asks again. */
  midTurn: (why: RelaunchFor, instanceId: string) =>
    `[hub] ${RELAUNCH_FOR[why].tag}: ${instanceId} is mid-turn; it is relaunched ${RELAUNCH_FOR[why].onto} at its next turn's end`,
  /** An ask inside the hold after a boundary relaunch, kept back for the hold's end. */
  heldBack: (instanceId: string, holdSeconds: number) =>
    `[hub] boundary: ${instanceId} asked again within ${holdSeconds} s of its relaunch, which may not have landed yet; it is asked again as that hold ends`,
  /** An ask inside the hold after a relaunch that was already a kept-back ask: left to its next turn's end. */
  heldTwice: (instanceId: string, holdSeconds: number) =>
    `[hub] boundary: ${instanceId} asked again within ${holdSeconds} s of a relaunch that was already its second ask; it is relaunched at its next turn's end`,
  /** The hold ended with an ask kept back: it goes now. */
  holdEnded: (instanceId: string) =>
    `[hub] boundary: ${instanceId}'s hold ended; the ask it kept back goes now`,
  /** An account move relaunches a session whose process worked, on its conversation; `then`: what it is told first, from ", " on. */
  onAccount: (session: string, account: string, then = "") =>
    `[hub] ${session} ${RELAUNCHES_ON} ${account}, its conversation resumed${then}.`,
  /**
   * An account move of a session whose process wasn't working: moved, not
   * relaunched. `carried`: its limit or sign-in cut its last turn, so its
   * carry-on goes to it now and starts it there.
   */
  atRest: (
    session: string,
    account: string,
    status: string,
    launching: boolean,
    carried: boolean
  ) =>
    `[hub] ${session} is on ${account} now, and isn't relaunched: its process wasn't working (it is ${status}${launching ? ", its launch on its way" : ""}). ${carried ? "What stopped its last turn no longer applies, so it is told to carry on, and that starts it there." : "Whatever wakes it next starts it there."}`,
};

/** Why a session whose work a continuation took on never runs again. */
export const continuedWords = (continuedInto: string): string =>
  `This session was continued in session ${continuedInto.slice(0, 8)}, which carries its work on; it doesn't run again. Write to ${continuedInto.slice(0, 8)}.`;

/**
 * Where a continued session's work went, as its page says it in its
 * composer's place (the words before the new session's title, a link to
 * it), and as the hub refuses a person's message to it: a moved
 * conversation points onward, it never takes a message on silently.
 */
export const CONTINUED_IN = "Continued in";

/** {@link CONTINUED_IN} with the new session's title, as one sentence. */
export const continuedInWords = (title: string): string =>
  `${CONTINUED_IN} ${title}`;
