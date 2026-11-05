/**
 * The records the Home-first prototype draws, shaped as the TOM names its
 * objects (project-tom.md, Objects): a project's stages, what waits on the
 * person (a Need, derived live), what is working, what is coming up, what
 * it produced, its choice sets, routines, sessions and spend. Every screen
 * takes them as props; fixture.ts holds the project's own records.
 */
import type { StageKind } from "@cawco/core/views";

export interface Stage {
  /** Tasks in it; 0 draws no number, the name stays. */
  count: number;
  id: string;
  kind: StageKind;
  name: string;
}

/** The kinds of wait (TOM, Need). */
export type NeedKind =
  "review" | "failed" | "ask" | "picks" | "action" | "browser";

export interface Need {
  /** What exactly it asks, in a sentence. */
  asks: string;
  /** The exact call or command, set as code. */
  code?: string;
  /** Where it came from (a routine, a task). */
  from?: string;
  id: string;
  kind: NeedKind;
  /** Put back with Not now: kept answerable at the foot. */
  later?: boolean;
  /** Choice sets: picked of total, and the first open question. */
  picked?: number;
  question?: number;
  /** The stage, for a task in a stage meant for the person. */
  stage?: string;
  /** The thing it belongs to: a task, a session, a choice set. */
  title: string;
  total?: number;
  /** How long it has waited, as the person reads it. */
  waited: string;
}

export type WorkState = "working" | "stuck" | "asks" | "queued" | "failed";

export interface Work {
  /** Why it is stuck, or what it asks. */
  cause?: string;
  id: string;
  machine?: string;
  ran?: string;
  stage?: string;
  state: WorkState;
  title: string;
  todos?: [done: number, total: number];
  /** The delegate type, or the harness for a spun-off session. */
  type?: string;
  /** An attempt on a task, Caw, or a session spun off by hand. */
  who: "attempt" | "caw" | "session";
}

export interface Upcoming {
  /** A routine whose last run failed: when, and why. */
  failed?: { at: string; why: string };
  id: string;
  kind: "routine" | "task";
  title: string;
  when: string;
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
  alternates?: number;
  /** A post's text, a markdown file's opening lines, a choice set's question. */
  body?: string;
  id: string;
  isNew?: boolean;
  kind: OutputKind;
  mediaPlan?: boolean;
  /** A picture or media's size, a file's size. */
  meta?: string;
  pins?: number;
  /** A picture's file, served by the hub. */
  src?: string;
  stage: string;
  /** The task that made it, and its stage. */
  task: string;
  title: string;
  /** A file the hub cannot serve, and why. */
  unservable?: string;
  when: string;
}

export interface Decision {
  after?: string;
  age: string;
  group: "waits" | "sent" | "decided";
  id: string;
  /** Tasks it made; a decided one with none offers Make tasks. */
  made?: number;
  picked: number;
  question?: number;
  /** Who settled what was decided, and the choice in words. */
  settled?: string;
  title: string;
  total: number;
  unlocks?: string;
}

export interface Routine {
  expired?: string;
  id: string;
  instruction?: string;
  last?: { outcome: "ok" | "failed" | "silent"; when: string; note: string };
  name: string;
  next?: string;
  on: boolean;
  runs?: {
    when: string;
    outcome: "ok" | "failed" | "silent";
    result: string;
  }[];
  /** The schedule in words on the person's clock, and the zone it was set in. */
  schedule: string;
  source: string;
  sourceFailing?: boolean;
  zone: string;
}

export interface Action {
  account: string;
  call: string;
  connection: string;
  from: string;
  id: string;
  state: "waiting" | "failed";
  when: string;
  why?: string;
}

export interface Session {
  age: string;
  group: "caw" | "attempt" | "spunOff";
  harness: string;
  id: string;
  machine: string;
  state: WorkState | "done" | "stopped" | "idle";
  title: string;
  type?: string;
}

export interface Spend {
  by: { caw: number; attempts: number; routines: number; sessions: number };
  cap: number;
  days: number[];
  month: number;
  /** What reaching the cap stops, in a sentence. */
  stops: string;
  today: number;
}

type CawStatus = "working" | "idle" | "asks" | "off" | "unreachable";

export interface Caw {
  events: boolean;
  harness: string;
  model: string;
  sentence: string;
  status: CawStatus;
}

export interface Task {
  cause?: string;
  changed: string;
  due?: string;
  id: string;
  labels?: string[];
  needsYou?: boolean;
  stage: string;
  state?: WorkState;
  title: string;
  todos?: [number, number];
  type?: string;
}

/** Home's briefing, whole: what one read of the project gives. */
export interface Briefing {
  archive: number;
  caw: Caw;
  coming: Upcoming[];
  decisions: Decision[];
  /** When the person last looked: Outputs since then. */
  lookedAt: string;
  needs: Need[];
  outputs: Output[];
  project: string;
  spend: Spend;
  stages: Stage[];
  work: Work[];
}

/** The groups of Home, by key, for a read that failed in one of them. */
export type GroupKey =
  "needs" | "working" | "stages" | "coming" | "outputs" | "decisions" | "spend";
