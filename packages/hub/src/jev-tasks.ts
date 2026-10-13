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
 *   field. Off: the lead, one batch per wake (caw.ts reads {@link triageFor}).
 * - **Attach or fresh** (yes/no), as you comment on a task whose newest
 *   attempt has ended: its session continues with your words (attach) or a
 *   fresh attempt starts, briefed with the task, the last failure and the
 *   comments since (dispatch.ts). Jev on: Jev says whether that session's
 *   history matters. Off, with no caller: attach only when it is warm, idle
 *   and on the same task. A live attempt simply reads your comment.
 * - **Phone requests** (choice + fill): a sentence from the phone about the
 *   project. Jev on: Jev picks the action and fills it (the task, the
 *   stage). Off: the lead reads the sentence. The push's own buttons are
 *   not this and always work.
 */
import { detach } from "@cawco/core/detach";
import { Elysia, status, t } from "elysia";
import type { Caw } from "./caw";
import type { DbShape } from "./db";
import type { Dispatcher } from "./dispatch";
import { type JevAccess, jevAccess } from "./jev";
import {
  attachByRule,
  DUPLICATE_CANDIDATES_MAX,
  type DuplicateBrief,
  head,
  JevFailed,
  jevAttach,
  jevDuplicate,
  jevPhone,
  jevTriage,
  offLine,
  type PhoneAction,
  sameFilesAndChecks,
  TRIAGE_FIELD,
  triageBatch,
} from "./jev-placement";
import { FolderRefusal } from "./project-folder";
import {
  hubActor,
  type TaskEvent,
  type Tasks,
  type TaskView,
  YOU_ACTOR,
} from "./tasks";
import { isLive } from "./work-items";

/** A session as the hub's database reads it. */
type SessionRow = ReturnType<DbShape["getInstancesByIds"]>[number];

export interface JevTasksDeps {
  readonly caw: Pick<Caw, "wake">;
  readonly db: Pick<
    DbShape,
    | "getInstancesByIds"
    | "getJevSettings"
    | "getOpenRouterConnection"
    | "projectAttempts"
    | "threadOfTask"
  >;
  readonly dispatcher: Pick<Dispatcher, "retryFor" | "startFor">;
  /**
   * Why your words may not reach the session's finished work item, or
   * nothing (work-items `refusal`: an archived workspace, a newer item there).
   */
  readonly refused: (row: SessionRow) => string | undefined;
  /** Your words to a session, as the composer sends them. */
  readonly sendYours: (row: SessionRow, text: string) => void;
  readonly tasks: Tasks;
  /** A session's prompt cache is warm now (the cold check's test), and it is not in a turn. */
  readonly warmth: (row: SessionRow) => { idle: boolean; warm: boolean };
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

export const createJevTasks = ({
  caw,
  db,
  dispatcher,
  refused,
  sendYours,
  tasks,
  warmth,
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
      await tasks.link(
        projectId,
        task.id,
        { edge: "duplicate_of", to: of },
        hubActor(why)
      );
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
          note: `Jev judged it a duplicate of ${found.id}, but it was not dropped: ${refusedWhy}`,
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
      ask: `Compare ${task.id} with these open tasks. If it repeats one, link it: task_link({ id: "${task.id}", edge: "duplicate_of", to: "<that task>" }), which drops it.`,
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
   * Triage with Jev off: the batch the lead's wake carries, the project's
   * open tasks in a `todo` stage with no `triage` yet; nothing while Jev is
   * on, or when every one has one.
   */
  const triageFor = async (projectId: string): Promise<string | undefined> => {
    if (key()) {
      return;
    }
    const { tasks: all } = await tasks.list(projectId);
    const untriaged = all.filter(
      (task) => task.kind === "todo" && !task.fields[TRIAGE_FIELD]
    );
    const batch = triageBatch(untriaged);
    if (batch) {
      offLine(
        "triage",
        projectId,
        `the lead's wake carries ${untriaged.length === 1 ? "1 untriaged task" : `${untriaged.length} untriaged tasks`}: ${untriaged.map((task) => task.id).join(", ")}`
      );
    }
    return batch;
  };

  /**
   * Whether your comment continues the session of a task's ended attempt
   * (attach), or a fresh attempt starts; `failed` when Jev did not answer,
   * which the task's comments then say, and nothing starts.
   */
  const attachOrFresh = async (
    projectId: string,
    task: TaskView,
    newest: ReturnType<DbShape["projectAttempts"]>[number],
    row: SessionRow,
    text: string
  ): Promise<boolean | "failed"> => {
    const { warm, idle } = warmth(row);
    const cache = warm ? "warm" : "cold";
    const jev = key();
    if (!jev) {
      // The newest attempt at the task is this task's: the same task.
      const attach = attachByRule({ warm, idle, sameTask: true });
      offLine(
        "attach",
        projectId,
        `${task.id}'s last attempt ${newest.id.slice(0, 8)} is ${cache} and ${idle ? "idle" : "busy"}: ${attach ? "its session continues" : "a fresh attempt starts"}`
      );
      return attach;
    }
    try {
      const judged = await jevAttach(jev, projectId, {
        cache,
        lastWork: newest.digest ?? newest.result ?? newest.error ?? "",
        message: text,
        session: row.title ?? row.derivedTitle ?? newest.title,
        task: `${task.id} ${task.title}`,
      });
      console.log(
        `[tasks] ${task.id} in ${projectId}: Jev says ${judged.attach ? "attach" : "fresh"} (${judged.noul.toFixed(2)}, cache ${cache})`
      );
      return judged.attach;
    } catch (error) {
      if (!(error instanceof JevFailed)) {
        throw error;
      }
      await tasks.comment(
        projectId,
        task.id,
        `${error.message} Nothing was started for your comment: continue its last attempt's session or start a new attempt yourself.`,
        hubActor("Attach or fresh")
      );
      return "failed";
    }
  };

  /**
   * Attach or fresh (§5.3) for your comment on a task: a live attempt reads
   * it; an ended one's session continues with it or a fresh attempt starts.
   * A task never attempted, or closed, starts nothing: the comment waits in
   * its file for the next brief.
   */
  const commented = async (
    projectId: string,
    id: string,
    text: string
  ): Promise<void> => {
    const [newest] = db
      .projectAttempts(projectId)
      .filter((item) => item.taskId === id);
    if (!newest) {
      return;
    }
    const [row] = db.getInstancesByIds([newest.instanceId]);
    const yours = `A comment on ${id}, your task:\n\n${text}`;
    if (isLive(newest.state)) {
      if (row) {
        sendYours(row, yours);
      }
      return;
    }
    const task = await tasks.get(projectId, id);
    if (task.kind === "done" || task.kind === "dropped") {
      return;
    }
    const attachTo = await continuing(projectId, task, newest, row, text);
    if (attachTo === "failed") {
      return;
    }
    if (attachTo) {
      sendYours(attachTo, yours);
      return;
    }
    const started = task.lastAttemptFailed
      ? await dispatcher.retryFor(projectId, id, undefined)
      : await dispatcher.startFor(projectId, id, undefined);
    console.log(
      `[tasks] ${id} in ${projectId}: a fresh attempt for your comment: ${started.text.split("\n")[0]}`
    );
  };

  /**
   * The ended attempt's session your comment continues, or undefined for a
   * fresh attempt: one that cannot take your words (gone, archived, a newer
   * item in its workspace) starts fresh by code; else Attach or fresh
   * decides. `failed` when Jev did not answer.
   */
  const continuing = async (
    projectId: string,
    task: TaskView,
    newest: ReturnType<DbShape["projectAttempts"]>[number],
    row: SessionRow | undefined,
    text: string
  ): Promise<SessionRow | undefined | "failed"> => {
    const blocked = row ? refused(row) : "its session is gone";
    if (blocked || !row) {
      offLine(
        "attach",
        projectId,
        `${task.id}'s last attempt ${newest.id.slice(0, 8)} cannot continue (${blocked}): a fresh attempt starts`
      );
      return;
    }
    const attach = await attachOrFresh(projectId, task, newest, row, text);
    if (attach === "failed") {
      return "failed";
    }
    return attach ? row : undefined;
  };

  /** What runs after a change to a project's tasks: Duplicates and Triage on filing, Attach or fresh on your comment. */
  const taskChanged = (event: TaskEvent): void => {
    if (event.kind === "created") {
      const bySession =
        event.actor.mover === "session" || event.actor.mover === "lead";
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
      return;
    }
    if (
      event.kind === "changed" &&
      event.id &&
      event.comment?.actor.mover === "you"
    ) {
      const { id, projectId } = event;
      const { text } = event.comment;
      detach(
        commented(projectId, id, text).catch((error: unknown) =>
          console.warn(
            `[tasks] your comment on ${id} in ${projectId} did not reach an attempt: ${words(error)}`
          )
        ),
        "task comment"
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

  /** Your sentence from the phone, to the lead as your words, noted in the task's thread. */
  const toLead = async (
    projectId: string,
    sentence: string,
    about: string | undefined
  ): Promise<void> => {
    await caw.wake(projectId, {
      by: "you",
      text: `From your phone${about ? `, about ${about}` : ""}:\n\n${sentence}`,
      threadId: about ? db.threadOfTask(projectId, about)?.id : undefined,
      note: { title: "Phone · your request", body: sentence },
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

  /** What the hub did for a phone request. */
  interface PhoneDone {
    action: PhoneAction | "lead";
    decidedBy: "jev" | "lead";
    stage?: string;
    task?: string;
    text: string;
  }

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
        YOU_ACTOR
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
   * you. Off: the lead reads the sentence, as your words.
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
        `the lead reads the sentence${task ? ` about ${task.id}` : ""}`
      );
      await toLead(projectId, sentence, task?.id);
      return { decidedBy: "lead", action: "lead", text: "Caw reads it." };
    }
    const decided = await phoneByJev(jev, projectId, sentence, task);
    return await PHONE_DOES[decided.action](
      projectId,
      sentence,
      decided.about,
      decided.stage
    );
  };

  return { filed, taskChanged, triageFor, phoneRequest };
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
