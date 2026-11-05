/**
 * One task as the "Your move first" page reads it: the hub's task read
 * (core task-views.ts) narrowed to what the page draws, with the sessions,
 * the result and the people named. Every value in fixtures/tasks.ts is copied
 * from project Cawco-Dev's own tasks.
 */
import type { TaskWait } from "@cawco/core/task-views";
import type { StageKind } from "@cawco/core/views";
import type { WorkItemState } from "@cawco/core/work-items";

/** A session as the page names it: its title and its state now. */
export interface SessionRef {
  id: string;
  state: "working" | "idle" | "asking" | "ended";
  title: string;
}

/** One attempt, newest first in a task's list. */
export interface AttemptRead {
  endedAt: number | null;
  /** Failed: the failure's first line; cancelled: who stopped it. */
  endedHow: string | null;
  headline: string | null;
  id: string;
  session: SessionRef;
  startedAt: number;
  state: Exclude<WorkItemState, "starting">;
}

/** What the newest attempt handed in. */
interface ResultRead {
  at: number;
  /** The session's own check list. */
  check: string[];
  /** The commit it says landed. */
  commit: string | null;
  headline: string;
  /** The one artifact it presented, drawn whole from its picture. */
  presented: { name: string; href: string; picture: string } | null;
  report: string;
  session: SessionRef;
}

/** An acceptance criterion and what the hub's judge found of it. */
interface Criterion {
  /** Null while nobody judged it. */
  met: boolean | null;
  score: string | null;
  text: string;
}

export interface WaitRead {
  /** Why it is blocked for good; null when it is not. */
  flag: string | null;
  href: string;
  kind: TaskWait["kind"];
  label: string;
  settled: boolean;
  state: string;
  value: string | null;
  /** The whole it is inherited from; null for the task's own. */
  via: string | null;
}

interface TaskLink {
  id: string;
  stage: string;
  title: string;
}

export interface HistoryRead {
  actor: string;
  at: number;
  reason: string | null;
  stage: { from: string | null; to: string } | null;
  what: string;
}

interface CommentRead {
  at: number;
  author: string;
  text: string;
}

interface TodoRead {
  done: boolean;
  id: string;
  /** Offered by an attempt, not agreed: out of the count. */
  offered: boolean;
  text: string;
}

/** A permission or question the attempting session raised. */
export interface AskRead {
  at: number;
  detail: string;
  session: SessionRef;
  words: string;
}

export interface TaskRead {
  ask: AskRead | null;
  attempts: AttemptRead[];
  closedAt: number | null;
  closedBy: string | null;
  closeReason: string | null;
  comments: CommentRead[];
  createdAt: number;
  criteria: Criterion[];
  description: string;
  fields: Record<string, string>;
  filedBy: string;
  history: HistoryRead[];
  id: string;
  kind: StageKind;
  labels: string[];
  /** The stage Pass on moves it to, as the project's moves allow. */
  passOn: string | null;
  ready: boolean;
  result: ResultRead | null;
  sendBack: { stage: string; by: "attempt" | "start" | "nobody" } | null;
  stage: string;
  title: string;
  todos: TodoRead[];
  type: string | null;
  unblocks: TaskLink[];
  waits: WaitRead[];
}

/** The person's read of the task: when they last looked, and the clock now. */
export interface Looking {
  lastLooked: number;
  now: number;
}
