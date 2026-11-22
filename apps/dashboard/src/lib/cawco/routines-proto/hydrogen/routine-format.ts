import type { StatusPair } from "@cawco/core/views";
import {
  formatDay,
  formatNextClock,
  formatRelAge,
  LOCAL_ZONE,
  MOCK_NOW,
  type Routine,
  type RunOutcome,
} from "./routines-data";

export type StatusTone = StatusPair | "idle";

export type StatusGlyphKind =
  | "clock"
  | "error"
  | "hourglass"
  | "needs-you"
  | "neutral"
  | "not-yet"
  | "pause"
  | "running"
  | "success"
  | "warning";

interface OutcomeMeta {
  glyph: StatusGlyphKind;
  label: string;
  tone: StatusTone;
}

const RUN_OUTCOMES: Record<RunOutcome, OutcomeMeta> = {
  "could-not-check": { glyph: "error", label: "Couldn't check", tone: "fail" },
  delivered: { glyph: "success", label: "Done", tone: "done" },
  failed: { glyph: "error", label: "Failed", tone: "fail" },
  met: { glyph: "success", label: "Came true", tone: "done" },
  "not-yet": { glyph: "not-yet", label: "Not yet", tone: "idle" },
  "nothing-to-report": {
    glyph: "neutral",
    label: "Nothing to report",
    tone: "idle",
  },
  running: { glyph: "running", label: "Running", tone: "live" },
  skipped: { glyph: "neutral", label: "Skipped", tone: "idle" },
};

export function runOutcomeMeta(outcome: RunOutcome): OutcomeMeta {
  return RUN_OUTCOMES[outcome];
}

/**
 * What a routine's tile says: one plain sentence of what it last did or is
 * waiting for, and whether that needs the person. A routine needs him when it
 * stopped, or when its newest run failed; nothing else carries a mark.
 */
export interface RoutineReading {
  fixPrompt: string | null;
  needsYou: boolean;
  running: boolean;
  sentence: string;
}

function lower(text: string): string {
  return text ? `${text[0]?.toLowerCase() ?? ""}${text.slice(1)}` : text;
}

function fixPrompt(routine: Routine, reason: string): string {
  return `Fix the routine "${routine.name}": ${reason}.`;
}

export function readRoutine(
  routine: Routine,
  now: number = MOCK_NOW
): RoutineReading {
  const [latest] = routine.runs;
  const said = latest ? lower(latest.oneLine) : "";

  if (routine.status === "running") {
    return {
      fixPrompt: null,
      needsYou: false,
      running: true,
      sentence: `Running now: ${lower(routine.runningStep ?? "starting")}.`,
    };
  }
  if (routine.status === "stopped") {
    const reason = routine.statusReason ?? "Stopped";
    return {
      fixPrompt: fixPrompt(routine, latest?.oneLine ?? reason),
      needsYou: true,
      running: false,
      sentence: latest ? `${reason}: ${said}.` : `${reason}.`,
    };
  }
  if (
    latest &&
    (latest.outcome === "failed" || latest.outcome === "could-not-check")
  ) {
    return {
      fixPrompt: fixPrompt(routine, latest.oneLine),
      needsYou: true,
      running: false,
      sentence: `Failed ${formatRelAge(latest.startedAt, now)}: ${said}.`,
    };
  }
  if (routine.status === "paused") {
    return {
      fixPrompt: null,
      needsYou: false,
      running: false,
      sentence: `${routine.statusReason ?? "Paused"}.`,
    };
  }
  if (routine.status === "finished") {
    const metAt = routine.check?.metAt;
    const when = metAt ? ` ${formatDay(metAt)}` : "";
    return {
      fixPrompt: null,
      needsYou: false,
      running: false,
      sentence: latest ? `Finished${when}: ${said}.` : `Finished${when}.`,
    };
  }
  if (!latest) {
    return {
      fixPrompt: null,
      needsYou: false,
      running: false,
      sentence: "Hasn't run yet.",
    };
  }
  const verb = routine.check ? "Looked" : "Ran";
  return {
    fixPrompt: null,
    needsYou: false,
    running: false,
    sentence: `${verb} ${formatRelAge(latest.startedAt, now)}: ${said}.`,
  };
}

/** The rhythm in words, with its zone named only when it is not the person's. */
export function rhythmWords(routine: Routine): string {
  return routine.schedule.timezone === LOCAL_ZONE ||
    routine.schedule.rhythm.endsWith(routine.schedule.timezone)
    ? routine.schedule.rhythm
    : `${routine.schedule.rhythm} (${routine.schedule.timezone})`;
}

/** When it runs next, on the person's clock, or why it won't. */
export function nextRunWords(routine: Routine, now: number = MOCK_NOW): string {
  switch (routine.status) {
    case "finished":
      return "It won't run again: what it looked for came true.";
    case "paused":
      return "It won't run while it's paused.";
    case "stopped":
      return "It won't run again until it's fixed.";
    case "active":
    case "running":
      return routine.schedule.nextAt === null
        ? "No run is coming up."
        : `Next run ${formatNextClock(routine.schedule.nextAt, now)}.`;
  }
}

/** How the routine finds out whether what it looks for is true. */
export function checkWords(routine: Routine): string | null {
  const { check } = routine;
  if (!check) {
    return null;
  }
  const how =
    check.method === "command"
      ? "A shell command checks it; it is true when the command succeeds."
      : "An agent looks and judges.";
  let until = "It keeps looking until it is true.";
  if (check.metAt) {
    until = `It came true ${formatDay(check.metAt)}.`;
  } else if (check.giveUpAt) {
    until = `It gives up after ${formatDay(check.giveUpAt)}.`;
  }
  return `${how} ${until}`;
}
