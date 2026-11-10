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
 * - **The filer** is the session whose commit first added the task's file
 *   (task-history.ts `createdBy`). It is sent your approval as your words
 *   are (the composer's send path, as jev-tasks.ts sends your comments): a
 *   stopped or sleeping session starts again.
 * - **Caw** hears it when its filer takes no input now (gone, its
 *   conversation gone, its finished work's workspace archived or taken
 *   over), as an event: only while he is on for the project. Off, nobody is
 *   woken, and the task waits in the stage you moved it to, where the board
 *   shows it. The project's conversation files as any session does, and
 *   hears it as its filer.
 * - A task you filed, or the hub, a routine or a hand edit did, has no
 *   agent to hear it: you decide what comes next yourself.
 */

import { detach } from "@cawco/core/detach";
import type { InstanceRow } from "@cawco/core/protocol";
import { taskLink } from "@cawco/core/references";
import { noticeWords } from "@cawco/core/words/notices";
import { ElysiaStatus } from "elysia";
import type { Caw, PersonsSend } from "./caw";
import type { DbShape } from "./db";
import type { TaskEvent, Tasks } from "./tasks";

export interface TaskApprovalDeps {
  readonly caw: Pick<Caw, "tell">;
  readonly db: Pick<DbShape, "getInstancesByIds" | "project">;
  /** Why a session takes none of your words now (server.ts `inputRefusal`), or nothing. */
  readonly refused: (row: InstanceRow) => string | undefined;
  /** Your act to a session, CawCo's notice of it (server.ts `sendYours`). */
  readonly sendYours: (row: InstanceRow, said: PersonsSend) => void;
  readonly tasks: Pick<Tasks, "get">;
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
  caw,
  db,
  refused,
  sendYours,
  tasks,
}: TaskApprovalDeps) => {
  /** An approval, to its filer; to Caw, while he is on, when he filed it or its filer takes no input now; the task's refused read. */
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
    const [row] = by.id ? db.getInstancesByIds([by.id]) : [];
    const silent = row ? refused(row) : "gone";
    if (row && !silent) {
      sendYours(row, {
        by: "act",
        line: noticeWords.approved(task.title),
        text: approvalText(approval, task.title, "the task you filed"),
      });
      console.log(
        `[tasks] ${id} in ${projectId}: approved; its filer ${row.id} hears it`
      );
      return;
    }
    const why = `its filer takes no input now (${silent})`;
    if (!db.project(projectId)?.eventsOn) {
      console.log(
        `[tasks] ${id} in ${projectId}: approved; ${why}, and Caw is off: nobody is woken, and it waits in ${approval.to}`
      );
      return;
    }
    const filer = `which ${by.name} filed and which comes to you because that session takes no input now (${silent})`;
    const woke = await caw.tell(projectId, {
      by: "event",
      kind: "task-move",
      trigger: `the owner approved ${taskLink(projectId, id, task.title)}, moving it from ${approval.from} to ${approval.to}`,
      text: approvalText(approval, task.title, filer),
    });
    console.log(
      `[tasks] ${id} in ${projectId}: approved; ${why}: Caw ${woke.woke ? "hears it" : `was not woken: ${woke.why}`}`
    );
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
