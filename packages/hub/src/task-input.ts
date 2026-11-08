/**
 * The person's writing on a task (PRD §5.3, tsk-141; the owner's card "What
 * a trigger wakes", 2026-11-07): a comment, a to-do or a task they add at
 * the board or the phone is input, no @ needed. Each task's pieces are
 * gathered until {@link QUIET_MS} passes with nothing new, then go as one
 * send to the one session on the task:
 *
 * - **Its running attempt**, while the project's `attemptsHearComments` is
 *   on: their comments, as their words, the task named in the note, into
 *   the live attempt's session, which takes them at its next step.
 * - **Else the task's handler** (handlers.ts), while the project's
 *   `hearsTasks` is on and Caw is: the one that lives, or a fresh one,
 *   briefed with their comments verbatim and what they added, which folds
 *   them into the task and answers under it (the project-task-input skill).
 *   Never the project's conversation, and never an attempt that has ended:
 *   nothing is woken because it once worked on the task.
 * - Only a change whose actor carries `words` (tasks.ts `YOU_WRITING`, set by
 *   the person's routes alone) is gathered: what an agent, Caw or the hub
 *   writes wakes nothing, so a handler's own edits and answer never loop.
 */
import type { InstanceRow } from "@cawco/core";
import { taskLink } from "@cawco/core";
import type { PersonsSend } from "./caw";
import type { DbShape } from "./db";
import type { Handled, Trigger } from "./handlers";
import type { TaskEvent, Tasks } from "./tasks";
import { isLive } from "./work-items";

/** How long a task's pieces wait for the next before they go together, ms. */
const QUIET_MS = 10_000;

/** One piece of the person's writing on a task. */
type Written =
  | { kind: "comment"; text: string }
  | { kind: "todo"; text: string }
  | { kind: "task" };

/** What `event` carries of the person's writing, and the task it is on; nothing when none. */
const writtenOf = (
  event: TaskEvent
): { taskId: string; written: Written[] } | undefined => {
  if (event.kind === "created") {
    return event.actor.words
      ? { taskId: event.id, written: [{ kind: "task" }] }
      : undefined;
  }
  if (event.kind !== "changed" || !event.id) {
    return;
  }
  const written: Written[] = [];
  if (event.comment?.actor.words) {
    written.push({ kind: "comment", text: event.comment.text });
  }
  if (event.todos?.actor.words) {
    for (const text of event.todos.added) {
      written.push({ kind: "todo", text });
    }
  }
  return written.length > 0 ? { taskId: event.id, written } : undefined;
};

/** One task's gathered pieces, as the task's handler reads them: their comments verbatim, then what they added. */
const inputTrigger = (
  projectId: string,
  task: { id: string; stage: string; title: string },
  written: readonly Written[]
): Trigger => {
  const link = taskLink(projectId, task.id, task.title);
  const comments = written.flatMap((one) =>
    one.kind === "comment" ? [one.text] : []
  );
  const todos = written.flatMap((one) =>
    one.kind === "todo" ? [one.text] : []
  );
  const added = written.some((one) => one.kind === "task");
  const acts = [
    ...(added ? [`They added the task ${link} at the board.`] : []),
    ...(todos.length > 0
      ? [
          `They added ${todos.length === 1 ? "a to-do" : `${todos.length} to-dos`} to ${task.id}:\n${todos.map((text) => `- ${text}`).join("\n")}`,
        ]
      : []),
  ];
  let context: string;
  if (comments.length > 0) {
    context = `The person commented on ${link} in ${task.stage}${comments.length > 1 ? ` (${comments.length} comments, in order)` : ""}.`;
  } else if (added) {
    context = `The person added ${link} in ${task.stage}.`;
  } else {
    context = `The person added to-dos to ${link} in ${task.stage}.`;
  }
  return {
    kind: "task-input",
    thing: { kind: "task", id: task.id },
    name: `${task.id} ${task.title}`,
    context,
    delta: [...comments, ...acts].join("\n\n"),
    who: "you",
  };
};

export interface TaskInputDeps {
  readonly db: Pick<
    DbShape,
    "getInstancesByIds" | "project" | "projectAttempts"
  >;
  /** A trigger on the task, to its handler (handlers.ts `trigger`). */
  readonly handle: (projectId: string, trigger: Trigger) => Promise<Handled>;
  /** The quiet spell; {@link QUIET_MS} unless a test shortens it. */
  readonly quietMs?: number;
  /** Why a session takes none of the person's words now (work-items `refusal`), or nothing. */
  readonly refused: (row: InstanceRow) => string | undefined;
  /** The person's words to a session, as their composer sends them (server.ts `sendYours`). */
  readonly sendYours: (row: InstanceRow, said: PersonsSend) => void;
  readonly tasks: Pick<Tasks, "get">;
}

export const createTaskInput = ({
  db,
  handle,
  quietMs = QUIET_MS,
  refused,
  sendYours,
  tasks,
}: TaskInputDeps) => {
  /** Each task's pieces waiting for quiet, by project and task, with the timer that sends them. */
  const gathering = new Map<
    string,
    { timer: ReturnType<typeof setTimeout>; written: Written[] }
  >();

  /** The task's running attempt that takes the person's words now, its session; undefined when none does. */
  const runningAttempt = (
    projectId: string,
    taskId: string
  ): InstanceRow | undefined => {
    const [newest] = db
      .projectAttempts(projectId)
      .filter((item) => item.taskId === taskId);
    if (!(newest && isLive(newest.state))) {
      return;
    }
    const [session] = db.getInstancesByIds([newest.instanceId]);
    return session && !refused(session as InstanceRow)
      ? (session as InstanceRow)
      : undefined;
  };

  /**
   * One task's pieces, to the one session on the task: its running attempt
   * (their comments), else its handler; what did not go is logged, and the
   * writing waits in the task's file.
   */
  const send = async (
    projectId: string,
    taskId: string,
    written: Written[]
  ): Promise<void> => {
    const project = db.project(projectId);
    if (!project) {
      return;
    }
    const comments = written.flatMap((one) =>
      one.kind === "comment" ? [one.text] : []
    );
    const attempt =
      project.attemptsHearComments && comments.length > 0
        ? runningAttempt(projectId, taskId)
        : undefined;
    if (attempt) {
      sendYours(attempt, {
        by: "you",
        words: comments.join("\n\n"),
        note:
          comments.length === 1
            ? `It is a comment on ${taskId}, your task.`
            : `They are ${comments.length} comments on ${taskId}, your task, in order.`,
      });
      return;
    }
    if (!project.hearsTasks) {
      return;
    }
    const task = await tasks.get(projectId, taskId);
    const told = await handle(
      projectId,
      inputTrigger(projectId, task, written)
    );
    if (!told.woke) {
      console.warn(
        `[tasks] what you wrote on ${taskId} in ${projectId} reached no handler: ${told.why}`
      );
    }
  };

  /** Gathers the person's writing an event carries; its task's pieces go once it falls quiet. */
  const taskChanged = (event: TaskEvent): void => {
    const found = writtenOf(event);
    if (!found) {
      return;
    }
    const key = `${event.projectId}\0${found.taskId}`;
    const held = gathering.get(key);
    if (held) {
      clearTimeout(held.timer);
    }
    const written = [...(held?.written ?? []), ...found.written];
    const timer = setTimeout(() => {
      gathering.delete(key);
      send(event.projectId, found.taskId, written).catch((error: unknown) =>
        console.warn(
          `[tasks] what you wrote on ${found.taskId} in ${event.projectId} reached no session: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }, quietMs);
    gathering.set(key, { timer, written });
  };

  return { taskChanged };
};
