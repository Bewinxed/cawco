import type { problem } from "elysia";
import type { ProblemsOf } from "./refusal";
import type { WorkItems } from "./work-items";

/** Why a discard went nowhere: the workspace is not the session's to discard (work-items.ts `discardFor`). */
export type DiscardProblem = ProblemsOf<ReturnType<WorkItems["discardFor"]>>;

/** What a discard answers: its words, or why it went nowhere (artifact-events.ts `discarded`). */
export type Discarded = string | DiscardProblem;

/**
 * What a session's ask that the person decide a discard answers
 * (artifact-events.ts `discardAsked`): its words when recorded, whether the
 * discard goes now approved, or why there is no ask.
 */
export type DiscardAsked =
  | { recorded: string }
  | { approved: boolean }
  | ProblemsOf<ReturnType<WorkItems["discardable"]>>
  | ProblemsOf<ReturnType<WorkItems["waiting"]>>
  | ReturnType<
      typeof problem<400, { code: "discard-ask-reason"; detail: string }>
    >
  | ReturnType<
      typeof problem<
        404,
        { code: "discard-ask-session-unknown"; detail: string }
      >
    >;
