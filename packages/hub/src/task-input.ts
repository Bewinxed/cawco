/**
 * The person's writing on a task (PRD §5.3, tsk-141, tsk-310): a comment, a
 * to-do or a task they add at the board or the phone is input, no @ needed.
 * Each task's pieces are gathered until {@link QUIET_MS} passes with nothing
 * new, then go as one trigger on the task (triggers.ts): the task's running
 * attempt hears it, else the session already on the task, else a fresh one
 * that folds them into the task and answers under it (the
 * project-task-input skill). Never the project's Caw conversation.
 *
 * - Only a change whose actor carries `words` (tasks.ts `YOU_WRITING`, set by
 *   the person's routes alone) is gathered: what an agent, Caw or the hub
 *   writes wakes nothing, so a session's own edits and answers never loop.
 * - The project's `hearsTasks` and `attemptsHearComments` switches are the
 *   router's to read as the trigger goes.
 */

import { taskLink } from "@cawco/core/references";
import { ElysiaStatus } from "elysia";
import type { HubLifetimeShape, HubTimer } from "./lifetime";
import type { TaskEvent, Tasks } from "./tasks";
import type { TriggerEvent } from "./trigger-event";

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

/** One task's gathered pieces as one trigger on it: what the person wrote, verbatim, and what they added. */
const inputEvent = (
  projectId: string,
  task: { id: string; title: string },
  written: readonly Written[]
): TriggerEvent => {
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
  let what = `The person added to-dos to ${link}.`;
  if (comments.length > 0) {
    what =
      comments.length === 1
        ? `The person commented on ${link}.`
        : `The person commented ${comments.length} times on ${link}, in order.`;
  } else if (added) {
    what = `The person added ${link}.`;
  }
  return {
    kind: "task-input",
    thing: { kind: "task", id: task.id, name: link },
    what,
    delta: [...comments, ...acts].join("\n\n"),
    who: "you",
  };
};

export interface TaskInputDeps {
  readonly lifetime: Pick<HubLifetimeShape, "after" | "cancel">;
  /** The quiet spell; {@link QUIET_MS} unless a test shortens it. */
  readonly quietMs?: number;
  readonly tasks: Pick<Tasks, "get">;
  /** A trigger on the task, to the router (triggers.ts `routeQuietly`). */
  readonly trigger: (projectId: string, event: TriggerEvent) => void;
}

export const createTaskInput = ({
  lifetime,
  quietMs = QUIET_MS,
  tasks,
  trigger,
}: TaskInputDeps) => {
  /** Each task's pieces waiting for quiet, by project and task, with the timer that sends them. */
  const gathering = new Map<string, { timer: HubTimer; written: Written[] }>();

  /** One task's pieces, a trigger on it; the task's refused read. */
  const send = async (
    projectId: string,
    taskId: string,
    written: Written[]
  ) => {
    const task = await tasks.get(projectId, taskId);
    if (task instanceof ElysiaStatus) {
      return task;
    }
    trigger(projectId, inputEvent(projectId, task, written));
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
      lifetime.cancel(held.timer);
    }
    const written = [...(held?.written ?? []), ...found.written];
    const timer = lifetime.after("task input sent", quietMs, () => {
      gathering.delete(key);
      const unsent = (why: string) =>
        console.warn(
          `[tasks] what you wrote on ${found.taskId} in ${event.projectId} went nowhere: ${why}`
        );
      send(event.projectId, found.taskId, written).then(
        (refused) => refused && unsent(refused.response.detail),
        (error: unknown) =>
          unsent(error instanceof Error ? error.message : String(error))
      );
    });
    gathering.set(key, { timer, written });
  };

  return { taskChanged };
};
