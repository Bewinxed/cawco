import type { StatusPair } from "@cawco/core/views";
import {
  formatDay,
  formatNextClock,
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
 * What a routine's row says: one plain sentence of what it last did or is
 * waiting for, and whether that needs the person. A routine needs him when it
 * stopped, or when its newest run failed; nothing else carries a mark. When
 * it last ran stands in its own column, so the sentence carries no time.
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

/** The words with their first letter raised, to open a sentence or a cell. */
export function upper(text: string): string {
  return text ? `${text[0]?.toUpperCase() ?? ""}${text.slice(1)}` : text;
}

function fixPrompt(routine: Routine, reason: string): string {
  return `Fix the routine "${routine.name}": ${reason}.`;
}

export function readRoutine(routine: Routine): RoutineReading {
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
      sentence: `Failed: ${said}.`,
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
    return {
      fixPrompt: null,
      needsYou: false,
      running: false,
      sentence: latest ? `Finished: ${said}.` : "Finished.",
    };
  }
  return {
    fixPrompt: null,
    needsYou: false,
    running: false,
    sentence: latest ? `${upper(latest.oneLine)}.` : "Hasn't run yet.",
  };
}

/** When it ran last, spelled out; none before its first run. */
export function lastRunAt(routine: Routine): number | undefined {
  return routine.runs[0]?.startedAt;
}

/** When it runs next; none while it is stopped, paused or finished. */
export function nextRunAt(routine: Routine): number | undefined {
  return (routine.status === "active" || routine.status === "running") &&
    routine.schedule.nextAt !== null
    ? routine.schedule.nextAt
    : undefined;
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
