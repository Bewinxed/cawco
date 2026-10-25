/**
 * A session's turn that CawCo cut, and why: the owner's Stop, a parent's
 * interrupt_delegate, its machine's pause, its provider's retries running
 * out. The hub keeps each one (hub db `turn_cuts`), and every transcript it
 * builds says the cause on what the cut ended.
 *
 * What the harness wrote does not say it. Claude Code ends a tool call an
 * interrupt cuts mid-run with "The user doesn't want to proceed with this
 * tool use. The tool use was rejected …" and `toolUseResult: "User rejected
 * tool use"` (2.1.310's `createSyntheticErrorMessage`, `toolDenialKind:
 * "user-rejected"`), and a "[Request interrupted by user for tool use]"
 * line after it; OpenCode and pi say the call or the turn was aborted. On
 * 23 Oct the owner read a machine_pause that ran as one he had rejected:
 * the pause had cut its own caller's turn, and nobody had asked him.
 *
 * A cut is joined to what it ended: the calls running as it came, by id,
 * as the hub's transcript held them then; a failed answer to one of them
 * is the cut's. The interrupted line a cut leaves is joined by time: the
 * one within {@link CUT_REACH_MS} after it.
 */

export interface TurnCut {
  /** When the hub sent the interrupt, epoch ms. */
  at: number;
  /** The calls running as it came, by their harness's id: a failed answer to one is the cut's. */
  calls: readonly string[];
  /** Who or what cut it, in the words a line reads: "your Stop", "obelisk's pause until 20:53". */
  cause: string;
}

/** How long after a cut the harness's line for it can land: its abort, then its write. */
export const CUT_REACH_MS = 30_000;

/** How far a machine's clock, which a stored entry is dated by, may run behind the hub's. */
const CUT_SKEW_MS = 5000;

/** The cut whose line is one dated `at` (epoch ms): the latest at or before it, within reach. */
export const cutAt = (
  cuts: readonly TurnCut[],
  at: number
): TurnCut | undefined => {
  let found: TurnCut | undefined;
  for (const cut of cuts) {
    if (
      at >= cut.at - CUT_SKEW_MS &&
      at <= cut.at + CUT_REACH_MS &&
      (found === undefined || cut.at > found.at)
    ) {
      found = cut;
    }
  }
  return found;
};

/** The cut that came while the call `toolId` ran, if one did. */
export const cutOf = (
  cuts: readonly TurnCut[],
  toolId: string
): TurnCut | undefined => cuts.findLast((cut) => cut.calls.includes(toolId));
