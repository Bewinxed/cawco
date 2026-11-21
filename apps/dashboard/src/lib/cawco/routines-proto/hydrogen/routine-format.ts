import type { StatusPair } from "@cawco/core/views";
import {
  type ActionState,
  type ApprovedAction,
  daysUntil,
  type EventRule,
  type EventSource,
  formatDay,
  formatNextClock,
  formatRelAge,
  LOCAL_ZONE,
  MOCK_NOW,
  type Routine,
  type RoutineDoneWhen,
  type RoutineRun,
  type RunOutcome,
  type RunTrigger,
  type ServiceKey,
} from "./routines-data";

export interface StatusDescriptor {
  badge: StatusPair | "secondary";
  glyph: StatusGlyphKind;
  label: string;
  tone: StatusTone;
}

export type StatusTone = StatusPair | "idle";

export type StatusGlyphKind =
  | "clock"
  | "error"
  | "hourglass"
  | "neutral"
  | "not-yet"
  | "pause"
  | "running"
  | "success"
  | "warning";

export type RoutineAsk =
  | {
      action: ApprovedAction;
      id: string;
      kind: "action-waiting";
      routineId: string;
      sentence: string;
    }
  | {
      action: ApprovedAction;
      id: string;
      kind: "action-check";
      routineId: string;
      sentence: string;
    }
  | {
      fixPrompt: string;
      id: string;
      kind: "stopped";
      routineId: string;
      sentence: string;
      timedOut: boolean;
    }
  | {
      fixPrompt: string;
      id: string;
      kind: "run-failed";
      routineId: string;
      sentence: string;
    }
  | {
      id: string;
      kind: "agent-unkept";
      routineId: string;
      sentence: string;
      why?: string;
    }
  | {
      canResumeRule: boolean;
      id: string;
      kind: "trigger-fault";
      routineId: string;
      ruleId: string;
      sentence: string;
    };

const TRAILING_PERIOD_RE = /\.$/u;
const MISSING_CMD_RE = /(?:^|:\s*)([^\s:]+):\s*command not found/u;
const CHANNEL_PREFIX_RE = /^channel:\s*/u;

const SERVICE_NAMES: Record<ServiceKey, string> = {
  cloudflare: "Cloudflare",
  github: "GitHub",
  linear: "Linear",
  slack: "Slack",
};

const TRIGGER_LABELS: Record<RunTrigger, string> = {
  "creation-test": "Creation test",
  event: "Event",
  manual: "Run by you",
  schedule: "Scheduled",
};

const RUN_OUTCOMES: Record<RunOutcome, StatusDescriptor> = {
  "could-not-check": {
    badge: "fail",
    glyph: "error",
    label: "Couldn't check",
    tone: "fail",
  },
  delivered: {
    badge: "done",
    glyph: "success",
    label: "Delivered",
    tone: "done",
  },
  failed: {
    badge: "fail",
    glyph: "error",
    label: "Failed",
    tone: "fail",
  },
  met: {
    badge: "done",
    glyph: "success",
    label: "Done",
    tone: "done",
  },
  "not-yet": {
    badge: "secondary",
    glyph: "not-yet",
    label: "Not yet",
    tone: "idle",
  },
  "nothing-to-report": {
    badge: "secondary",
    glyph: "neutral",
    label: "Nothing to report",
    tone: "idle",
  },
  queued: {
    badge: "secondary",
    glyph: "clock",
    label: "Waiting behind another run",
    tone: "idle",
  },
  running: {
    badge: "live",
    glyph: "running",
    label: "Running now",
    tone: "live",
  },
  skipped: {
    badge: "secondary",
    glyph: "neutral",
    label: "Skipped",
    tone: "idle",
  },
  stopped: {
    badge: "secondary",
    glyph: "pause",
    label: "Stopped",
    tone: "idle",
  },
};

const ACTION_STATES: Record<
  Exclude<ActionState, "failed" | "unknown">,
  StatusDescriptor
> = {
  approved: {
    badge: "live",
    glyph: "clock",
    label: "Scheduled",
    tone: "live",
  },
  cancelled: {
    badge: "secondary",
    glyph: "neutral",
    label: "Cancelled",
    tone: "idle",
  },
  denied: {
    badge: "secondary",
    glyph: "neutral",
    label: "Denied",
    tone: "idle",
  },
  ran: {
    badge: "done",
    glyph: "success",
    label: "Ran",
    tone: "done",
  },
  running: {
    badge: "live",
    glyph: "running",
    label: "Running",
    tone: "live",
  },
  waiting: {
    badge: "attn",
    glyph: "warning",
    label: "Waiting on you",
    tone: "attn",
  },
};

export function serviceName(service: ServiceKey): string {
  return SERVICE_NAMES[service];
}

export function triggerLabel(trigger: RunTrigger): string {
  return TRIGGER_LABELS[trigger];
}

export function runOutcomeMeta(outcome: RunOutcome): StatusDescriptor {
  return RUN_OUTCOMES[outcome];
}

export function routineStatusMeta(
  routine: Routine,
  now: number = MOCK_NOW
): StatusDescriptor {
  if (routine.status === "running") {
    return { badge: "live", glyph: "running", label: "Running", tone: "live" };
  }
  if (routine.status === "stopped") {
    return {
      badge: "fail",
      glyph: "error",
      label: routine.statusReason ?? "Stopped by CawCo",
      tone: "fail",
    };
  }
  if (routine.status === "finished") {
    const metAt = routine.doneWhen?.metAt;
    const day = metAt ? ` ${formatDay(metAt)}` : "";
    return {
      badge: "done",
      glyph: "success",
      label: routine.doneWhen?.markedDoneByOwner
        ? `Done${day}; you said so`
        : `Done${day}`,
      tone: "done",
    };
  }
  if (routine.status === "paused") {
    return {
      badge: "secondary",
      glyph: "pause",
      label: routine.statusReason ?? "Paused",
      tone: "idle",
    };
  }
  const [latest] = routine.runs;
  if (
    latest &&
    (latest.outcome === "failed" || latest.outcome === "could-not-check")
  ) {
    return {
      badge: "fail",
      glyph: "error",
      label: "Last run failed",
      tone: "fail",
    };
  }
  if (
    routine.origin.by === "session" &&
    !routine.origin.kept &&
    routine.origin.expiresAt
  ) {
    const days = daysUntil(routine.origin.expiresAt, now);
    return {
      badge: "attn",
      glyph: "hourglass",
      label: `Turns off in ${days} ${days === 1 ? "day" : "days"}`,
      tone: "attn",
    };
  }
  return { badge: "secondary", glyph: "clock", label: "On", tone: "idle" };
}

export function actionStateMeta(
  state: ActionState,
  needsLook?: boolean
): StatusDescriptor {
  if (state === "failed") {
    return {
      badge: "fail",
      glyph: "error",
      label: needsLook ? "Failed · check service" : "Failed",
      tone: "fail",
    };
  }
  if (state === "unknown") {
    return {
      badge: needsLook ? "attn" : "secondary",
      glyph: "warning",
      label: needsLook ? "Outcome unknown · check service" : "Outcome unknown",
      tone: needsLook ? "attn" : "idle",
    };
  }
  return ACTION_STATES[state];
}

export function doneWhenStatusSentence(
  routine: Routine,
  now: number = MOCK_NOW
): string | null {
  const { doneWhen } = routine;
  if (!doneWhen) {
    return null;
  }
  const target = doneWhen.statement.replace(TRAILING_PERIOD_RE, "");
  switch (doneWhen.standing) {
    case "met": {
      const when = doneWhen.metAt ? ` ${formatDay(doneWhen.metAt)}` : "";
      return doneWhen.markedDoneByOwner
        ? `Done${when}; you said so.`
        : `Done${when}.`;
    }
    case "not-yet": {
      const checked = doneWhen.checkedAt
        ? `; checked ${formatRelAge(doneWhen.checkedAt, now)}`
        : "";
      return `Waiting for: ${target}. Not yet${checked}.`;
    }
    case "pending":
      return `Waiting for: ${target}. Not checked yet.`;
    case "could-not-check": {
      const checked = doneWhen.checkedAt
        ? ` ${formatRelAge(doneWhen.checkedAt, now)}`
        : "";
      return `Waiting for: ${target}. Couldn't check${checked}.`;
    }
    case "failing":
      return `Waiting for: ${target}. Stopped after 3 failed checks.`;
    case "timed-out":
      return `Waiting for: ${target}. Stopped ${doneWhen.giveUpAt ? formatDay(doneWhen.giveUpAt) : "at end date"}; not done in time.`;
    case "paused":
      return `Waiting for: ${target}. Paused.`;
  }
}

export function comingUpTimeLabel(
  routine: Routine,
  now: number = MOCK_NOW
): string {
  if (routine.status === "running") {
    return "Running now";
  }
  if (routine.schedule.nextAt === null) {
    return routine.schedule.rhythm;
  }
  return formatNextClock(routine.schedule.nextAt, now);
}

export function findSoonestRoutine(
  routines: Routine[]
): { at: number; name: string } | null {
  let pick: { at: number; name: string } | null = null;
  for (const routine of routines) {
    const { nextAt } = routine.schedule;
    const isScheduled =
      routine.status === "active" || routine.status === "running";
    if (!isScheduled || nextAt === null) {
      continue;
    }
    if (pick === null || nextAt < pick.at) {
      pick = { at: nextAt, name: routine.name };
    }
  }
  return pick;
}

export function formatHeldSummary(
  heldTasks: { id: string; title?: string }[],
  heldSteps: number,
  withTitles = false
): string {
  const parts: string[] = heldTasks.map((task) =>
    withTitles && task.title ? `${task.id} (${task.title})` : task.id
  );
  if (heldSteps > 0) {
    parts.push(`${heldSteps} plan ${heldSteps === 1 ? "step" : "steps"}`);
  }
  return parts.join(", ");
}

export function buildSpendStats(
  routine: Routine
): { label: string; value: string }[] {
  const { limits } = routine;
  const rows: { label: string; value: string }[] = [
    {
      label: "Spent this week",
      value:
        limits.spentWeekDollars === undefined
          ? "$0.00 (shell)"
          : `$${limits.spentWeekDollars.toFixed(2)}`,
    },
    {
      label: "Spent today",
      value:
        limits.spentTodayDollars === undefined
          ? "$0.00"
          : `$${limits.spentTodayDollars.toFixed(2)}`,
    },
    {
      label: "Daily cap",
      value:
        limits.dailyCapDollars === undefined
          ? "None set"
          : `$${limits.dailyCapDollars.toFixed(2)} / day`,
    },
    {
      label: "Per-run budget",
      value:
        limits.maxDollars === undefined
          ? "No model spend"
          : `$${limits.maxDollars.toFixed(2)}`,
    },
    { label: "Time limit", value: `${limits.maxMinutes} min` },
  ];
  if (limits.maxTurns !== undefined) {
    rows.push({ label: "Turn limit", value: `${limits.maxTurns} turns` });
  }
  return rows;
}

export function nextRunSummary(
  routine: Routine,
  now: number = MOCK_NOW
): { blocked: boolean; primary: string; secondary: string | null } {
  const { doneWhen, schedule, status, statusReason } = routine;
  if (status === "finished") {
    return {
      blocked: true,
      primary: doneWhen?.markedDoneByOwner
        ? "Done; you said so"
        : "Done · won't run again",
      secondary: doneWhen?.metAt
        ? `Finished ${formatDay(doneWhen.metAt)}`
        : null,
    };
  }
  if (status === "stopped") {
    return {
      blocked: true,
      primary: "Stopped",
      secondary: statusReason ?? "Needs your decision",
    };
  }
  if (status === "paused") {
    return {
      blocked: true,
      primary: "Paused",
      secondary: statusReason ?? "Won't run until resumed",
    };
  }
  if (doneWhen && doneWhen.heldTasks.length === 0 && doneWhen.heldSteps === 0) {
    return {
      blocked: true,
      primary: "Waiting for a dependent task",
      secondary: schedule.rhythm,
    };
  }
  if (schedule.nextAt !== null) {
    const zoneNote =
      schedule.timezone === LOCAL_ZONE ? null : `Set in ${schedule.timezone}`;
    return {
      blocked: false,
      primary: formatNextClock(schedule.nextAt, now),
      secondary: zoneNote
        ? `${schedule.rhythm} · ${zoneNote}`
        : schedule.rhythm,
    };
  }
  return {
    blocked: false,
    primary: schedule.rhythm,
    secondary: null,
  };
}

export function commandFailureLabel(run: RoutineRun): string | null {
  if (
    run.attribution !== "command" ||
    (run.outcome !== "failed" && run.outcome !== "could-not-check") ||
    run.exitCode === undefined ||
    run.exitCode === null
  ) {
    return null;
  }
  return `Command failed (exit ${run.exitCode})`;
}

function extractRuleFilters(rule: EventRule): Map<string, string> {
  const filters = new Map<string, string>();
  for (const item of rule.filters) {
    const idx = item.indexOf(":");
    if (idx !== -1) {
      filters.set(item.slice(0, idx).trim(), item.slice(idx + 1).trim());
    }
  }
  return filters;
}

function formatGitHubRule(
  rule: EventRule,
  lead: string,
  filters: Map<string, string>
): string | null {
  if (rule.eventKinds.includes("pull_request.closed")) {
    const branch = filters.get("branch");
    const verb = filters.get("merged") === "true" ? "merges" : "closes";
    return `${lead} when a PR ${verb}${branch ? ` to ${branch}` : ""} on GitHub`;
  }
  if (rule.eventKinds.includes("release.published")) {
    const repo = filters.get("repo");
    return `${lead} when a release is published${repo ? ` on ${repo}` : ""} (GitHub)`;
  }
  return null;
}

function formatSlackRule(
  rule: EventRule,
  lead: string,
  filters: Map<string, string>
): string | null {
  if (!rule.eventKinds.includes("message.posted")) {
    return null;
  }
  const channel = filters.get("channel");
  const text = filters.get("text");
  const ch = channel ? ` ${channel}` : "";
  const match = text ? ` containing ${text}` : "";
  return `${lead} on Slack${ch} messages${match}`;
}

export function eventRuleSentence(
  rule: EventRule,
  hasSchedule: boolean
): string {
  const lead = hasSchedule ? "Also starts" : "Starts";
  const filters = extractRuleFilters(rule);
  if (rule.service === "github") {
    const text = formatGitHubRule(rule, lead, filters);
    if (text) {
      return text;
    }
  } else if (rule.service === "slack") {
    const text = formatSlackRule(rule, lead, filters);
    if (text) {
      return text;
    }
  }
  const detail = rule.filters.length > 0 ? ` (${rule.filters.join(", ")})` : "";
  return `${lead} on ${rule.serviceName} ${rule.eventKinds.join(", ")}${detail}`;
}

export function actionOutcomeSummary(action: ApprovedAction): string {
  return action.shortOutcome ?? action.sentence;
}

function uncapitalize(text: string): string {
  if (!text) {
    return text;
  }
  return `${text[0]?.toLowerCase() ?? ""}${text.slice(1)}`;
}

function holdingPhrase(doneWhen: RoutineDoneWhen | undefined): string {
  if (!doneWhen) {
    return "";
  }
  const total = doneWhen.heldTasks.length + doneWhen.heldSteps;
  if (total === 0) {
    return "";
  }
  const [firstTask] = doneWhen.heldTasks;
  if (!firstTask) {
    return ` Holding ${doneWhen.heldSteps} plan ${doneWhen.heldSteps === 1 ? "step" : "steps"}.`;
  }
  const rest = total - 1;
  return rest > 0
    ? ` Holding ${firstTask.title} and ${rest} more.`
    : ` Holding ${firstTask.title}.`;
}

function formatStoppedSentence(routine: Routine): {
  sentence: string;
  timedOut: boolean;
} {
  const dw = routine.doneWhen;
  const hold = holdingPhrase(dw);
  if (dw?.standing === "timed-out") {
    const when = dw.giveUpAt ? formatDay(dw.giveUpAt) : "end date";
    return {
      sentence: `Stopped at ${when}; not done in time.${hold}`,
      timedOut: true,
    };
  }
  if (dw?.lastExitCode === 127 && dw.lastWords) {
    const missing = dw.lastWords.match(MISSING_CMD_RE)?.[1];
    if (missing) {
      return {
        sentence: `Can't check: ${missing} isn't installed on ${dw.machineName} (exit 127).${hold}`,
        timedOut: false,
      };
    }
  }
  if (dw?.lastWords) {
    const code =
      dw.lastExitCode !== undefined && dw.lastExitCode !== null
        ? ` (exit ${dw.lastExitCode})`
        : "";
    return {
      sentence: `Stopped: ${dw.lastWords}${code}.${hold}`,
      timedOut: false,
    };
  }
  return {
    sentence: `Stopped: ${routine.statusReason ?? "needs your decision"}.${hold}`,
    timedOut: false,
  };
}

function buildFixPrompt(routine: Routine, reason: string): string {
  const cmd = routine.doneWhen?.command
    ? ` Command: \`${routine.doneWhen.command}\` on ${routine.doneWhen.machineName}.`
    : "";
  return `Fix routine "${routine.name}": ${reason}${cmd}`;
}

function collectHealthAsks(routine: Routine, now: number): RoutineAsk[] {
  if (routine.status === "stopped") {
    const stopped = formatStoppedSentence(routine);
    const reasonText =
      routine.doneWhen?.lastWords ?? routine.statusReason ?? "routine stopped";
    return [
      {
        fixPrompt: buildFixPrompt(routine, reasonText),
        id: `ask-stop-${routine.id}`,
        kind: "stopped",
        routineId: routine.id,
        sentence: stopped.sentence,
        timedOut: stopped.timedOut,
      },
    ];
  }
  const [latest] = routine.runs;
  if (
    routine.status === "active" &&
    latest &&
    (latest.outcome === "failed" || latest.outcome === "could-not-check")
  ) {
    return [
      {
        fixPrompt: buildFixPrompt(routine, latest.oneLine),
        id: `ask-fail-${routine.id}`,
        kind: "run-failed",
        routineId: routine.id,
        sentence: `Last run failed ${formatRelAge(latest.startedAt, now)}: ${latest.oneLine}.${holdingPhrase(routine.doneWhen)}`,
      },
    ];
  }
  return [];
}

function collectActionAsks(
  routineId: string,
  actions: ApprovedAction[]
): RoutineAsk[] {
  const list: RoutineAsk[] = [];
  for (const action of actions) {
    if (action.routineId !== routineId) {
      continue;
    }
    if (action.state === "waiting") {
      list.push({
        action,
        id: `ask-wait-${action.id}`,
        kind: "action-waiting",
        routineId,
        sentence: `Wants to ${uncapitalize(action.sentence)}`,
      });
    } else if (
      action.needsLook &&
      (action.state === "unknown" || action.state === "failed")
    ) {
      const svc = serviceName(action.service);
      const base = uncapitalize(
        action.sentence.replace(TRAILING_PERIOD_RE, "")
      );
      const summary =
        action.shortOutcome ??
        (action.state === "unknown"
          ? `${svc} didn't confirm: ${base}.`
          : `${svc} failed: ${base}.`);
      list.push({
        action,
        id: `ask-look-${action.id}`,
        kind: "action-check",
        routineId,
        sentence: `${summary} Check ${svc}.`,
      });
    }
  }
  return list;
}

function collectTriggerAsks(
  routineId: string,
  rules: EventRule[],
  sources: EventSource[]
): RoutineAsk[] {
  const list: RoutineAsk[] = [];
  for (const rule of rules) {
    if (rule.routineId !== routineId) {
      continue;
    }
    const source = sources.find((one) => one.service === rule.service);
    if (source?.error) {
      list.push({
        canResumeRule: false,
        id: `ask-src-${rule.id}`,
        kind: "trigger-fault",
        routineId,
        ruleId: rule.id,
        sentence: `Won't start from ${rule.serviceName}: ${source.error}`,
      });
    } else if (source && !source.enabled) {
      list.push({
        canResumeRule: false,
        id: `ask-src-${rule.id}`,
        kind: "trigger-fault",
        routineId,
        ruleId: rule.id,
        sentence: `Won't start from ${rule.serviceName}: event source paused.`,
      });
    } else if (!rule.enabled) {
      const channel = rule.filters
        .find((one) => one.startsWith("channel:"))
        ?.replace(CHANNEL_PREFIX_RE, "");
      list.push({
        canResumeRule: true,
        id: `ask-rule-${rule.id}`,
        kind: "trigger-fault",
        routineId,
        ruleId: rule.id,
        sentence: `Won't start from ${rule.serviceName}${channel ? ` (${channel})` : ""}: rule paused.`,
      });
    }
  }
  return list;
}

export function deriveRoutineAsks(input: {
  actions: ApprovedAction[];
  now?: number;
  routine: Routine;
  rules: EventRule[];
  sources: EventSource[];
}): RoutineAsk[] {
  const now = input.now ?? MOCK_NOW;
  const { routine, actions, rules, sources } = input;
  const asks: RoutineAsk[] = [
    ...collectHealthAsks(routine, now),
    ...collectActionAsks(routine.id, actions),
  ];

  if (routine.origin.by === "session" && !routine.origin.kept) {
    const days = routine.origin.expiresAt
      ? daysUntil(routine.origin.expiresAt, now)
      : 7;
    const by = routine.origin.sessionTitle ?? "an agent session";
    asks.push({
      id: `ask-keep-${routine.id}`,
      kind: "agent-unkept",
      routineId: routine.id,
      sentence: `Made by ${by}; turns off in ${days} ${days === 1 ? "day" : "days"}.`,
      why: routine.origin.why,
    });
  }

  asks.push(...collectTriggerAsks(routine.id, rules, sources));
  return asks;
}
