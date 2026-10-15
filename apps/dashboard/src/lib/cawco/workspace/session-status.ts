/**
 * What a session, or a workflow step, is doing, on one scale: its word, its
 * glyph and its tone. The rail's glyph (SessionStatus) and the phone tab's
 * rim (PaneTabs) both read it, so the two never disagree. Reads reactive
 * state: call it inside a `$derived` or a template.
 */
import type { WorkflowStep } from "@cawco/core";
import type { Component } from "svelte";
import Passed from "~icons/solar/check-circle-bold-duotone";
import Failed from "~icons/solar/close-circle-bold-duotone";
import Attention from "~icons/solar/hand-shake-bold-duotone";
import Sleeping from "~icons/solar/moon-sleep-bold-duotone";
import Pause from "~icons/solar/pause-circle-bold-duotone";
import Unknown from "~icons/solar/question-circle-bold-duotone";
import Working from "~icons/solar/refresh-circle-bold-duotone";
import { STOPPED_LABEL, STOPPING_LABEL } from "../activity";
import { cawco, isFailed, isStale } from "../client.svelte";
import { runIdOf } from "../workflow-runs";
import { workflowState } from "../workflow-state.svelte";

export type StatusTone = "working" | "attention" | "failed" | "done" | "quiet";

export interface SessionStatusOf {
  /** None while it is on its way (stopping): the glyph is StopTray's spinner. */
  icon: Component | null;
  label: string;
  tone: StatusTone;
}

/** A step's status on the session's scale: going, needing someone, done, or not. */
const STEP: Record<WorkflowStep["status"], SessionStatusOf> = {
  running: { label: "Working", icon: Working, tone: "working" },
  waiting: { label: "Needs you", icon: Attention, tone: "attention" },
  held: { label: "Held", icon: Attention, tone: "attention" },
  failed: { label: "Failed", icon: Failed, tone: "failed" },
  passed: { label: "Passed", icon: Passed, tone: "done" },
  pending: { label: "Pending", icon: Pause, tone: "quiet" },
  skipped: { label: "Skipped", icon: Pause, tone: "quiet" },
  cancelled: { label: "Cancelled", icon: Pause, tone: "quiet" },
  unknown: { label: "Unknown", icon: Unknown, tone: "quiet" },
};

/**
 * The status the rail's glyph and the phone tab's rim show: the workflow
 * step's when `step` is given, the session's own otherwise. Not
 * `../session-status`'s `sessionStatus`, which is a row's mark status.
 */
export function stepSessionStatus(
  sessionId: string,
  step?: WorkflowStep["status"]
): SessionStatusOf {
  if (step) {
    return STEP[step];
  }
  // A run that ended stopped, on a session's scale; it says which way.
  const runId = runIdOf(sessionId);
  const run = runId ? workflowState.runs[runId] : undefined;
  if (run?.status === "done") {
    return { label: "Done", icon: Passed, tone: "done" };
  }
  if (run?.status === "cancelled") {
    return { label: "Cancelled", icon: Pause, tone: "quiet" };
  }
  const row = cawco.instanceIndex.byId.get(sessionId);
  if (row && isFailed(row)) {
    return { label: "Failed", icon: Failed, tone: "failed" };
  }
  if (row && isStale(row)) {
    return { label: "Unreachable", icon: Unknown, tone: "quiet" };
  }
  if (row?.status === "sleeping") {
    return { label: "Sleeping", icon: Sleeping, tone: "quiet" };
  }
  // Its end is asked and its machine has not confirmed the process gone: in
  // flight, as StopTray says it, until the hub files it stopped.
  if (row?.status === "stopping") {
    return { label: STOPPING_LABEL, icon: null, tone: "quiet" };
  }
  if (row?.status === "stopped") {
    return { label: STOPPED_LABEL, icon: Pause, tone: "quiet" };
  }
  const activity = cawco.activityOf(sessionId);
  if (activity === "blocked") {
    return { label: "Needs you", icon: Attention, tone: "attention" };
  }
  if (activity === "working") {
    return { label: "Working", icon: Working, tone: "working" };
  }
  if (!row) {
    return { label: "Stored", icon: Pause, tone: "quiet" };
  }
  return { label: "Idle", icon: Pause, tone: "quiet" };
}
