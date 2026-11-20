/**
 * A task's wait that can no longer settle on its own, told to the person
 * once: a pull request closed unmerged, or an Actions run gone red
 * (task-waits.ts `GITHUB_FLAG`). The task reads blocked on the board either
 * way; this is the one time it reaches the person, as a condition stopped
 * unmet does (routines.ts `stopCheck`): a note in the project's conversation
 * and a push that opens the task.
 *
 * - **When.** A second after any change to a project's tasks (tasks.ts
 *   `listen`), which every move of a pull request or run waited on is
 *   (tasks.ts `waitsMoved` says it as `changed`), and a task written to
 *   wait on one already red is too. A project none of whose tasks waits on
 *   GitHub, and that keeps none told, is not read.
 * - **Once.** Each wait told is kept (db task-wait-flags.ts), one per task
 *   and target, so a later look, a hub restart among them, tells nobody
 *   again. Only a task's own waits are told: a part inheriting its whole's
 *   wait is the whole's notice.
 * - **Again.** A kept wait goes once it reads open, merged, running or
 *   green (a pull request reopened, a run run again), so its next flag is
 *   news and is told; it also goes once its task is done or dropped, or no
 *   longer waits on it. A wait not read yet since the hub started
 *   (`checking`) keeps its row: it is told nothing again when the read
 *   comes back as it was.
 */

import { isOneOf } from "@cawco/core/one-of";
import type { ProjectNote } from "@cawco/core/project-conversation";
import type { TaskSummary } from "@cawco/core/task-views";
import { CLOSED_STAGE_KINDS } from "@cawco/core/views";
import { waitTarget } from "@cawco/core/wait-targets";
import { taskLinkWords } from "@cawco/core/words/task-links";
import { ElysiaStatus } from "elysia";
import type { TaskIndexRow } from "./db/task-index";
import type { TaskWaitFlagsDb, TaskWaitKey } from "./db/task-wait-flags";
import type { HubLifetimeShape } from "./lifetime";
import { createProjectLooks } from "./project-looks";
import type { Push } from "./push";
import type { TaskEvent, Tasks } from "./tasks";

/** A change's look waits this long, so a burst of changes looks once. */
const SETTLE_MS = 1000;

/** The kinds of wait told here: GitHub's. */
const GITHUB_KINDS: ReadonlySet<string> = new Set(["pr", "run"]);

export interface WaitFlagsDeps {
  /** The project's task index as kept (db `taskIndex`): read first, so a project waiting on no GitHub is not listed. */
  readonly index: (projectId: string) => TaskIndexRow[];
  /** The waits told, kept. */
  readonly kept: TaskWaitFlagsDb;
  readonly lifetime: HubLifetimeShape;
  /** A note in the project's conversation, waking nobody (caw.ts `notice`). */
  readonly notice: (projectId: string, note: ProjectNote) => void;
  readonly push: Pick<Push, "waitFlagged">;
  readonly tasks: Pick<Tasks, "list">;
}

const keyOf = ({ taskId, target }: TaskWaitKey): string =>
  `${taskId}\0${target}`;

/** Whether a handle as a file keeps it is a wait on a pull request or run. */
const onGitHub = (handle: string): boolean => {
  const target = waitTarget(handle);
  return target !== undefined && GITHUB_KINDS.has(target.kind);
};

export const createWaitFlags = ({
  index,
  kept,
  lifetime,
  notice,
  push,
  tasks,
}: WaitFlagsDeps) => {
  /** Tells the person once that `task`'s wait `wait` can no longer settle. */
  const tell = (
    projectId: string,
    task: TaskSummary,
    wait: TaskSummary["waits"][number]
  ): void => {
    const kind = wait.kind === "pr" ? "pr" : "run";
    const title =
      kind === "pr"
        ? taskLinkWords.closedUnmergedNote(wait.label, task.title)
        : taskLinkWords.runFailedNote(wait.label, task.title);
    notice(projectId, {
      title,
      body: taskLinkWords.blockedNoteBody(kind),
      event: {
        kind: "wait",
        label: wait.label,
        state: wait.state,
        target: wait.target,
        taskId: task.id,
        title: task.title,
      },
    });
    const key = { taskId: task.id, target: wait.target };
    push.waitFlagged({
      line: title,
      projectId,
      // Counted while it is still kept: a wait that reads well again before the burst goes out is not.
      still: () => kept.of(projectId).some((one) => keyOf(one) === keyOf(key)),
      target: wait.target,
      taskId: task.id,
      title: task.title,
    });
    console.info(
      `[wait flags] ${projectId} ${task.id}: ${wait.target} ${wait.state}, told`
    );
  };

  /** Whether `task` is done or dropped: its waits are told no more. */
  const closed = (task: TaskSummary): boolean =>
    isOneOf(CLOSED_STAGE_KINDS, task.kind);

  /** Tells each of `task`'s own GitHub waits newly flagged, adding each that stays kept to `standing`. */
  const readTask = (
    projectId: string,
    task: TaskSummary,
    standing: Set<string>
  ): void => {
    for (const wait of task.waits) {
      if (wait.via !== null || !GITHUB_KINDS.has(wait.kind)) {
        continue;
      }
      const key = { taskId: task.id, target: wait.target };
      // Not read yet since the hub started: what was told stays told.
      if (wait.flag || wait.state === "checking") {
        standing.add(keyOf(key));
      }
      if (wait.flag && kept.keep(projectId, key)) {
        tell(projectId, task, wait);
      }
    }
  };

  /** Tells each wait newly flagged, and lets go of each kept one that reads well again or is gone; the list's refusal. */
  const lookAt = async (projectId: string) => {
    const told = kept.of(projectId);
    const waitsOnGitHub = index(projectId).some((row) =>
      row.waitsOn.some(onGitHub)
    );
    if (!waitsOnGitHub && told.length === 0) {
      return;
    }
    const list = await tasks.list(projectId);
    if (list instanceof ElysiaStatus) {
      return list;
    }
    /** The waits whose row stays: flagged, or not read yet. */
    const standing = new Set<string>();
    for (const task of list.tasks.filter((one) => !closed(one))) {
      readTask(projectId, task, standing);
    }
    for (const one of told.filter((each) => !standing.has(keyOf(each)))) {
      kept.drop(projectId, one);
    }
  };

  const { soon } = createProjectLooks({
    lifetime,
    lookAt,
    name: "wait flags",
    settleMs: SETTLE_MS,
  });

  return {
    /** A project's tasks changed (tasks.ts `listen`), a wait's state among them: it is looked at again shortly. */
    taskChanged(event: TaskEvent): void {
      soon(event.projectId);
    },
  };
};
