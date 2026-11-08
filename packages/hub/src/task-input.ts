/**
 * The person's writing on a task, to the project's conversation (PRD §5.3,
 * tsk-141): a comment, a to-do or a task they add at the board or the phone
 * is input, no @ needed. Each task's pieces are gathered until
 * {@link QUIET_MS} passes with nothing new, then told to the conversation as
 * one send (caw.ts `tell`), which folds them into the task and answers under
 * it (the project-task-input skill).
 *
 * - Their comments are their words (`by: "you"`, the task named in the
 *   note); a task or to-dos they add, with no comment, are their act
 *   (`by: "act"`). Either reaches the conversation whether its events are
 *   on or off, starting it when it has none.
 * - Only a change whose actor carries `words` (tasks.ts `YOU_WRITING`, set by
 *   the person's routes alone) is gathered: what an agent, Caw or the hub
 *   writes wakes nothing, so Caw's own edits and answer never loop.
 * - The project's `hearsTasks` switch, read as the send goes, holds it all
 *   back. A live attempt hears a comment at once on its own path
 *   (jev-tasks.ts), under its own switch.
 */
import { ACT_ORIGIN } from "@cawco/core/harness/kinds";
import { taskLink } from "@cawco/core/references";
import { noticeWords } from "@cawco/core/words/notices";
import type { Caw, YourAct, YourWords } from "./caw";
import type { DbShape } from "./db";
import type { TaskEvent, Tasks } from "./tasks";

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

/** One task's gathered pieces as one send: their comments as their words, else their act. */
const inputEvent = (
  projectId: string,
  task: { id: string; title: string },
  written: readonly Written[]
): YourWords | YourAct => {
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
  if (comments.length > 0) {
    return {
      by: "you",
      kind: "task-input",
      trigger: `the person commented on ${link}`,
      words: comments.join("\n\n"),
      note: [
        comments.length === 1
          ? `It is their comment on ${task.id}.`
          : `They are their ${comments.length} comments on ${task.id}, in order.`,
        ...acts,
      ].join("\n"),
    };
  }
  return {
    by: "act",
    kind: "task-input",
    trigger: added
      ? `the person added ${link}`
      : `the person added to-dos to ${link}`,
    origin: {
      name: ACT_ORIGIN,
      line: added
        ? noticeWords.taskAdded(task.id)
        : noticeWords.todosAdded(task.id),
    },
    text: acts.join("\n"),
  };
};

export interface TaskInputDeps {
  readonly caw: Pick<Caw, "tell">;
  readonly db: Pick<DbShape, "project">;
  /** The quiet spell; {@link QUIET_MS} unless a test shortens it. */
  readonly quietMs?: number;
  readonly tasks: Pick<Tasks, "get">;
}

export const createTaskInput = ({
  caw,
  db,
  quietMs = QUIET_MS,
  tasks,
}: TaskInputDeps) => {
  /** Each task's pieces waiting for quiet, by project and task, with the timer that sends them. */
  const gathering = new Map<
    string,
    { timer: ReturnType<typeof setTimeout>; written: Written[] }
  >();

  /** Tells the conversation one task's pieces, unless the project's switch is off; what did not go is logged. */
  const send = async (
    projectId: string,
    taskId: string,
    written: Written[]
  ): Promise<void> => {
    if (!db.project(projectId)?.hearsTasks) {
      return;
    }
    const task = await tasks.get(projectId, taskId);
    const told = await caw.tell(
      projectId,
      inputEvent(projectId, task, written)
    );
    if (!told.woke) {
      console.warn(
        `[tasks] what you wrote on ${taskId} in ${projectId} did not reach its conversation: ${told.why}`
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
          `[tasks] what you wrote on ${found.taskId} in ${event.projectId} did not reach its conversation: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }, quietMs);
    gathering.set(key, { timer, written });
  };

  return { taskChanged };
};
