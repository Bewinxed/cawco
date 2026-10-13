/**
 * A project's custom views (Projects spec §5.2, D17): what the hub, the
 * dashboard and the app share about them. A view is an OpenUI Lang program
 * (`views/<name>.oui`, drafts `views/drafts/<name>.oui`) over CawCo's
 * component library (`@cawco/core/views-library`), bound to data only
 * through the view tools below, which are hub routes.
 */

/** The fixed kinds a stage belongs to (WORDS.md: kind). */
export const STAGE_KINDS = [
  "todo",
  "active",
  "waiting",
  "you",
  "done",
  "dropped",
] as const;
export type StageKind = (typeof STAGE_KINDS)[number];

/** The tones a badge or stat tile takes: DESIGN.md's status pairs, or none. */
export const VIEW_TONES = ["neutral", "live", "attn", "done", "fail"] as const;
export type ViewTone = (typeof VIEW_TONES)[number];

/** Text roles a view may set: DESIGN.md's (The Role, Not Size Rule). */
export const VIEW_TEXT_ROLES = ["title", "label", "body", "meta"] as const;
export type ViewTextRole = (typeof VIEW_TEXT_ROLES)[number];

/**
 * A view as `GET /api/projects/:id/views` lists it: kept (`views/<name>.oui`)
 * or a draft (`views/drafts/<name>.oui`), its program as written, and the
 * components it names that CawCo's library does not have, which are left out
 * when it is drawn (the hub's parse, the same one the dashboard renders with).
 */
export interface ProjectView {
  draft: boolean;
  /** Components the program names that the library does not have, by name: dropped, not invented. */
  dropped: string[];
  name: string;
  /** The OpenUI Lang program. */
  source: string;
}

// --- the view tools: what a view's Query() reads -----------------------------

/** The view tools, by the name a view's `Query("…")` calls. Every one is a hub route; there are no mutations. */
export const VIEW_TOOLS = [
  "tasks",
  "stages",
  "routines",
  "spend",
  "events",
] as const;
export type ViewToolName = (typeof VIEW_TOOLS)[number];

/** One task as the `tasks` tool answers it: the board's row, and its dates. */
export interface ViewTask {
  /** The tasks it waits on that have not landed, by id. */
  blockedBy: string[];
  /**
   * Its dates, ms epoch, by name: `createdAt` and `updatedAt` always (the
   * commit that added its file, and its file's last change: its last commit,
   * or an edit no commit has yet); `startedAt` (its first move into an active
   * stage), `completedAt` and `droppedAt` (its move into the done or dropped
   * stage it is in) once they happen; `attemptStartedAt` and `attemptEndedAt` of its newest
   * attempt when it has one; and every field its file carries whose value is
   * an ISO 8601 date, under the field's own name.
   */
  dates: Record<string, number>;
  /** The front matter fields its file carries beyond a task file's own, as written. */
  fields: Record<string, string>;
  id: string;
  /** Its stage's kind; null when its stage is not one of the project's. */
  kind: StageKind | null;
  labels: string[];
  liveAttempt: boolean;
  needsYou: boolean;
  number: number;
  rank: string | null;
  stage: string;
  title: string;
  todos: { done: number; total: number };
  type: string | null;
}

/** What the `tasks` tool takes: filters, each optional. */
export interface ViewTasksInput {
  kind?: StageKind;
  label?: string;
  stage?: string;
}

export interface ViewTasksOutput {
  /** The project's tasks, in rank order. */
  rows: ViewTask[];
}

/** One stage with its count. */
export interface ViewStage {
  /** Tasks in it now. */
  count: number;
  kind: StageKind;
  name: string;
}

export interface ViewStagesOutput {
  /** Tasks in a stage of each kind. */
  byKind: Record<StageKind, number>;
  project: { id: string; name: string };
  /** The project's stages, in the order its stages file names them. */
  stages: ViewStage[];
  /** Every task. */
  total: number;
}

/** What the `routines` tool takes: how many of each routine's newest runs to answer. */
export interface ViewRoutinesInput {
  runs?: number;
}

/** One run of a routine. */
export interface ViewRoutineRun {
  endedAt: number | null;
  /** How it ended: `delivered`, `silent`, `failed`; null while it runs or when it was skipped. */
  outcome: string | null;
  /** Why it was skipped or queued, or how it failed. */
  reason: string | null;
  /** `test`, `by-hand`, `event`, `inbox`, or the time of its scheduled slot in the routine's zone ("09:00"). */
  slot: string;
  startedAt: number;
  state: string;
  usd: number | null;
}

/** One routine of the project, with its newest runs. */
export interface ViewRoutine {
  cron: string;
  delegateType: string | null;
  enabled: boolean;
  id: string;
  lastSlot: number | null;
  name: string;
  nextSlot: number;
  /** Newest first. */
  runs: ViewRoutineRun[];
  /** A fresh delegate each run, a message to Caw, or the project's memory curator. */
  target: "delegate" | "lead" | "curator";
  timeZone: string;
}

export interface ViewRoutinesOutput {
  rows: ViewRoutine[];
}

/** What the `spend` tool takes: the window, in days back from now. */
export interface ViewSpendInput {
  days?: number;
}

export interface ViewSpendOutput {
  /** Each routine of the project: what its runs in the window spent, and how many there were. */
  byRoutine: { name: string; routineId: string; runs: number; usd: number }[];
  /** Each delegate type the project's delegated work ran on in the window (null: none named), and its items. */
  byType: { items: number; type: string | null; usd: number }[];
  /** The window's start, ms epoch. */
  since: number;
  /** The window's end: now. */
  until: number;
}

/** What the `events` tool takes: how many of the newest to answer. */
export interface ViewEventsInput {
  limit?: number;
}

/** One inbound event from outside (GitHub, a polled connection). */
export interface ViewEvent {
  /** When a routine took it, or null while none has. */
  handledAt: number | null;
  id: string;
  /** What kind of event it is (`issues.opened`, `pull_request.closed`, a connector's kind). */
  kind: string;
  receivedAt: number;
  /** The routine a route sent it to, by name; null when no route took it. */
  routedTo: string | null;
  /** Where it came from (`github`, a connection's name). */
  source: string;
}

export interface ViewEventsOutput {
  /** Newest first. */
  rows: ViewEvent[];
}

/** Each view tool's input and output, by name. */
export interface ViewToolIO {
  events: { input: ViewEventsInput; output: ViewEventsOutput };
  routines: { input: ViewRoutinesInput; output: ViewRoutinesOutput };
  spend: { input: ViewSpendInput; output: ViewSpendOutput };
  stages: { input: Record<string, never>; output: ViewStagesOutput };
  tasks: { input: ViewTasksInput; output: ViewTasksOutput };
}
