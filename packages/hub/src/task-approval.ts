/**
 * Your approval goes to the agent that filed the task (owner, 2026-10-16:
 * "the agent who puts the task should be the one who decides what happens
 * to it after i approve it"). Approving is your move that passes a task on
 * out of a stage of kind `you` (tasks.ts `move`, from the web and iOS task
 * sheets and the phone alike); its commit's reason says `approved`, which
 * the task's activity shows. Then the filer hears it, with the task and its
 * result, and does what comes next itself: posts or schedules it through
 * `action_propose` (actions.ts, a second approval only where the project
 * asks for one), merges it, moves it on, closes it or files the next task.
 *
 * - **The filer** is the session whose commit first added the task's file
 *   (task-history.ts `createdBy`). It is sent your approval as your words
 *   are (the composer's send path, as jev-tasks.ts sends your comments): a
 *   stopped or sleeping session starts again.
 * - **Caw** hears it when he filed it, or when its filer takes no input now
 *   (gone, its conversation gone, its finished work's workspace archived or
 *   taken over): his wake, as your pins on a page whose writer ended reach
 *   him (server.ts `marksToCaw`), in the thread that named the task.
 * - A task you filed, or the hub, a routine or a hand edit did, has no
 *   agent to hear it: you decide what comes next yourself.
 */
import type { InstanceRow } from "@cawco/core";
import { detach } from "@cawco/core/detach";
import type { Caw } from "./caw";
import type { DbShape } from "./db";
import type { TaskEvent, Tasks, TaskView } from "./tasks";

export interface TaskApprovalDeps {
  readonly caw: Pick<Caw, "wakeOnce">;
  readonly db: Pick<DbShape, "getInstancesByIds" | "threadOfTask">;
  /** Why a session takes none of your words now (server.ts `inputRefusal`), or nothing. */
  readonly refused: (row: InstanceRow) => string | undefined;
  /** Your words to a session, as the composer sends them. */
  readonly sendYours: (row: InstanceRow, text: string) => void;
  readonly tasks: Pick<Tasks, "get">;
}

const words = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** What the filer reads: the task, your approval, its result, and that what comes next is its to do. */
const approvalText = (task: TaskView, from: string, filer: string): string => {
  const result = task.result
    ? `Its result: ${task.result.headline ?? "its last attempt finished with no headline"}${task.outputs.length > 0 ? ` Its outputs: ${task.outputs.join(", ")}.` : ""}`
    : "No attempt has handed back a result for it.";
  return [
    `[CawCo] The owner approved ${task.id} “${task.title}”, ${filer}: it moved from ${from} to ${task.stage}.`,
    result,
    `What happens to it now is yours to decide and do: post or schedule it with action_propose (task: "${task.id}"), merge it, move it on or close it with task_update, or file the next task with task_create. task_read("${task.id}") has the whole task.`,
  ].join("\n\n");
};

export const createTaskApproval = ({
  caw,
  db,
  refused,
  sendYours,
  tasks,
}: TaskApprovalDeps) => {
  /** The approval of `id`, to its filer; Caw when he filed it or its filer takes no input now. */
  const approved = async (
    projectId: string,
    id: string,
    from: string
  ): Promise<void> => {
    const task = await tasks.get(projectId, id);
    const by = task.createdBy;
    if (!(by && (by.mover === "session" || by.mover === "lead"))) {
      return;
    }
    const [row] = by.id ? db.getInstancesByIds([by.id]) : [];
    const silent = by.mover === "session" && (row ? refused(row) : "gone");
    if (by.mover === "session" && row && !silent) {
      sendYours(row, approvalText(task, from, "the task you filed"));
      console.log(
        `[tasks] ${id} in ${projectId}: approved; its filer ${row.id} hears it`
      );
      return;
    }
    const filer = silent
      ? `which ${by.name} filed and which comes to you because that session takes no input now (${silent})`
      : "the task you filed";
    const woke = await caw.wakeOnce(projectId, {
      by: "you",
      text: approvalText(task, from, filer),
      threadId: db.threadOfTask(projectId, id)?.id,
    });
    console.log(
      `[tasks] ${id} in ${projectId}: approved; Caw ${woke.woke ? "hears it" : `was not woken: ${woke.why.words}`}`
    );
  };

  return {
    /** A task moved (tasks.ts `listen`): your approval reaches its filer. */
    taskChanged(event: TaskEvent): void {
      if (event.kind !== "moved" || !event.approved) {
        return;
      }
      const { projectId, id, from } = event;
      detach(
        approved(projectId, id, from).catch((error: unknown) =>
          console.warn(
            `[tasks] ${id} in ${projectId} was approved; its filer did not hear it: ${words(error)}`
          )
        ),
        "task approved"
      );
    },
  };
};
