import type { StatusPair } from "@cawco/core/views";
import {
  type ActionState,
  type CheckStanding,
  daysUntil,
  formatDay,
  formatNextClock,
  LOCAL_ZONE,
  MOCK_NOW,
  type Routine,
  type RoutineRun,
  type RunOutcome,
  type RunTrigger,
  type ServiceKey,
} from "./routines-data";

export type StatusTone = StatusPair | "idle";

export type StatusGlyphKind =
  | "running"
  | "error"
  | "hourglass"
  | "success"
  | "pause"
  | "clock"
  | "not-yet"
  | "neutral"
  | "warning";

type BadgeTone = StatusPair | "secondary";

export interface StatusDescriptor {
  badge: BadgeTone;
  glyph: StatusGlyphKind;
  label: string;
  tone: StatusTone;
}

export function serviceName(service: ServiceKey): string {
  switch (service) {
    case "github":
      return "GitHub";
    case "slack":
      return "Slack";
    case "linear":
      return "Linear";
    case "cloudflare":
      return "Cloudflare";
  }
}

export function triggerLabel(trigger: RunTrigger): string {
  switch (trigger) {
    case "schedule":
      return "Scheduled";
    case "event":
      return "Event";
    case "manual":
      return "Run by you";
    case "creation-test":
      return "Creation test";
  }
}

export function runOutcomeMeta(outcome: RunOutcome): StatusDescriptor {
  switch (outcome) {
    case "running":
      return {
        label: "Running now",
        glyph: "running",
        tone: "live",
        badge: "live",
      };
    case "queued":
      return {
        label: "Waiting behind another run",
        glyph: "clock",
        tone: "idle",
        badge: "secondary",
      };
    case "delivered":
      return {
        label: "Delivered",
        glyph: "success",
        tone: "done",
        badge: "done",
      };
    case "met":
      return {
        label: "Met",
        glyph: "success",
        tone: "done",
        badge: "done",
      };
    case "nothing-to-report":
      return {
        label: "Nothing to report",
        glyph: "neutral",
        tone: "idle",
        badge: "secondary",
      };
    case "not-yet":
      return {
        label: "Not yet",
        glyph: "not-yet",
        tone: "idle",
        badge: "secondary",
      };
    case "skipped":
      return {
        label: "Skipped",
        glyph: "neutral",
        tone: "idle",
        badge: "secondary",
      };
    case "stopped":
      return {
        label: "Stopped",
        glyph: "pause",
        tone: "idle",
        badge: "secondary",
      };
    case "failed":
      return {
        label: "Failed",
        glyph: "error",
        tone: "fail",
        badge: "fail",
      };
    case "could-not-check":
      return {
        label: "Could not check",
        glyph: "error",
        tone: "fail",
        badge: "fail",
      };
  }
}

export function checkStandingMeta(
  standing: CheckStanding,
  markedByOwner?: boolean
): StatusDescriptor {
  switch (standing) {
    case "pending":
      return {
        label: "No answer yet",
        glyph: "clock",
        tone: "idle",
        badge: "secondary",
      };
    case "not-yet":
      return {
        label: "Not yet met",
        glyph: "not-yet",
        tone: "idle",
        badge: "secondary",
      };
    case "could-not-check":
      return {
        label: "Could not check",
        glyph: "warning",
        tone: "attn",
        badge: "attn",
      };
    case "met":
      return {
        label: markedByOwner ? "Met by you" : "Met",
        glyph: "success",
        tone: "done",
        badge: "done",
      };
    case "timed-out":
      return {
        label: "Not met by its date",
        glyph: "warning",
        tone: "attn",
        badge: "attn",
      };
    case "failing":
      return {
        label: "Stopped after 3 failed checks",
        glyph: "error",
        tone: "fail",
        badge: "fail",
      };
    case "paused":
      return {
        label: "Paused",
        glyph: "pause",
        tone: "idle",
        badge: "secondary",
      };
  }
}

export function routineStatusMeta(
  routine: Routine,
  now: number = MOCK_NOW
): StatusDescriptor {
  if (routine.status === "running") {
    return {
      label: "Running",
      glyph: "running",
      tone: "live",
      badge: "live",
    };
  }
  if (routine.status === "stopped") {
    return {
      label: routine.statusReason ?? "Stopped by CawCo",
      glyph: "error",
      tone: "fail",
      badge: "fail",
    };
  }
  if (routine.status === "finished") {
    return {
      label: routine.check?.markedMetByOwner ? "Met by you" : "Finished · met",
      glyph: "success",
      tone: "done",
      badge: "done",
    };
  }
  if (routine.status === "paused") {
    return {
      label: routine.statusReason ?? "Paused",
      glyph: "pause",
      tone: "idle",
      badge: "secondary",
    };
  }
  const [latest] = routine.runs;
  if (
    latest &&
    (latest.outcome === "failed" || latest.outcome === "could-not-check")
  ) {
    if (
      routine.origin.by === "session" &&
      !routine.origin.kept &&
      routine.origin.expiresAt
    ) {
      const days = daysUntil(routine.origin.expiresAt, now);
      return {
        label: `Turns off in ${days}d · failed`,
        glyph: "error",
        tone: "fail",
        badge: "fail",
      };
    }
    return {
      label: "Last run failed",
      glyph: "error",
      tone: "fail",
      badge: "fail",
    };
  }
  if (
    routine.origin.by === "session" &&
    !routine.origin.kept &&
    routine.origin.expiresAt
  ) {
    const days = daysUntil(routine.origin.expiresAt, now);
    return {
      label: `Turns off in ${days} ${days === 1 ? "day" : "days"}`,
      glyph: "hourglass",
      tone: "attn",
      badge: "attn",
    };
  }
  return {
    label: "On",
    glyph: "clock",
    tone: "idle",
    badge: "secondary",
  };
}

export function actionStateMeta(
  state: ActionState,
  needsLook?: boolean
): StatusDescriptor {
  switch (state) {
    case "waiting":
      return {
        label: "Waiting on you",
        glyph: "warning",
        tone: "attn",
        badge: "attn",
      };
    case "approved":
      return {
        label: "Approved · scheduled",
        glyph: "clock",
        tone: "live",
        badge: "live",
      };
    case "running":
      return {
        label: "Running",
        glyph: "running",
        tone: "live",
        badge: "live",
      };
    case "ran":
      return {
        label: "Ran",
        glyph: "success",
        tone: "done",
        badge: "done",
      };
    case "failed":
      return {
        label: needsLook ? "Failed · check service" : "Failed",
        glyph: "error",
        tone: "fail",
        badge: "fail",
      };
    case "unknown":
      return {
        label: needsLook
          ? "Outcome unknown · check service"
          : "Outcome unknown",
        glyph: "warning",
        tone: needsLook ? "attn" : "idle",
        badge: needsLook ? "attn" : "secondary",
      };
    case "denied":
      return {
        label: "Denied",
        glyph: "neutral",
        tone: "idle",
        badge: "secondary",
      };
    case "cancelled":
      return {
        label: "Cancelled",
        glyph: "neutral",
        tone: "idle",
        badge: "secondary",
      };
  }
}

/** Truthful next-run label on the owner's clock, or why the next run will not fire (T3). */
export function nextRunSummary(
  routine: Routine,
  now: number = MOCK_NOW
): { blocked: boolean; primary: string; secondary: string | null } {
  if (routine.status === "finished") {
    return {
      blocked: true,
      primary: routine.check?.markedMetByOwner
        ? "Met by you · done"
        : "Met · won't run again",
      secondary: routine.check?.metAt
        ? `Finished ${formatDay(routine.check.metAt)}`
        : null,
    };
  }
  if (routine.status === "stopped") {
    return {
      blocked: true,
      primary: "Stopped",
      secondary: routine.statusReason ?? "Needs your decision",
    };
  }
  if (routine.status === "paused") {
    return {
      blocked: true,
      primary: "Paused",
      secondary: routine.statusReason ?? "Won't run until resumed",
    };
  }
  if (
    routine.check &&
    routine.check.heldTasks.length === 0 &&
    routine.check.heldSteps === 0
  ) {
    return {
      blocked: true,
      primary: "No look · nothing waits",
      secondary: routine.schedule.rhythm,
    };
  }
  if (routine.schedule.nextAt !== null) {
    const clock = formatNextClock(routine.schedule.nextAt, now);
    const zoneNote =
      routine.schedule.timezone === LOCAL_ZONE
        ? null
        : `Set in ${routine.schedule.timezone}`;
    let secondary = routine.schedule.rhythm;
    if (routine.schedule.eventSummary) {
      secondary = `${routine.schedule.rhythm} ${routine.schedule.eventSummary}`;
    } else if (zoneNote) {
      secondary = `${routine.schedule.rhythm} · ${zoneNote}`;
    }
    return {
      blocked: false,
      primary: clock,
      secondary,
    };
  }
  if (routine.schedule.cadence === "events") {
    return {
      blocked: false,
      primary: "On matching event",
      secondary: routine.schedule.rhythm,
    };
  }
  return {
    blocked: false,
    primary: routine.schedule.rhythm,
    secondary: null,
  };
}

export function attributionLabel(run: RoutineRun): string {
  switch (run.attribution) {
    case "model":
      return "Model said";
    case "command":
      return run.exitCode !== undefined && run.exitCode !== null
        ? `Command output (exit ${run.exitCode})`
        : "Command output";
    case "system":
      return "CawCo run notice";
  }
}

export function exitCodeReading(code: number | null | undefined): string {
  if (code === null || code === undefined) {
    return "No exit code recorded";
  }
  if (code === 0) {
    return "Exit 0 · fact met";
  }
  if (code === 124 || code === 126 || code === 127 || code > 128) {
    return `Exit ${code} · could not check`;
  }
  return `Exit ${code} · not yet met`;
}
