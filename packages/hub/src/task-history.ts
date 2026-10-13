/**
 * A task's history, read from its file's commits (§5.2: "Files are the
 * truth"; git keeps history). Nothing here is written into a task file or a
 * table: every change to a task is already a commit, and this reads them
 * back.
 *
 * - **What the hub writes.** Every commit tasks.ts makes carries git
 *   trailers under its subject: who ({@link TRAILERS} `actor`: the session's
 *   instance id, `you`, `hub`, `action:<id>`), the mover its stage rules were
 *   checked as, a stage move (`draft -> review`, `(none) -> idea` for a new
 *   task) and the reason, when there is one.
 * - **Older commits** have no trailers. A commit tasks.ts made says the same
 *   in its subject (`task tsk-12: stage draft → review (by Fix tray chip)`),
 *   and is read from it. Any other commit (a hand edit, Caw's folder_write,
 *   the folder editor) is an edit by its git author, with no mover.
 * - **Lifecycle times** come from the moves and the project's current
 *   stages: started is the first move into a stage of kind `active`;
 *   completed and dropped are the move into a `done` or `dropped` stage that
 *   still stands, and its reason is the close reason.
 * - **A task gone from the folder** (its file deleted, or moved out of
 *   tasks/, as an archive will) no longer holds up the tasks that wait for
 *   it; one the history never held still does.
 */

import type {
  FolderFileChange,
  FolderFileTimes,
  FolderTimes,
} from "./project-folder";
import { MOVERS, type StageKind, type Stages, stageNamed } from "./stages";
import { fileTaskNumber, taskId } from "./task-file";

/** The trailers the hub writes under a task commit's subject. */
export const TRAILERS = {
  actor: "CawCo-Actor",
  mover: "CawCo-Mover",
  stage: "CawCo-Stage",
  reason: "CawCo-Reason",
} as const;

/** How a commit names "no stage": a new task's move in, `(none) -> idea`. */
export const NO_STAGE = "(none)";

/** The commit author names tasks.ts's actors write under (sessions write under their title). */
export const AUTHOR = {
  you: "you",
  lead: "Caw",
  hub: "hub",
  action: "approved action",
} as const;

/** Who moves a task, as the hub checks it: a stages.md mover or the hub. */
export type HistoryMover = (typeof MOVERS)[number] | "hub";

const MOVER_NAMES: ReadonlySet<string> = new Set<HistoryMover>([
  ...MOVERS,
  "hub",
]);

/** Who made a change. */
export interface TaskHistoryActor {
  /** The session's instance id (a session, the lead), or the approved action's id; null when the commit names none. */
  id: string | null;
  /** The mover the change was checked as; null for a commit the hub's task code did not make (a hand edit, folder_write, the folder editor). */
  mover: HistoryMover | null;
  /** The commit's author: you, Caw, the session's title as it was, hub, approved action. */
  name: string;
}

/**
 * `created`: its file added. `moved`: a stage move. `changed`: fields,
 * to-dos or edges, through the hub. `edited`: its file changed by a commit
 * the hub's task code did not make. `renamed`, `deleted`: its file.
 */
export type TaskHistoryKind =
  | "created"
  | "moved"
  | "changed"
  | "edited"
  | "renamed"
  | "deleted";

/** One commit to a task's file, as its history shows it. */
export interface TaskHistoryEvent {
  actor: TaskHistoryActor;
  /** When, ms epoch, by commit time. */
  at: number;
  /** The commit's sha. */
  commit: string;
  kind: TaskHistoryKind;
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
  path: string;
}

/** When a task started, completed and was dropped, and why it closed, from its moves. */
export interface TaskLife {
  /** The reason given with the move into the done or dropped stage it is in; null when none or open. */
  closeReason: string | null;
  /** When it moved into the done stage it is in, ms epoch; null while it is not in one. */
  completedAt: number | null;
  /** When it moved into the dropped stage it is in, ms epoch; null while it is not in one. */
  droppedAt: number | null;
  /** When it first moved into a stage of kind active, ms epoch; null while it never has. */
  startedAt: number | null;
}

/** `task tsk-12: …` and `tasks tsk-4, tsk-5: …`: a subject tasks.ts wrote, and what it says. */
const TASK_SUBJECT = /^tasks? tsk-\d+(?:, tsk-\d+)*: ([\s\S]*)$/;
/** `stage draft → review`, alone or after a link (`duplicate of tsk-2; stage …`). */
const MOVE_SAID = /(?:^|; )stage (\S+) → (\S+)$/;
const CREATE_SAID = /^create “[\s\S]*” in (\S+)$/;
const ADOPT_SAID = /^adopt at (\S+), written by [\s\S]* into stage (\S+)$/;
const STAGE_TRAILER = /^(\S+) -> (\S+)$/;
const ACTION_ID = /^action:(.+)$/;
const BY = " (by ";

/** A subject's `(by …)` part taken off: what it says before, and the reason after the author's name. */
const byPart = (
  subject: string,
  author: string
): { reason: string | null; what: string } | undefined => {
  if (!subject.endsWith(")")) {
    return;
  }
  const named = subject.lastIndexOf(`${BY}${author}`);
  const at = named >= 0 ? named : subject.lastIndexOf(BY);
  if (at < 0) {
    return;
  }
  const inner = subject.slice(at + BY.length, -1);
  const reason = inner.startsWith(`${author}: `)
    ? inner.slice(author.length + 2).trim()
    : null;
  return { what: subject.slice(0, at), reason: reason || null };
};

/** The mover a trailer-less task commit was made as, by its author's name. */
const moverByName = (author: string): HistoryMover => {
  switch (author) {
    case AUTHOR.you:
      return "you";
    case AUTHOR.lead:
      return "lead";
    case AUTHOR.hub:
      return "hub";
    case AUTHOR.action:
      return "action";
    default:
      return "session";
  }
};

const stageName = (name: string): string | null =>
  name === NO_STAGE ? null : name;

/** The stage move a task commit's words say, for a commit with no stage trailer. */
const stageSaid = (
  what: string
): { from: string | null; to: string } | null => {
  const moved = MOVE_SAID.exec(what);
  if (moved) {
    return { from: stageName(moved[1] as string), to: moved[2] as string };
  }
  const created = CREATE_SAID.exec(what);
  if (created) {
    return { from: null, to: created[1] as string };
  }
  const adopted = ADOPT_SAID.exec(what);
  if (adopted) {
    return { from: stageName(adopted[2] as string), to: adopted[1] as string };
  }
  return null;
};

const kindOf = (
  change: FolderFileChange["change"],
  moved: boolean,
  mover: HistoryMover | null
): TaskHistoryKind => {
  if (change === "added") {
    return "created";
  }
  if (change === "deleted" || change === "renamed") {
    return change;
  }
  if (moved) {
    return "moved";
  }
  return mover ? "changed" : "edited";
};

/** One commit to a task's file as its history shows it. */
const eventOf = ({ change, commit }: FolderFileChange): TaskHistoryEvent => {
  const { trailers } = commit;
  const by = byPart(commit.subject, commit.author);
  const said = TASK_SUBJECT.exec(by?.what ?? "")?.[1];
  const trailed = trailers[TRAILERS.mover];
  let mover: HistoryMover | null = null;
  if (trailed && MOVER_NAMES.has(trailed)) {
    mover = trailed as HistoryMover;
  } else if (said !== undefined) {
    mover = moverByName(commit.author);
  }
  const named = trailers[TRAILERS.actor] ?? "";
  const id =
    ACTION_ID.exec(named)?.[1] ??
    (named && !MOVER_NAMES.has(named) ? named : null);
  const stageTrailer = STAGE_TRAILER.exec(trailers[TRAILERS.stage] ?? "");
  let stage: TaskHistoryEvent["stage"] = null;
  if (stageTrailer) {
    stage = {
      from: stageName(stageTrailer[1] as string),
      to: stageTrailer[2] as string,
    };
  } else if (mover && said !== undefined) {
    stage = stageSaid(said);
  }
  return {
    at: commit.at,
    commit: commit.sha,
    actor: { mover, id, name: commit.author },
    kind: kindOf(change, stage !== null && stage.from !== stage.to, mover),
    what: said ?? commit.subject,
    stage,
    reason: trailers[TRAILERS.reason] || by?.reason || null,
  };
};

/** Each file's history, read once per entry: an entry a later commit leaves alone keeps its reading. */
const read = new WeakMap<FolderFileTimes, TaskHistoryEvent[]>();

/** A task file's history, oldest first. */
export const historyOf = (entry: FolderFileTimes): TaskHistoryEvent[] => {
  let events = read.get(entry);
  if (!events) {
    events = entry.changes.map(eventOf);
    read.set(entry, events);
  }
  return events;
};

const kindIn = (stages: Stages | undefined, stage: string): StageKind | null =>
  (stages && stageNamed(stages, stage)?.kind) ?? null;

/**
 * When a task started, completed and was dropped, from its moves and the
 * project's stages as they are now. Completed and dropped stand only while
 * the task is in a stage of that kind (`kind`, its stage's now): a move out
 * clears them, and a move between two stages of one kind keeps the first.
 */
export const lifeOf = (
  events: readonly TaskHistoryEvent[],
  stages: Stages | undefined,
  kind: StageKind | null
): TaskLife => {
  let startedAt: number | null = null;
  /** The move into the done or dropped kind the task's moves left it in. */
  let closed: { at: number; kind: StageKind; reason: string | null } | null =
    null;
  let was: StageKind | null = null;
  for (const event of events) {
    if (!event.stage) {
      continue;
    }
    const now = kindIn(stages, event.stage.to);
    if (now === "active") {
      startedAt ??= event.at;
    }
    if (now !== was) {
      closed =
        now === "done" || now === "dropped"
          ? { at: event.at, kind: now, reason: event.reason }
          : null;
    }
    was = now;
  }
  const stands = closed?.kind === kind ? closed : null;
  return {
    startedAt,
    completedAt: stands?.kind === "done" ? stands.at : null,
    droppedAt: stands?.kind === "dropped" ? stands.at : null,
    closeReason: stands?.reason ?? null,
  };
};

/** Each history's gone tasks, read once per commit. */
const goneRead = new WeakMap<FolderTimes, ReadonlySet<string>>();

/**
 * The tasks the folder's history shows were taken out of tasks/: the last
 * commit to every file that held the number deleted it, or moved it into a
 * folder under tasks/ (an archive), and no file at the top of tasks/ holds
 * it now. `times` is tasks/'s history (folderFileTimes(…, "tasks")).
 */
export const goneTasks = (folder: FolderTimes): ReadonlySet<string> => {
  const known = goneRead.get(folder);
  if (known) {
    return known;
  }
  const live = new Set<number>();
  const gone = new Set<number>();
  for (const [path, entry] of folder.times) {
    const number = fileTaskNumber(path);
    if (number === undefined) {
      continue;
    }
    const deleted = entry.changes.at(-1)?.change === "deleted";
    const topLevel = path.split("/").length === 2;
    if (topLevel && !deleted) {
      live.add(number);
    } else {
      gone.add(number);
    }
  }
  const ids = new Set(
    [...gone].filter((number) => !live.has(number)).map(taskId)
  );
  goneRead.set(folder, ids);
  return ids;
};
