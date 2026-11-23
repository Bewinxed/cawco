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
 * - **Not a routine.** A task that starts on its own (§5.5) is filed with
 *   neither: it is no one-off work, and only its trigger starts it.
 * - **Phone requests** (choice + fill): a sentence from the phone about the
 *   project. Jev on: Jev picks the action and fills it (the task, the
 *   stage). Off: the project's conversation reads the sentence. The push's own buttons are
 *   not this and always work.
 */

import { detach } from "@cawco/core/detach";
import { taskLink } from "@cawco/core/references";
import { Elysia, ElysiaStatus, problem, t } from "elysia";
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
import { grepScore, wordsOf } from "./memory-lessons";
import {
  hubActor,
  type TaskEvent,
  type Tasks,
  type TaskView,
  YOU_ACTOR,
  YOU_WRITING,
} from "./tasks";

export interface JevTasksDeps {
  readonly caw: Pick<Caw, "tell">;
  readonly db: Pick<
    DbShape,
    | "getInstancesByIds"
    | "getJevSettings"
    | "getOpenRouterConnection"
    | "project"
    | "projectAttempts"
    | "workItemTexts"
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
      /** Open tasks left out of the comparison: past the nearest {@link DUPLICATE_CANDIDATES_MAX}. */
      notCompared?: number;
    }
  | {
      by: "jev" | "rule" | "session";
      duplicateOf: null;
      note?: string;
      /** Open tasks left out of the comparison: past the nearest {@link DUPLICATE_CANDIDATES_MAX}. */
      notCompared?: number;
    };

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
   * The open tasks filed before `newTask`, the {@link DUPLICATE_CANDIDATES_MAX}
   * whose titles share the most words with it (the newest changed first among
   * equals), as their files read, and how many more were not taken: a task is a duplicate of one that was there first, never of
   * one filed after it (two filed together are each judged once, the later
   * against the earlier).
   */
  const openTasks = async (projectId: string, newTask: TaskView) => {
    const list = await tasks.list(projectId);
    if (list instanceof ElysiaStatus) {
      return list;
    }
    const wanted = wordsOf(`${newTask.title}\n${newTask.description}`);
    const eligible = list.tasks
      .filter(
        (task) =>
          task.number < newTask.number &&
          task.kind !== "done" &&
          task.kind !== "dropped" &&
          task.duplicateOf === null
      )
      .map((task) => ({ task, score: grepScore(wanted, task.title) }))
      .sort((a, b) => b.score - a.score || b.task.updatedAt - a.task.updatedAt);
    const open = eligible
      .slice(0, DUPLICATE_CANDIDATES_MAX)
      .map(({ task }) => task);
    const read = await Promise.all(
      open.map((task) => tasks.get(projectId, task.id))
    );
    const candidates: TaskView[] = [];
    for (const task of read) {
      if (task instanceof ElysiaStatus) {
        return task;
      }
      candidates.push(task);
    }
    return { candidates, notCompared: eligible.length - open.length };
  };

  /** Drops `task` as a duplicate of `of`, as the hub, saying why; the words of its refusal when it was not dropped. */
  const markDuplicate = async (
    projectId: string,
    task: TaskView,
    of: string,
    why: string
  ): Promise<string | undefined> => {
    const linked = await tasks.link(
      projectId,
      task.id,
      { duplicateOf: of },
      hubActor(why)
    );
    return linked instanceof ElysiaStatus ? linked.response.detail : undefined;
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
  ) => {
    const jev = key();
    const opened = await openTasks(projectId, task);
    if (opened instanceof ElysiaStatus) {
      return opened;
    }
    const { candidates, notCompared } = opened;
    if (candidates.length === 0) {
      const none: DuplicateOutcome = {
        by: jev ? "jev" : "rule",
        duplicateOf: null,
      };
      return none;
    }
    let outcome: DuplicateOutcome;
    if (jev) {
      outcome = await duplicateByJev(jev, projectId, task, candidates);
    } else if (filer === "session") {
      outcome = duplicateBySession(projectId, task, candidates);
    } else {
      outcome = await duplicateByRule(projectId, task, candidates);
    }
    return notCompared > 0 &&
      (!("duplicateOf" in outcome) || outcome.duplicateOf === null)
      ? { ...outcome, notCompared }
      : outcome;
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
  const triage = async (projectId: string, id: string) => {
    const jev = key();
    if (!jev) {
      return;
    }
    const task = await tasks.get(projectId, id);
    if (task instanceof ElysiaStatus) {
      return task;
    }
    if (task.kind === "done" || task.kind === "dropped") {
      return;
    }
    const state = await jevTriage(jev, projectId, task);
    const triaged = await tasks.update(
      projectId,
      id,
      { fields: { [TRIAGE_FIELD]: state } },
      hubActor(`Jev triaged it ${state}`)
    );
    if (triaged instanceof ElysiaStatus) {
      return triaged;
    }
    console.log(`[tasks] ${id} in ${projectId}: Jev triaged it ${state}`);
  };

  /** A task just filed, judged: Duplicates (a session's are compared in task_create, where it reads the answer), then Triage; a routine neither. */
  const judgeFiled = async (
    event: Extract<TaskEvent, { kind: "created" }>,
    bySession: boolean
  ) => {
    const task = await tasks.get(event.projectId, event.id);
    if (task instanceof ElysiaStatus) {
      return task;
    }
    // A routine starts on its trigger and is no one-off work to compare
    // or triage (§5.5): its runs never come from dispatch's frontier.
    if (task.routine) {
      return;
    }
    // A session's filing is compared in task_create, where it reads the answer.
    if (!bySession) {
      const outcome = await filed(event.projectId, task, "none");
      if (outcome instanceof ElysiaStatus) {
        return outcome;
      }
      if ("duplicateOf" in outcome && outcome.duplicateOf) {
        return;
      }
    }
    return await triage(event.projectId, event.id);
  };

  /** What runs after a change to a project's tasks: Duplicates and Triage on filing. */
  const taskChanged = (event: TaskEvent): void => {
    if (event.kind === "created") {
      const bySession = event.actor.mover === "session";
      const work = () => judgeFiled(event, bySession);
      const unjudged = (why: string) =>
        console.warn(
          `[tasks] ${event.id} in ${event.projectId} was filed; its duplicates and triage were not judged: ${why}`
        );
      detach(
        work().then(
          (answer) => {
            if (answer) {
              unjudged(answer.response.detail);
            }
          },
          (error: unknown) => unjudged(words(error))
        ),
        "task filed"
      );
    }
  };

  /** The task a phone request is about, named or picked; refused when there is none. */
  const named = (picked: string | undefined, action: PhoneAction) =>
    picked
      ? picked
      : problem(409, {
          code: "phone-task-unnamed",
          detail: `Jev read the request as “${action}” but it names no task the project has.`,
        });

  /** Your sentence from the phone, to the project's conversation as your words. */
  const toLead = async (
    projectId: string,
    sentence: string,
    about: string | undefined
  ) => {
    const task = about ? await tasks.get(projectId, about) : undefined;
    if (task instanceof ElysiaStatus) {
      return task;
    }
    const woke = await caw.tell(projectId, {
      by: "you",
      kind: "person-request",
      trigger: `the person wrote from their phone${task ? `, about ${taskLink(projectId, task.id, task.title)}` : ""}`,
      words: sentence,
    });
    if (woke instanceof ElysiaStatus) {
      return woke;
    }
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
    if (stages instanceof ElysiaStatus) {
      return stages;
    }
    if (list instanceof ElysiaStatus) {
      return list;
    }
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

  /** An attempt started or retried for a phone request, as its answer. */
  const phoneStarted = (
    action: "retry" | "start",
    started: Awaited<ReturnType<Dispatcher["startFor"]>>
  ) => {
    if (started instanceof ElysiaStatus) {
      return started;
    }
    const done: PhoneDone = {
      decidedBy: "jev",
      action,
      task: started.task,
      text: started.text,
    };
    return done;
  };

  /** Each action Jev can read a phone sentence as, done as you. */
  const PHONE_DOES = {
    start: async (
      projectId: string,
      _sentence: string,
      about?: string,
      _stage?: string
    ) => {
      const ref = named(about, "start");
      return ref instanceof ElysiaStatus
        ? ref
        : phoneStarted(
            "start",
            await dispatcher.startFor(projectId, ref, undefined)
          );
    },
    retry: async (
      projectId: string,
      _sentence: string,
      about?: string,
      _stage?: string
    ) => {
      const ref = named(about, "retry");
      return ref instanceof ElysiaStatus
        ? ref
        : phoneStarted(
            "retry",
            await dispatcher.retryFor(projectId, ref, undefined)
          );
    },
    move: async (
      projectId: string,
      _sentence: string,
      about?: string,
      stage?: string
    ) => {
      if (!stage) {
        return problem(409, {
          code: "phone-no-stages",
          detail:
            "Jev read the request as a move, but the project has no stages.",
        });
      }
      const ref = named(about, "move");
      if (ref instanceof ElysiaStatus) {
        return ref;
      }
      const moved = await tasks.move(
        projectId,
        ref,
        stage,
        YOU_ACTOR,
        "asked from the phone"
      );
      if (moved instanceof ElysiaStatus) {
        return moved;
      }
      const done: PhoneDone = {
        decidedBy: "jev",
        action: "move",
        task: moved.id,
        stage: moved.stage,
        text: `${moved.id} is in ${moved.stage}.`,
      };
      return done;
    },
    comment: async (
      projectId: string,
      sentence: string,
      about?: string,
      _stage?: string
    ) => {
      const ref = named(about, "comment");
      if (ref instanceof ElysiaStatus) {
        return ref;
      }
      const commentedOn = await tasks.comment(
        projectId,
        ref,
        sentence,
        YOU_WRITING
      );
      if (commentedOn instanceof ElysiaStatus) {
        return commentedOn;
      }
      const done: PhoneDone = {
        decidedBy: "jev",
        action: "comment",
        task: commentedOn.id,
        text: `Noted on ${commentedOn.id}.`,
      };
      return done;
    },
    caw: async (
      projectId: string,
      sentence: string,
      about?: string,
      _stage?: string
    ) => {
      const told = await toLead(projectId, sentence, about);
      if (told) {
        return told;
      }
      const done: PhoneDone = {
        decidedBy: "jev",
        action: "caw",
        ...(about ? { task: about } : {}),
        text: "Caw reads it.",
      };
      return done;
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
  ) => {
    const sentence = text.trim();
    if (!sentence) {
      return problem(400, {
        code: "phone-request-empty",
        detail: "A request needs words.",
      });
    }
    const task = taskId ? await tasks.get(projectId, taskId) : undefined;
    if (task instanceof ElysiaStatus) {
      return task;
    }
    const jev = key();
    if (!jev) {
      offLine(
        "phone",
        projectId,
        `the project's conversation reads the sentence${task ? ` about ${task.id}` : ""}`
      );
      const told = await toLead(projectId, sentence, task?.id);
      if (told) {
        return told;
      }
      const done: PhoneDone = {
        decidedBy: "conversation",
        action: "conversation",
        text: "Caw reads it.",
      };
      return done;
    }
    const decided = await phoneByJev(jev, projectId, sentence, task);
    if (decided instanceof ElysiaStatus) {
      return decided;
    }
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
      // What fails beyond a refusal is Jev's or Caw's, not the hub's.
      try {
        return await jevTasks.phoneRequest(params.id, body.text, body.taskId);
      } catch (error) {
        return problem(502, { code: "jev-folder", detail: words(error) });
      }
    }
  );
