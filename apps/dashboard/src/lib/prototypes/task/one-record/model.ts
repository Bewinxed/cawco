/**
 * The task as the "One record" option reads it: the hub's read of one task
 * (core task-views.ts: TaskSummary, TaskAttempt, TaskWait, TaskHistoryEvent)
 * shaped into the record the screen draws, oldest to newest, every change
 * one entry by its actor with a clock time, and the derived facts the state
 * line says. The screen takes it whole as a prop and keeps none of it.
 */
import type { Activity } from "@cawco/core/activity";
import type { TaskWait } from "@cawco/core/task-views";
import type { Mover, StageKind } from "@cawco/core/views";

/** Who made a change, as the record names them. */
export interface Actor {
  /** you, hub, Caw, a session (by its title), a routine, an approved action. */
  kind: Mover | "hub" | "caw";
  name: string;
}

/** One check on the checks strip: the session's list, the acceptance criteria and the merge checks, as one. */
export interface Check {
  /** Jev's judgement of a criterion, 0 to 1; null when none was made. */
  confidence: number | null;
  source: "session" | "acceptance" | "merge";
  state: "passed" | "notShown" | "toCheck" | "notRun";
  text: string;
}

/** What an attempt handed in. */
interface HandedResult {
  checks: Check[];
  commits: { sha: string; subject: string }[];
  /** A file in the project folder its history names as the result, which the hub may not hold yet. */
  file: { path: string; held: boolean } | null;
  /** Its one or two sentence headline. */
  headline: string;
  /** What it presented, drawn whole beside: the artifact's name and kind. */
  presented: {
    name: string;
    kind: "page" | "canvas" | "preview" | "post";
  } | null;
  /** The report its session wrote, as markdown. */
  report: string;
}

/** One commented line of a session's transcript, for the session beside. */
interface TranscriptLine {
  at: number;
  text: string;
  who: "session" | "you" | "tool";
}

/** The session an attempt runs as. */
export interface AttemptSession {
  id: string;
  lines: TranscriptLine[];
  /** Its state now, derived from the live session. */
  state: "working" | "asking" | "idle" | "done" | "stopped" | "failed";
  title: string;
  type: string | null;
}

/** One entry of the record. */
export type Entry =
  | {
      kind: "filed";
      id: string;
      at: number;
      actor: Actor;
      stage: string;
      /** The decision it was made from, by its question. */
      from: string | null;
    }
  | {
      kind: "changed";
      id: string;
      at: number;
      actor: Actor;
      what: string;
      reason: string | null;
    }
  | {
      kind: "moved";
      id: string;
      at: number;
      actor: Actor;
      from: string;
      to: string;
      reason: string | null;
    }
  | {
      kind: "attempt";
      id: string;
      at: number;
      actor: Actor;
      /** Its number, oldest 1. */
      n: number;
      workItem: string;
      session: AttemptSession;
      endedAt: number | null;
      /** Agreed to-dos ticked of agreed, and how many it only offered. */
      todos: { done: number; total: number; offered: number } | null;
      /** The entries that belong to it (asks, its end, its hand-in). */
      entries: Entry[];
    }
  | {
      kind: "ask";
      id: string;
      at: number;
      actor: Actor;
      words: string;
      /** The change itself, when it is one (a command), drawn open. */
      detail: string | null;
      answer: { answer: "approved" | "denied"; by: string; at: number } | null;
      /** The hub could not carry the answer: its words. */
      notCarried: string | null;
    }
  | {
      kind: "ended";
      id: string;
      at: number;
      actor: Actor;
      how: "failed" | "stopped";
      /** The hub's words: the failure's first line, or who stopped it. */
      words: string;
      reportedTo: string;
    }
  | {
      kind: "handed";
      id: string;
      at: number;
      actor: Actor;
      result: HandedResult;
    }
  | { kind: "refused"; id: string; at: number; actor: Actor; words: string }
  | {
      kind: "comment";
      id: string;
      at: number;
      actor: Actor;
      text: string;
      /** A commit or a file it names as the task's result: the result's source when no attempt handed one in. */
      names?: { commit: string } | { path: string; held: boolean };
      /** Where it went: the session it reached, or the file. */
      went: { to: "session"; session: string } | { to: "file" } | null;
    }
  | {
      kind: "landed";
      id: string;
      at: number;
      actor: Actor;
      commit: string;
      where: string;
    }
  | {
      kind: "dropped";
      id: string;
      at: number;
      actor: Actor;
      reason: string;
      /** The stage Reopen puts it into. */
      reopenInto: string;
    };

/** One wait, its own or inherited, as the one resolver settles it. */
export interface Wait {
  /** Blocked for good (closed unmerged, deleted, not in the project): only re-pointing or removing helps. */
  flag: string | null;
  kind: TaskWait["kind"];
  label: string;
  settled: boolean;
  /** In a word from the hub's resolver: open, picked, doing, merged, red, ready. */
  state: string;
  /** The task it opens, when it is one: its id. */
  task: string | null;
  value: string | null;
  /** The ancestor it is inherited from; null for its own. */
  via: string | null;
}

/** The task's file as the next attempt reads it. */
export interface TaskFile {
  acceptance: string[];
  description: string;
  fields: { name: string; value: string }[];
  labels: string[];
  lands: string | null;
  /** Ready requires, each with whether it holds now. */
  ready: { inTodo: boolean; settled: boolean; free: boolean };
  /** A refusal of the last edit, beside the field it refused. */
  refused: string | null;
  runsOn: string | null;
  todos: { id: string; text: string; done: boolean; offered: boolean }[];
  type: string | null;
}

/** Another task, as it opens in place of a wait's row. */
export interface OtherTask {
  description: string;
  id: string;
  kind: StageKind;
  /** Not in the project: the wait is blocked for good. */
  missing: boolean;
  stage: string;
  title: string;
}

/** The task's head and state line, derived on every read. */
export interface TaskView {
  entries: Entry[];
  file: TaskFile;
  id: string;
  kind: StageKind;
  /** The liveness word's key (taskOneRecordWords.live). */
  live:
    | Activity
    | "needsYou"
    | "asking"
    | "queued"
    | "ready"
    | "failed"
    | "stopped"
    | "landing"
    | "landed"
    | "dropped";
  /** The live session words go to; null when they wait in the file. */
  liveSession: string | null;
  /** The entry the task opens scrolled to: the newest that needs the person. */
  opensAt: string | null;
  /** Where Send back puts it, and where Pass on takes it, while it waits on you. */
  review: {
    passOn: string;
    sendBack: string;
    sendBackBy: "attempt" | "start" | "nobody";
  } | null;
  stage: string;
  stages: { name: string; kind: StageKind }[];
  title: string;
  unblocks: number;
  waits: Wait[];
  /** Why it is not running, when that is the news. */
  why: string | null;
}

/** What stands beside the record (desk) or in its place (phone). */
export type Opened =
  | { what: "result"; entry: string }
  | { what: "session"; entry: string }
  | { what: "waits" }
  | { what: "file"; editing?: boolean }
  | {
      what: "task";
      /** The task the wait points at. */
      id: string;
      /** As the hub read it; null while it reads. */
      task: OtherTask | null;
    };

/** An act sent to the hub and not answered yet. Nothing is posted before the hub answers. */
export type Pending =
  | "passOn"
  | "sendBack"
  | "approve"
  | "deny"
  | "retry"
  | "comment"
  | "drop"
  | "reopen"
  | "saveBrief"
  | "start";

/** A question unfolded in the page, under the control that asked it. */
export type Asking =
  { what: "sendBack" } | { what: "drop" } | { what: "reopen" };

/** What the screen asks of its host: each act by name, and what it opens. */
export interface Acts {
  onact: (
    act: Pending | "ask:sendBack" | "ask:drop" | "ask:reopen" | "cancel"
  ) => void;
  onclose: () => void;
  onopen: (opened: Opened) => void;
}
