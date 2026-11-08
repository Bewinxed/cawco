/**
 * Jev placement (§5.9) on a project's tasks: the rows that act on the board.
 *
 * - **Duplicates** (yes/no), as a task is filed. Jev on: Jev compares it
 *   with the project's open tasks and a yes drops it as a duplicate (the
 *   hub links `duplicate_of`). Off: a session that filed it is handed the
 *   candidates to compare (task_create's answer); filed by no session (you
 *   at the dashboard, the hub), an open task with exactly its files and
 *   checks makes it a duplicate.
 * - **Triage** (choice), as a task is filed while Jev is on: its `triage`
 *   field. Off: a session triages when asked (the triage skill).
 * - **Phone requests** (choice + fill): a sentence from the phone about the
 *   project. Jev on: Jev picks the action and fills it (the task, the
 *   stage). Off: the project's newest conversation reads the sentence, as
 *   the person's words (caw.ts `say`). The push's own buttons are not this
 *   and always work.
 *
 * Your comment on a task goes to its running attempt or its handler
 * (task-input.ts, the owner's card "What a trigger wakes"): an attempt that
 * has ended is never woken, continued or compressed for it.
 */
import { taskLink } from "@cawco/core";
import { detach } from "@cawco/core/detach";
import { Elysia, status, t } from "elysia";
import type { Caw } from "./caw";
import type { DbShape } from "./db";
import type { Dispatcher } from "./dispatch";
import { type JevAccess, jevAccess } from "./jev";
import {
  DUPLICATE_CANDIDATES_MAX,
  type DuplicateBrief,
  head,
  jevDuplicate,
  jevPhone,
  jevTriage,
  offLine,
  type PhoneAction,
  sameFilesAndChecks,
  TRIAGE_FIELD,
} from "./jev-placement";
import { FolderRefusal } from "./project-folder";
import {
  hubActor,
  type TaskEvent,
  type Tasks,
  type TaskView,
  YOU_ACTOR,
  YOU_WRITING,
} from "./tasks";

export interface JevTasksDeps {
  readonly caw: Pick<Caw, "say">;
  readonly db: Pick<
    DbShape,
    | "getInstancesByIds"
    | "getJevSettings"
    | "getOpenRouterConnection"
    | "project"
    | "projectAttempts"
  >;
  readonly dispatcher: Pick<Dispatcher, "retryFor" | "startFor">;
  readonly tasks: Tasks;
}

/** What Duplicates did with a task filed. */
export type DuplicateOutcome =
  | { by: "jev" | "rule"; duplicateOf: string; noul?: number }
  | {
      by: "session";
      candidates: { id: string; title: string }[];
      /** What the filing session reads. */
      ask: string;
    }
  | { by: "jev" | "rule" | "session"; duplicateOf: null; note?: string };

const words = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** A task as Duplicates compares it. */
const briefOf = (task: TaskView): DuplicateBrief => ({
  id: task.id,
  title: task.title,
  description: task.description,
  checks: task.checks,
  files: [...task.owns, ...task.outputs],
});

/** What the hub did for a phone request. */
export interface PhoneDone {
  action: PhoneAction | "conversation";
  decidedBy: "jev" | "conversation";
  stage?: string;
  task?: string;
  text: string;
}

export const createJevTasks = ({
  caw,
  db,
  dispatcher,
  tasks,
}: JevTasksDeps) => {
  const key = () => jevAccess(db);

  /**
   * The open tasks filed before `newTask`, newest changed first, as their
   * files read: a task is a duplicate of one that was there first, never of
   * one filed after it (two filed together are each judged once, the later
   * against the earlier).
   */
  const openTasks = async (
    projectId: string,
    newTask: TaskView
  ): Promise<TaskView[]> => {
    const { tasks: all } = await tasks.list(projectId);
    const open = all
      .filter(
        (task) =>
          task.number < newTask.number &&
          task.kind !== "done" &&
          task.kind !== "dropped" &&
          task.duplicateOf === null
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, DUPLICATE_CANDIDATES_MAX);
    return await Promise.all(open.map((task) => tasks.get(projectId, task.id)));
  };

  /** Drops `task` as a duplicate of `of`, as the hub, saying why. */
  const markDuplicate = async (
    projectId: string,
    task: TaskView,
    of: string,
    why: string
  ): Promise<string | undefined> => {
    try {
      await tasks.link(projectId, task.id, { duplicateOf: of }, hubActor(why));
    } catch (error) {
      if (error instanceof FolderRefusal) {
        return error.message;
      }
      throw error;
    }
  };

  /** Duplicates with Jev on: Jev compares; a yes drops the task. */
  const duplicateByJev = async (
    jev: JevAccess,
    projectId: string,
    task: TaskView,
    candidates: TaskView[]
  ): Promise<DuplicateOutcome> => {
    const found = await jevDuplicate(
      jev,
      projectId,
      briefOf(task),
      candidates.map(briefOf)
    );
    if (!found) {
      return { by: "jev", duplicateOf: null };
    }
    const refusedWhy = await markDuplicate(
      projectId,
      task,
      found.id,
      `Jev: duplicate of ${found.id} (${found.noul.toFixed(2)})`
    );
    console.log(
      `[tasks] ${task.id} in ${projectId}: Jev judged it a duplicate of ${found.id} (${found.noul.toFixed(2)})${refusedWhy ? `, but it was not dropped: ${refusedWhy}` : ""}`
    );
    return refusedWhy
      ? {
          by: "jev",
          duplicateOf: null,
          note: `Jev judged it a duplicate of ${taskLink(projectId, found.id, candidates.find((one) => one.id === found.id)?.title ?? found.id)}, but it was not dropped: ${refusedWhy}`,
        }
      : { by: "jev", duplicateOf: found.id, noul: found.noul };
  };

  /** Duplicates with Jev off, filed by a session: it compares the candidates. */
  const duplicateBySession = (
    projectId: string,
    task: TaskView,
    candidates: TaskView[]
  ): DuplicateOutcome => {
    offLine(
      "duplicates",
      projectId,
      `${task.id} was filed by a session; it compares ${candidates.length} open tasks`
    );
    return {
      by: "session",
      candidates: candidates.map((each) => ({
        id: each.id,
        title: each.title,
      })),
      ask: 'Compare it with these open tasks. If it repeats one, link it to that one with task_link, edge "duplicate_of", which drops it.',
    };
  };

  /**
   * Duplicates for a task just filed, by a session (`filer: "session"`) or
   * by no session (you at the dashboard, the hub).
   */
  const filed = async (
    projectId: string,
    task: TaskView,
    filer: "session" | "none"
  ): Promise<DuplicateOutcome> => {
    const jev = key();
    const candidates = await openTasks(projectId, task);
    if (candidates.length === 0) {
      return { by: jev ? "jev" : "rule", duplicateOf: null };
    }
    if (jev) {
      return await duplicateByJev(jev, projectId, task, candidates);
    }
    return filer === "session"
      ? duplicateBySession(projectId, task, candidates)
      : await duplicateByRule(projectId, task, candidates);
  };

  /** Duplicates with Jev off, filed by no session: an open task with exactly its files and checks. */
  const duplicateByRule = async (
    projectId: string,
    task: TaskView,
    candidates: TaskView[]
  ): Promise<DuplicateOutcome> => {
    const mine = briefOf(task);
    const same = candidates.find((each) =>
      sameFilesAndChecks(mine, briefOf(each))
    );
    if (!same) {
      offLine(
        "duplicates",
        projectId,
        `${task.id} was filed by no session; no open task has exactly its files and checks`
      );
      return { by: "rule", duplicateOf: null };
    }
    const refusedWhy = await markDuplicate(
      projectId,
      task,
      same.id,
      `same files and checks as ${same.id}`
    );
    offLine(
      "duplicates",
      projectId,
      `${task.id} was filed by no session; ${same.id} has exactly its files and checks, so it is a duplicate${refusedWhy ? `, but it was not dropped: ${refusedWhy}` : ""}`
    );
    return refusedWhy
      ? { by: "rule", duplicateOf: null, note: refusedWhy }
      : { by: "rule", duplicateOf: same.id };
  };

  /** Triage with Jev on, for a task just filed: its `triage` field, written as the hub. */
  const triage = async (projectId: string, id: string): Promise<void> => {
    const jev = key();
    if (!jev) {
      return;
    }
    const task = await tasks.get(projectId, id);
    if (task.kind === "done" || task.kind === "dropped") {
      return;
    }
    const state = await jevTriage(jev, projectId, task);
    await tasks.update(
      projectId,
      id,
      { fields: { [TRIAGE_FIELD]: state } },
      hubActor(`Jev triaged it ${state}`)
    );
    console.log(`[tasks] ${id} in ${projectId}: Jev triaged it ${state}`);
  };

  /**
   * What runs after a change to a project's tasks: Duplicates and Triage on
   * filing.
   */
  const taskChanged = (event: TaskEvent): void => {
    if (event.kind === "created") {
      const bySession = event.actor.mover === "session";
      const work = async () => {
        // A session's filing is compared in task_create, where it reads the answer.
        if (!bySession) {
          const task = await tasks.get(event.projectId, event.id);
          const outcome = await filed(event.projectId, task, "none");
          if ("duplicateOf" in outcome && outcome.duplicateOf) {
            return;
          }
        }
        await triage(event.projectId, event.id);
      };
      detach(
        work().catch((error: unknown) =>
          console.warn(
            `[tasks] ${event.id} in ${event.projectId} was filed; its duplicates and triage were not judged: ${words(error)}`
          )
        ),
        "task filed"
      );
    }
  };

  /** The task a phone request is about, named or picked; refused when there is none. */
  const named = (picked: string | undefined, action: PhoneAction): string => {
    if (!picked) {
      throw new FolderRefusal(
        409,
        `Jev read the request as “${action}” but it names no task the project has.`
      );
    }
    return picked;
  };

  /** Your sentence from the phone, to the project's newest conversation as your words. */
  const toLead = async (
    projectId: string,
    sentence: string,
    about: string | undefined
  ): Promise<void> => {
    const task = about ? await tasks.get(projectId, about) : undefined;
    await caw.say(projectId, {
      by: "you",
      kind: "person-request",
      trigger: `the person wrote from their phone${task ? `, about ${taskLink(projectId, task.id, task.title)}` : ""}`,
      words: sentence,
    });
  };

  /** Jev's reading of a phone sentence, over the project's stages and open tasks. */
  const phoneByJev = async (
    jev: JevAccess,
    projectId: string,
    sentence: string,
    task: TaskView | undefined
  ) => {
    const [stages, list] = await Promise.all([
      tasks.stages(projectId),
      tasks.list(projectId),
    ]);
    const decided = await jevPhone(jev, projectId, sentence, {
      stages: stages.stages.map((stage) => ({
        name: stage.name,
        kind: stage.kind,
      })),
      ...(task
        ? { task: { id: task.id, title: task.title, stage: task.stage } }
        : {}),
      tasks: list.tasks
        .filter((each) => each.kind !== "done" && each.kind !== "dropped")
        .map((each) => ({ id: each.id, title: each.title, stage: each.stage })),
    });
    const about = task?.id ?? decided.task;
    console.log(
      `[phone] ${projectId}: Jev read “${head(sentence, 80)}” as ${decided.action}${about ? ` on ${about}` : ""}${decided.action === "move" ? ` to ${decided.stage}` : ""}`
    );
    return { ...decided, about };
  };

  /** Each action Jev can read a phone sentence as, done as you. */
  const PHONE_DOES: Record<
    PhoneAction,
    (
      projectId: string,
      sentence: string,
      about: string | undefined,
      stage: string | undefined
    ) => Promise<PhoneDone>
  > = {
    start: async (projectId, _sentence, about) => {
      const started = await dispatcher.startFor(
        projectId,
        named(about, "start"),
        undefined
      );
      return {
        decidedBy: "jev",
        action: "start",
        task: started.task,
        text: started.text,
      };
    },
    retry: async (projectId, _sentence, about) => {
      const started = await dispatcher.retryFor(
        projectId,
        named(about, "retry"),
        undefined
      );
      return {
        decidedBy: "jev",
        action: "retry",
        task: started.task,
        text: started.text,
      };
    },
    move: async (projectId, _sentence, about, stage) => {
      if (!stage) {
        throw new FolderRefusal(
          409,
          "Jev read the request as a move, but the project has no stages."
        );
      }
      const moved = await tasks.move(
        projectId,
        named(about, "move"),
        stage,
        YOU_ACTOR,
        "asked from the phone"
      );
      return {
        decidedBy: "jev",
        action: "move",
        task: moved.id,
        stage: moved.stage,
        text: `${moved.id} is in ${moved.stage}.`,
      };
    },
    comment: async (projectId, sentence, about) => {
      const commentedOn = await tasks.comment(
        projectId,
        named(about, "comment"),
        sentence,
        YOU_WRITING
      );
      return {
        decidedBy: "jev",
        action: "comment",
        task: commentedOn.id,
        text: `Noted on ${commentedOn.id}.`,
      };
    },
    caw: async (projectId, sentence, about) => {
      await toLead(projectId, sentence, about);
      return {
        decidedBy: "jev",
        action: "caw",
        ...(about ? { task: about } : {}),
        text: "Caw reads it.",
      };
    },
  };

  /**
   * A sentence from the phone about the project (Phone requests, choice +
   * fill). Jev on: Jev picks the action and fills it, and the hub does it as
   * you. Off: the project's conversation reads the sentence, as your words.
   */
  const phoneRequest = async (
    projectId: string,
    text: string,
    taskId: string | undefined
  ): Promise<PhoneDone> => {
    const sentence = text.trim();
    if (!sentence) {
      throw new FolderRefusal(400, "A request needs words.");
    }
    const task = taskId ? await tasks.get(projectId, taskId) : undefined;
    const jev = key();
    if (!jev) {
      offLine(
        "phone",
        projectId,
        `the project's conversation reads the sentence${task ? ` about ${task.id}` : ""}`
      );
      await toLead(projectId, sentence, task?.id);
      return {
        decidedBy: "conversation",
        action: "conversation",
        text: "Caw reads it.",
      };
    }
    const decided = await phoneByJev(jev, projectId, sentence, task);
    return await PHONE_DOES[decided.action](
      projectId,
      sentence,
      decided.about,
      decided.stage
    );
  };

  return { filed, taskChanged, phoneRequest };
};

export type JevTasks = ReturnType<typeof createJevTasks>;

/** The phone's request route: one sentence about a project, and optionally its task. */
export const phoneRequestRoutes = (jevTasks: JevTasks) =>
  new Elysia().post(
    "/api/projects/:id/requests",
    {
      body: t.Object({ text: t.String(), taskId: t.Optional(t.String()) }),
    },
    async ({ params, body, request, server }) => {
      // Starting an attempt, or Caw, can take a while.
      server?.timeout(request, 0);
      try {
        return await jevTasks.phoneRequest(params.id, body.text, body.taskId);
      } catch (error) {
        if (error instanceof FolderRefusal) {
          return status(error.status, error.message);
        }
        return status(502, words(error));
      }
    }
  );
