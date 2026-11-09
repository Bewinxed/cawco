/**
 * The three calls that go up boundary/'s files, each made when nobody just
 * asked for it: a host that ended and a stale boundary's next look ensure the
 * boundary again ({@link ensureAgain}: `watch.ts`, `stale-look.ts`), the
 * timer starts that look ({@link lookAtOlder}: `staleness.ts`), and a judge
 * that exited has its workspace armed again ({@link judgeExited}:
 * `judge-process.ts`).
 *
 * The loops are the system's own: ensuring a boundary follows its host, whose
 * exit ensures it again. So that boundary/'s imports still run one way, the
 * calling file imports this one and `arming.ts`, the file that knows all
 * three, hands them over as it loads, before anything can call one: every
 * start of a boundary and every arming reaches it (a session's start, a
 * command's, a look), and a host or a judge is only followed once one is.
 */

import type { WorkspaceRef } from "@cawco/core/workspace/controls";
import type { Boundary } from "./state";

interface UnaskedCalls {
  /** `arming.ts` `ensureBoundary`. */
  readonly ensureAgain: (ref: WorkspaceRef) => Promise<Boundary>;
  /** Moves workspace `id`'s arming on from its judge's exit, and answers its arming under way, if any. */
  readonly judgeExited: (
    id: string,
    held: boolean
  ) => Promise<void> | undefined;
  /** `stale-look.ts` `lookAtStale`. */
  readonly lookAtOlder: () => Promise<void>;
}

let calls: UnaskedCalls | undefined;

/** `arming.ts`'s one hand-over of the calls below, as it loads. */
export const answerUnasked = (given: UnaskedCalls): void => {
  calls = given;
};

const answered = (): UnaskedCalls => {
  if (!calls) {
    throw new Error(
      "boundary/unasked.ts was called before boundary/arming.ts loaded"
    );
  }
  return calls;
};

/** Workspace `ref`'s boundary, running: what `ensureBoundary` answers. */
export const ensureAgain = (ref: WorkspaceRef): Promise<Boundary> =>
  answered().ensureAgain(ref);

/** Starts one look at the older boundaries. */
export const lookAtOlder = (): Promise<void> => answered().lookAtOlder();

/** Workspace `id`'s judge exited; `held` says whether its boundary is on record. */
export const judgeExited = (
  id: string,
  held: boolean
): Promise<void> | undefined => answered().judgeExited(id, held);
