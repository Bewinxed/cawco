/**
 * What the hub's log says of a relaunch at rest (hub server.ts
 * `relaunchAtRest`): a session whose CLI runs a boundary hook that fails
 * open, or whose Claude Code process ran a manual `/compact`, relaunched on
 * its conversation between turns, and the hold on a boundary relaunch.
 * Written to the machine's log only: no screen draws it, so it is not
 * written into the app (scripts/words-swift.ts).
 */

/** What each relaunch is for: its log tag, and where it relaunches the session. */
export const RELAUNCH_FOR = {
  boundary: { tag: "boundary", onto: "onto the fail-closed hook" },
  compact: {
    tag: "compact",
    onto: "into a process that never held its compacted history",
  },
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
};
