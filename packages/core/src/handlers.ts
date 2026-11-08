/**
 * A handler: the fresh session the hub starts for one thing of a project
 * when something happens to that thing and no live, warm session is on it
 * (the owner's card "What a trigger wakes", 2026-11-07). It is a work item
 * whose `handles` names the thing; one lives per thing at a time, and a
 * second trigger on the thing while it lives goes to it.
 */
import type { HarnessKind } from "./harness";
import { MINUTE_MS } from "./time";

/** The kinds of thing a handler is started for. */
export const HANDLED_KINDS = [
  "artifact",
  "card",
  "connection",
  "event",
  "inbox",
  "routine",
  "session",
  "task",
] as const;

export type HandledKind = (typeof HANDLED_KINDS)[number];

/** The thing a handler works for: its kind and its id (a task's `tsk-12`, an artifact's id, a card's `<artifact>#<card>`). */
export interface HandledThing {
  id: string;
  kind: HandledKind;
}

/**
 * How long a handler with nothing open may sit idle before the hub ends it:
 * five minutes, Devin's own idle sleep ("Devin sleeps automatically after 5
 * minutes of inactivity", https://docs.devin.ai/llms-full.txt, read
 * 2026-11-07, the advisor's table in assets/8e44527f/ephemeral-advice.md).
 * Open means an ask of its waiting on the person, a live delegate of its
 * own, or an attempt it started still running.
 */
export const HANDLER_IDLE_MS = 5 * MINUTE_MS;

/**
 * The share of a harness's model window a standing session's context may
 * fill before a send to it is preceded by its compression
 * (`continue_session`). Claude Code compacts on its own near the end of its
 * window (its auto-compact point, the agent's harnesses/compaction-points.ts)
 * and OpenCode and pi at the window less a reserve; half the window is where
 * a cold re-read of the context costs as much as the summary that replaces
 * it, so a standing session past it is compressed first. The incident that
 * set the rule (2026-11-07) was an 800k-token conversation on a 1M window.
 */
export const STANDING_CONTEXT_SHARE: Record<HarnessKind, number> = {
  claude: 0.5,
  opencode: 0.5,
  pi: 0.5,
};

/** The parent id a handler's work item carries: `handler:<project>:<kind>:<id>`, which no session's row has. */
export const HANDLER_PARENT = "handler:";

export const handlerParentId = (
  projectId: string,
  thing: HandledThing
): string => `${HANDLER_PARENT}${projectId}:${thing.kind}:${thing.id}`;

/** Whether a parent id is a handler's ({@link handlerParentId}). */
export const isHandlerParent = (id: string | null | undefined): boolean =>
  !!id?.startsWith(HANDLER_PARENT);
