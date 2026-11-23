/**
 * Your approval goes to the agent that filed the task (owner, 2026-10-16:
 * "the agent who puts the task should be the one who decides what happens
 * to it after i approve it"). Approving is your move that passes a task on
 * out of a stage of kind `you` (tasks.ts `move`, from the web and iOS task
 * sheets and the phone alike); its commit's reason says `approved`, which
 * the task's activity shows. Then the filer hears it and does what comes
 * next itself: posts or schedules it through `action_propose` (actions.ts, a
 * second approval only where the project asks for one), merges it, moves it
 * on, closes it or files the next task.
 *
 * - **Only your act travels as yours.** The message says what you did (the
 *   task, its move, your reason) and nothing an agent wrote: the filer
 *   reads the task's result itself with `task_read`, as content it read.
 * - **One trigger on the task** (triggers.ts): the router hands it to the
 *   filer, the session whose commit first added the task's file
 *   (task-history.ts `createdBy`), while it takes input, told as your act;
 *   a stopped or sleeping one starts again. When the filer takes no input
 *   now (gone, its finished work's workspace archived or taken over), or is
 *   the project's Caw conversation, the session on the task hears it, else
 *   a fresh one; held on the project while its triggers are off, the task
 *   waiting in the stage you moved it to.
 * - A task you filed, or the hub, a routine or a hand edit did, has no
 *   agent to hear it: you decide what comes next yourself.
 */

import { detach } from "@cawco/core/detach";
import type { InstanceRow } from "@cawco/core/protocol";
import { taskLink } from "@cawco/core/references";
import { noticeWords } from "@cawco/core/words/notices";
import { ElysiaStatus } from "elysia";
import type { PersonsSend } from "./caw";
import type { TaskEvent, Tasks } from "./tasks";
import type { TriggerEvent } from "./trigger-event";

export interface TaskApprovalDeps {
  /** Your act to a session, CawCo's notice of it (server.ts `sendYours`). */
  readonly sendYours: (row: InstanceRow, said: PersonsSend) => void;
  readonly tasks: Pick<Tasks, "get">;
  /** A trigger on the task, to the router (triggers.ts `routeQuietly`). */
  readonly trigger: (projectId: string, event: TriggerEvent) => void;
}

/** An approval as its event carries it: the task, its move, and your reason when you gave one. */
type Approval = Extract<TaskEvent, { kind: "moved" }>;

const words = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** What the filer reads: your act alone, and that what comes next is its to do. */
const approvalText = (
  approval: Approval,
  title: string,
  filer: string
): string => {
  const { id, from, to, reason } = approval;
  return [
    `[CawCo] The owner approved ${id} “${title}”, ${filer}: it moved from ${from} to ${to}.${reason ? ` The owner's reason: ${reason}` : ""}`,
    `Read its result with task_read("${id}"). Carrying out what they approved is yours: post or schedule it with action_propose (task: "${id}"), merge it, move it on or close it with task_update. Work past it that nobody asked for is one scope card (Do it / Not now) on a one-card page, routed by Who decides, its task filed in a todo stage with waits_on <page>#<card>=do, so it starts only on their Do it; on a Not now, drop the task with task_update, the card as its reason, and do not raise it again unless asked.`,
  ].join("\n\n");
};

export const createTaskApproval = ({
  sendYours,
  tasks,
  trigger,
}: TaskApprovalDeps) => {
  /**
   * An approval, a trigger on the task (triggers.ts): its filer hears it
   * while it takes input (the router's owner for a task's move), told as
   * your act; else the session on the task, else a fresh one. A task no
   * session filed has no one to hear it. The task's refused read.
   */
  const approved = async (approval: Approval) => {
    const { projectId, id } = approval;
    const task = await tasks.get(projectId, id);
    if (task instanceof ElysiaStatus) {
      return task;
    }
    const by = task.createdBy;
    if (by?.mover !== "session") {
      return;
    }
    const whose = (heard: string) =>
      heard === by.id
        ? "the task you filed"
        : `which ${by.name} filed and which comes to you because that session does not hear it`;
    trigger(projectId, {
      kind: "task-move",
      thing: { kind: "task", id, name: taskLink(projectId, id, task.title) },
      what: `The owner approved ${taskLink(projectId, id, task.title)}, moving it from ${approval.from} to ${approval.to}.`,
      delta: approvalText(approval, task.title, whose("")),
      who: "you",
      deliver: (owner) => {
        sendYours(owner, {
          by: "act",
          line: noticeWords.approved(task.title),
          text: approvalText(approval, task.title, whose(owner.id)),
        });
        console.log(
          `[tasks] ${id} in ${projectId}: approved; ${owner.id} hears it`
        );
        return Promise.resolve(true);
      },
    });
  };

  return {
    /** A task moved (tasks.ts `listen`): your approval reaches its filer. */
    taskChanged(event: TaskEvent): void {
      if (event.kind !== "moved" || !event.approved) {
        return;
      }
      const unheard = (why: string) =>
        console.warn(
          `[tasks] ${event.id} in ${event.projectId} was approved; its filer did not hear it: ${why}`
        );
      detach(
        approved(event).then(
          (unread) => unread && unheard(unread.response.detail),
          (error: unknown) => unheard(words(error))
        ),
        "task approved"
      );
    },
  };
};
