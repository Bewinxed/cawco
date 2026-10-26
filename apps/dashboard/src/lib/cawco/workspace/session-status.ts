/**
 * What a session is doing, on one scale: its word, its glyph and its tone.
 * The rail's glyph (SessionStatus) and the phone tab's rim (PaneTabs) both
 * read it, so the two never disagree. Reads reactive
 * state: call it inside a `$derived` or a template.
 */
import type { Component } from "svelte";
import type { TransitionConfig } from "svelte/transition";
import {
  IconNeedsYou as Attention,
  IconError as Failed,
  IconPause as Pause,
  IconMoonSleep as Sleeping,
  IconAsk as Unknown,
  IconRenew as Working,
} from "#lib/icons.js";
import { STOPPED_LABEL, STOPPING_LABEL } from "../activity";
import { cawco, isFailed, isStale } from "../client.svelte";
import { dur, easeOut, motionOk, popScale } from "../motion/curves.svelte";
import { type NamedSession, sessionAnswer } from "../session-names.svelte";
import { STALLED_LABEL } from "../session-status";

export type StatusTone = "working" | "attention" | "failed" | "quiet";

export interface SessionStatusOf {
  /** None while it is on its way (stopping): the glyph is StopTray's spinner. */
  icon: Component | null;
  label: string;
  tone: StatusTone;
}

/** A session the hub's names answered for, on the session's scale (session-names.svelte.ts). */
const ANSWERED: Record<NamedSession["state"], SessionStatusOf> = {
  working: { label: "Working", icon: Working, tone: "working" },
  "needs-you": { label: "Needs you", icon: Attention, tone: "attention" },
  idle: { label: "Idle", icon: Pause, tone: "quiet" },
  ready: { label: "Idle", icon: Pause, tone: "quiet" },
  sleeping: { label: "Sleeping", icon: Sleeping, tone: "quiet" },
  ended: { label: STOPPED_LABEL, icon: Pause, tone: "quiet" },
  unknown: { label: "Unreachable", icon: Unknown, tone: "quiet" },
};

/**
 * The status the rail's glyph and the phone tab's rim show. Not
 * `../session-status`'s `sessionStatus`, which is a row's mark status.
 */
export function sessionStatusOf(sessionId: string): SessionStatusOf {
  const row = cawco.instanceIndex.byId.get(sessionId);
  if (row && isFailed(row)) {
    return { label: "Failed", icon: Failed, tone: "failed" };
  }
  if (row?.stalled) {
    return { label: STALLED_LABEL, icon: Failed, tone: "failed" };
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
    // A session the board does not hold (moved more than a day ago): in the
    // state the hub's names have it in; one the hub never started is stored.
    const answer = sessionAnswer(sessionId);
    return answer
      ? ANSWERED[answer.state]
      : { label: "Stored", icon: Pause, tone: "quiet" };
  }
  return { label: "Idle", icon: Pause, tone: "quiet" };
}

/**
 * A change of the status glyph (SessionStatus, StopTray): the new glyph
 * cross-fades over the old one at the control tier, coming up from the pop
 * scale; the old one only fades. With less motion, only the fade.
 */
export function glyphIn(_node: Element): TransitionConfig {
  const scale = motionOk.current ? popScale() : 1;
  return {
    duration: dur("--dur-control"),
    easing: easeOut,
    css: (t) => `opacity: ${t}; scale: ${scale + (1 - scale) * t}`,
  };
}
export function glyphOut(_node: Element): TransitionConfig {
  return {
    duration: dur("--dur-control"),
    easing: easeOut,
    css: (t) => `opacity: ${t}`,
  };
}
