import type { LandsMode } from "@cawco/core/injected";
import type { problem } from "elysia";
import type { WorkBudget } from "./db/stored-types";
import type { ProblemsOf } from "./refusal";
import type { Tasks } from "./tasks";

/** A project's dispatch: its settings, and what the dispatcher would do now. */
export interface DispatchView {
  /** What an attempt may spend where its task and its delegate call say nothing; null: no limit. */
  budget: WorkBudget | null;
  /** The project's Caw session, once the hub has started one. */
  conversationInstanceId: string | null;
  /** Whether the hub starts attempts at ready tasks on its own. */
  dispatch: boolean;
  /** The tasks it would start next, in order. */
  frontier: string[];
  /**
   * Tasks it does not start, each with why: a ready task's `startProblem`
   * (a budget line that does not read, or the hub's last try failing on the
   * file as it stands), and a queued start held because what the
   * `delegate` call that named its task asked does not read.
   */
  held: { task: string; why: string }[];
  /** Where an attempt lands when its task and type say nothing. */
  lands: LandsMode;
  /** Attempts starting or running now. */
  live: number;
  maxAttempts: number;
  /** Why it would start nothing now even with a ready task; null when it would. */
  paused: string | null;
  /** Tasks whose `runs:` hook start waits for a slot, oldest first. */
  queued: string[];
  /** Tasks waiting in `you` stages now. */
  review: number;
  reviewLimit: number;
  /** Where an attempt runs when its task says nothing (runs-on.ts); null: any machine with a checkout. */
  runsOn: string | null;
}

/** A change to a project's dispatch settings; what is left out stays. */
export interface DispatchChange {
  /** The project's default budget; null clears it. */
  budget?: WorkBudget | null;
  dispatch?: boolean;
  /** Where an attempt lands when its task and type say nothing. */
  lands?: LandsMode;
  maxAttempts?: number;
  reviewLimit?: number;
  /** Where an attempt runs when its task says nothing: a machine, or a capability like `apple`; null clears it. */
  runsOn?: string | null;
}

/**
 * Why a project's dispatch settings did not change (dispatch.ts
 * `configure`, declared with {@link DispatchConfigure}): a project the hub
 * does not keep, settings that do not fit, a `runsOn` no machine or
 * capability names, or its tasks' list, read to say the dispatch again.
 */
export type DispatchConfigureProblem =
  | ReturnType<
      typeof problem<404, { code: "dispatch-project-unknown"; detail: string }>
    >
  | ReturnType<
      typeof problem<400, { code: "dispatch-settings-unfit"; detail: string }>
    >
  | ReturnType<
      typeof problem<400, { code: "dispatch-runs-on-unknown"; detail: string }>
    >
  | ProblemsOf<ReturnType<Tasks["list"]>>;

/**
 * Changes a project's dispatch settings, then looks at it again (dispatch.ts
 * `configure`): the dispatch as it stands, or why not. Said here, below
 * dispatch.ts, so project-edit.ts reads it without reaching caw.ts, which
 * dispatch.ts types its own deps from.
 */
export type DispatchConfigure = (
  projectId: string,
  change: DispatchChange
) => Promise<DispatchView | DispatchConfigureProblem>;
