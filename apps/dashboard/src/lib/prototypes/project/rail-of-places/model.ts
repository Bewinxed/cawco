/**
 * The records the "Places down the side" prototype draws, shaped as the
 * TOM's objects (project-tom.md, Objects): a project with its stages, tasks,
 * waits, work in progress, routines, approved actions, choice sets, outputs,
 * sessions, spend and Caw. Every screen takes one `Project` and one `Read`
 * as props, so every state is a story's args.
 */
import type { StageKind } from "@cawco/core/views";

export type PlaceKey =
  | "home"
  | "tasks"
  | "routines"
  | "decisions"
  | "outputs"
  | "sessions"
  | "spend";

export interface Stage {
  key: string;
  kind: StageKind;
  name: string;
}

export interface Task {
  /** An attempt on it: working, queued, or stuck with its cause. */
  attempt?: "working" | "queued" | "stuck";
  cause?: string;
  changed?: string;
  id: string;
  labels?: string[];
  /** It stands in a stage meant for the person. */
  needsYou?: boolean;
  stage: string;
  title: string;
  /** To-dos ticked of all. */
  todos?: [number, number];
  type?: string;
  waitsOn?: string;
}

export type NeedKind =
  "task" | "failed" | "ask" | "picks" | "action" | "browser" | "proposal";

/** Something waiting on the person, derived live (TOM, Need). */
export interface Need {
  /** What it asks, in its words. */
  asks: string;
  /** The exact call, for a session's ask or an approved action. */
  call?: string;
  /** A choice set it opens, and at which question. */
  decision?: string;
  id: string;
  kind: NeedKind;
  picked?: [number, number];
  question?: number;
  /** A task it opens in the pane. */
  task?: string;
  /** The thing it belongs to: a task, a session, a choice set, a routine. */
  title: string;
  /** How long it has waited, said short ("42 min"). */
  wait: string;
}

/** Work in progress on Home (TOM task 4). */
export interface Work {
  cause?: string;
  /** What the row says it is doing, in a few words. */
  doing?: string;
  id: string;
  kind: "attempt" | "caw" | "spun" | "routine";
  state: "working" | "queued" | "stuck";
  task?: string;
  title: string;
  todos?: [number, number];
  type?: string;
}

interface Run {
  outcome: "ok" | "silent" | "failed";
  produced: string;
  session: string;
  took: string;
  when: string;
}

export interface Routine {
  expires?: string;
  id: string;
  instruction: string;
  last: { outcome: "ok" | "silent" | "failed"; ago: string; reason?: string };
  name: string;
  next: string;
  on: boolean;
  runs: Run[];
  /** The schedule in words, on the person's clock. */
  schedule: string;
  source: {
    kind: "schedule" | "poll" | "relay";
    name: string;
    failing?: string;
  };
  /** The zone it was set in. */
  zone: string;
}

/** An approved action waiting on the person, or one that failed (TOM, Approved action). */
interface Proposed {
  account: string;
  call: string;
  connection: string;
  from: string;
  id: string;
  reason?: string;
  state: "waiting" | "failed";
  when: string;
}

export interface Decision {
  after?: string;
  age: string;
  group: "waits" | "sent" | "decided";
  id: string;
  picked: [number, number];
  question?: number;
  settledBy?: string;
  tasks?: number;
  title: string;
  unlocks?: string;
  /** Its page could not be read. */
  unread?: boolean;
}

export type OutputKind =
  | "post"
  | "markdown"
  | "picture"
  | "media"
  | "file"
  | "preview"
  | "canvas"
  | "choices";

export interface Output {
  /** A document's first lines. */
  excerpt?: string;
  id: string;
  isNew?: boolean;
  kind: OutputKind;
  name: string;
  /** Why the hub cannot serve it. */
  notServed?: string;
  /** A post's text, its alternates and its media plan. */
  post?: { text: string; alternates: number; media?: string; account: string };
  promoted?: boolean;
  size?: string;
  stage: string;
  /** The task that made it, or the session when no task did. */
  task: string;
  taskTitle: string;
  when: string;
}

export interface Session {
  age: string;
  harness: string;
  id: string;
  kind: "caw" | "attempt" | "spun" | "routine";
  machine: string;
  state: "working" | "needs" | "idle" | "failed" | "stopped";
  task?: string;
  title: string;
}

interface Spend {
  capDay: string;
  capMonth: string;
  month: string;
  monthShare: number;
  /** Today's share of the cap, 0 to 1. */
  share: number;
  sources: { name: string; amount: string; share: number }[];
  today: string;
}

interface Caw {
  eventsReach: boolean;
  harness: string;
  machine: string;
  model: string;
  sentence: string;
  starters: string[];
  status: "working" | "asking" | "idle" | "off" | "unreachable";
  turns: { who: "you" | "caw"; text: string; when: string }[];
}

export interface Project {
  archived: number;
  caw: Caw;
  decisions: Decision[];
  /** The project's tasks carry a date, an edge: the views that need one. */
  hasDates: boolean;
  hasEdges: boolean;
  id: string;
  name: string;
  needs: Need[];
  /** The routines' soonest run, on the person's clock. */
  nextRun: string | null;
  outputs: Output[];
  proposed: Proposed[];
  routines: Routine[];
  sessions: Session[];
  spend: Spend | null;
  stages: Stage[];
  tasks: Task[];
  working: Work[];
}

/**
 * How the screen's reads stand: the first read still out, or read; the hub
 * live or gone since a time (the last good rows kept, PRODUCT.md, How state
 * is shown); and which reads failed while the rest came in.
 */
export interface Read {
  /** When the failed reads last answered, on the person's clock. */
  kept?: string;
  stale: string | null;
  status: "loaded" | "loading";
  /** Failed reads: a rail row (`rail:routines`), Home's `working`, a stage (`stage:measured`), a decision (`decision:<id>`). */
  unread: string[];
}

export type Pane =
  | { kind: "task"; id: string }
  | { kind: "routine"; id: string }
  | { kind: "decision"; id: string }
  | null;

export type Sheet = "places" | "configure" | null;

export const LIVE: Read = { status: "loaded", stale: null, unread: [] };
