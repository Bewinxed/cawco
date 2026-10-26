/**
 * A project's tasks and stages as the hub answers them under
 * `/api/projects/:id/tasks` and `/api/projects/:id/stages` (hub tasks.ts,
 * stages.ts, task-history.ts, dispatch.ts) and the dashboard reads them
 * (project-tasks.ts): one set of shapes for both ends.
 */
import type { AttemptResult } from "./deliverables";
import type { LandsMode } from "./injected";
import type { ProjectStarter } from "./starters";
import type { TASK_FILE_STATES, TaskHistoryKind } from "./task-history";
import type { Tracker } from "./trackers";
import type { Mover, StageKind, StagesTemplate, TaskMover } from "./views";
import type { WaitKind } from "./wait-targets";
import type { taskLinkWords } from "./words/task-links";
import type { WorkItemState } from "./work-items";

/** One card or pin an attempt was dispatched on, and the value it settled with (`workItems.waitedOn`). */
export interface WaitWitness {
  /** The wait as its task's file keeps it (wait-targets.ts). */
  target: string;
  value: string;
}

interface StageHooks {
  /** `after:` as written, like `48h`. */
  after?: string;
  /** `after:` in milliseconds. */
  afterMs?: number;
  by?: Mover;
  runs?: string;
  until?: string;
}

export interface Stage {
  hooks: StageHooks;
  kind: StageKind;
  name: string;
}

export interface StageMove {
  /** A stage, or `*` for any. */
  from: string;
  /** A stage, or `*` for any. */
  to: string;
  who: Mover[];
}

export interface StageView {
  by: string | null;
  name: string;
}

/** A project's stages as the dashboard reads them. */
export interface StagesView {
  /**
   * What an empty Decisions tab offers to ask Caw for: the project's open
   * choices to lay out as a decision page (project-starters.ts), in that
   * order; none while Jev is off.
   */
  decisionStarters: ProjectStarter[];
  moves: StageMove[];
  /** What is wrong with stages.md, one sentence each; stages, moves and views are empty while there is any. */
  problems: string[];
  /**
   * What an empty Routines page offers to ask Caw for: what the project
   * repeats or waits on, as routines (project-starters.ts), in that order;
   * none while Jev is off.
   */
  routineStarters: ProjectStarter[];
  /** `file`: the project's stages.md; `template`: it has none, and the code template stands in. */
  source: "file" | "template";
  stages: Stage[];
  /**
   * What an empty board and Caw's panel offer to say to him: written for the
   * project from what it holds now (project-starters.ts), in that order;
   * none while Jev is off.
   */
  starters: ProjectStarter[];
  /** The template the stages are, word for word, if any. */
  template: StagesTemplate | null;
  views: StageView[];
}

/** One attempt at a task: a work item whose task it is, as a task read shows it. */
export interface TaskAttempt {
  /** When it ended, ms epoch; null while it is live. */
  endedAt: number | null;
  /**
   * How it ended when it did not land, in a sentence the task shows beside
   * its Failed or Stopped badge: failed, the first line of what the hub
   * reported (`It failed without a reason.` when nothing was); cancelled,
   * `Stopped by <who>` (`Stopped` when the hub did not hear who). Null while
   * live and once done.
   */
  endedHow: string | null;
  /**
   * What its session said it did, in one or two sentences: its
   * `finish_item`'s headline. Null until an attempt finishes that way.
   */
  headline: string | null;
  /** The session running it. */
  instanceId: string;
  /** What its session handed in (`task_result`); null while it has not. */
  result: AttemptResult | null;
  /** When it was filed, ms epoch. */
  startedAt: number;
  state: WorkItemState;
  /** The cards and pins it was dispatched on, with the value each settled with then. */
  waitedOn: WaitWitness[];
  workItemId: string;
}

/** One wait, settled or not, as every reader shows it. */
export interface WaitState {
  /** A task target dropped since (not as a duplicate): the wait is removed. */
  dropped: boolean;
  /** Why it is blocked for good until someone removes or re-points it (`closed unmerged`); null when it is not. */
  flag: string | null;
  /** Where it opens: its `cawco:` reference, or the pull request's or run's page. */
  href: string;
  kind: WaitKind;
  /** What it is called: a task's title, a card's question, what a pin stands on, `PR #418`. */
  label: string;
  settled: boolean;
  /** Where it stands, in a word or two: `doing`, `open`, `picked`, `merged`, `red`. */
  state: string;
  /** The wait as its file keeps it ({@link waitHandle}). */
  target: string;
  /** What it settled with, for a card (its pick) or a pin; null otherwise or while unsettled. */
  value: string | null;
}

/** One wait of a task, its own or inherited, as task-waits.ts settles it. */
export interface TaskWait extends WaitState {
  /** The `part_of` ancestor it is inherited from; null for the task's own. */
  via: string | null;
}

/**
 * A card or pin a done task's attempt was dispatched on whose value moved
 * since: answered differently, or reopened. Nothing reopens on its own.
 */
export interface BuiltOn {
  href: string;
  label: string;
  since:
    typeof taskLinkWords.decidedDifferently | typeof taskLinkWords.reopened;
  target: string;
}

/** What a task's attempts and edges say about it, worked out on every read. */
export interface TaskFlags {
  /** Its attempts, newest first. */
  attempts: TaskAttempt[];
  /** A done task's cards and pins that moved since its attempt was dispatched on them. */
  builtOn: BuiltOn[];
  /** The ancestor whose live attempt coordinates it, holding it from the hub's dispatch; null when none. */
  heldBy: string | null;
  /**
   * Its newest attempt failed, and it is not done or dropped since. The
   * failure is its starter's business (the session that started it, or the
   * lead for the dispatcher's), who hears the report: never the person's
   * Needs you. It keeps the task off the dispatcher's frontier until someone
   * starts or retries it.
   */
  lastAttemptFailed: boolean;
  /**
   * Its newest attempt was cancelled (stopped), and it is not done or dropped
   * since: no failure, and off the frontier as a failed one is. Who stopped
   * it is its attempt's `endedHow`.
   */
  lastAttemptStopped: boolean;
  /** An attempt at it is starting or running. */
  liveAttempt: boolean;
  /** Its parts: the tasks `part_of` it, by id. */
  parts: string[];
  /** Its stage's `runs:` hook asked for an attempt, which waits for a slot under the project's max_attempts. */
  queuedStart: boolean;
  /**
   * Ready: in a `todo` stage, every wait settled (its own and its `part_of`
   * ancestors'), no live attempt, and no coordinator holding it. The one
   * rule dispatch, the board and every tool answer read.
   */
  ready: boolean;
  /** Why the hub could not start an attempt the last time it tried, while the task is unchanged since. */
  startProblem: string | null;
  /** The tasks that wait on it (`waits_on`), by id. */
  unblocks: string[];
  /** Every wait it has, its own and its `part_of` chain's, unsettled first. */
  waits: TaskWait[];
}

/** Who made a change. */
export interface TaskHistoryActor {
  /** The session's instance id (a session, the lead), or the approved action's id; null when the commit names none. */
  id: string | null;
  /** The mover the change was checked as; null, unknown, for a commit with no `CawCo-Mover` trailer (a hand edit, folder_write, the folder editor, one made before the hub wrote trailers). */
  mover: TaskMover | null;
  /** The commit's author: you, Caw, the session's title as it was, hub, approved action. */
  name: string;
}

/** When a task started, completed, was dropped and was archived, and why it closed, from its commits. */
export interface TaskLife {
  /** When its file moved into tasks/archive/, ms epoch; null while it is not archived. */
  archivedAt: number | null;
  /** The reason given with the move into the done or dropped stage it is in; null when none or open. */
  closeReason: string | null;
  /** When it moved into the done stage it is in, ms epoch; null while it is not in one. */
  completedAt: number | null;
  /** When it moved into the dropped stage it is in, ms epoch; null while it is not in one. */
  droppedAt: number | null;
  /** When it first moved into a stage of kind active, ms epoch; null while it never has. */
  startedAt: number | null;
}

/**
 * When a task was made and last changed and by whom, and when it started,
 * completed or was dropped and why it closed: worked out from its file's
 * commits (task-history.ts) and never written into it. Made: the commit that
 * first added the file to the project folder. Changed: the last commit that
 * touched it, or, while the file holds an edit no commit has, when the hub
 * saw that edit. A file no commit has yet holds the time the hub saw it for
 * both, and no one for either.
 */
export interface TaskTimes extends TaskLife {
  /** When the commit that first added its file landed, ms epoch. */
  createdAt: number;
  /** Who made the commit that first added its file; null while no commit has it. */
  createdBy: TaskHistoryActor | null;
  /** When its file last changed, ms epoch: its last commit, or an edit no commit has yet. */
  updatedAt: number;
  /** Who made its last commit; null while its file holds an edit no commit has. */
  updatedBy: TaskHistoryActor | null;
}

/** One task as a list shows it: the index's row, and what its attempts and edges say. */
export interface TaskSummary extends TaskFlags, TaskTimes {
  /** The task it repeats (`duplicate_of`); null when none. */
  duplicateOf: string | null;
  /** The fields its file carries beyond a task file's own that hold one scalar (`priority: high`), as written. */
  fields: Record<string, string>;
  /** The task or pin it was found in (`found_in`); null when none. */
  foundIn: string | null;
  id: string;
  /** The kind of its stage; null when its stage is not one of the project's. */
  kind: StageKind | null;
  labels: string[];
  /**
   * It waits for you: its stage is of kind `you`, where only you move it on.
   * An attempt that failed or was stopped is its starter's business, not
   * yours. Derived on read, never stored.
   */
  needsYou: boolean;
  number: number;
  /** The project folder files its work produces (`outputs:`). */
  outputs: string[];
  /** The task it is a part of (`part_of`); null when none. */
  partOf: string | null;
  path: string;
  /** What in the file could not be read, or a stage the project lacks, in a sentence; null when all is well. */
  problem: string | null;
  rank: string | null;
  stage: string;
  title: string;
  /** Its agreed to-dos ticked, of all agreed (core `todoProgress`): offered ones are left out. */
  todos: { done: number; total: number };
  type: string | null;
  /** What it waits on (`waits_on`), as its file keeps it. */
  waitsOn: string[];
}

export interface TaskList {
  /** Files in tasks/ the hub could not list as tasks, one sentence each. */
  problems: string[];
  /** What is wrong with stages.md, one sentence each; empty when it reads. */
  stagesProblems: string[];
  tasks: TaskSummary[];
  tracker: Tracker;
}

/**
 * An attempt as it started; or, `queued`, waiting for files a live item owns
 * (its ids null until it starts). Wire-pinned: installable app builds decode
 * these fields from `POST /api/projects/:id/tasks/:taskId/attempts`.
 */
export interface AttemptStart {
  instanceId: string | null;
  /** Where its work lands. */
  lands: LandsMode;
  /** Whether it waits for files a live item owns, to start when they are free. */
  queued: boolean;
  /** The stage the task is in now. */
  stage: string;
  task: string;
  /** What the starting session reads. */
  text: string;
  /** The delegate type it runs; null, the hub's default. */
  type: string | null;
  workItemId: string | null;
  workspaceId: string | null;
}

/** One commit to a task's file, as its history shows it. */
export interface TaskHistoryEvent {
  actor: TaskHistoryActor;
  /** When, ms epoch, by commit time. */
  at: number;
  /** The commit's sha. */
  commit: string;
  kind: TaskHistoryKind;
  /** The file's path once the commit was made: a rename's or an archive's new path. */
  path: string;
  /** Why, when the change said: a close reason, the hub's cause (`attempt 5fd1e189 started`). */
  reason: string | null;
  /** The stage it went from and to; from is null for a new task. Null when the stage did not move. */
  stage: { from: string | null; to: string } | null;
  /** What changed, in the commit's words: `stage draft → review`, `update title`, `tick td-2`. */
  what: string;
}

/** A task's history as the API answers it: every commit to its file, oldest first. */
export interface TaskHistory {
  events: TaskHistoryEvent[];
  id: string;
  /** Its file's path, or the last one it had. */
  path: string;
  // Indexed off the owner, not `TaskFileState`: the apps' schema names this field's enum.
  /** `live`: on the board; `archived`: in tasks/archive/; `deleted`: its file deleted, its history kept. */
  state: (typeof TASK_FILE_STATES)[number];
}
