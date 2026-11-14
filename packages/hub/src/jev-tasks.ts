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
 * - **Attach or fresh** (yes/no), as you comment on a task whose newest
 *   attempt has ended (§5.3, Attach or spawn), one of three: its session
 *   takes your words (attach, its cache warm); its history is compressed
 *   and continued in a new session in the attempt's own workspace, which
 *   opens on your words (continue, its cache cold: waking it would re-read
 *   its whole transcript at full price); or a fresh attempt starts, briefed
 *   with the task, the last failure and the comments since (dispatch.ts).
 *   Jev on: Jev says whether that session's history matters, and its cache
 *   decides attach or continue. Off, with no caller: idle and on the same
 *   task stands in for "its history matters", so attach when warm, continue
 *   when cold, else fresh. A live attempt simply reads your comment. The
 *   project's `attemptsHearComments` switch off, your comment reaches no
 *   attempt.
 * - **Phone requests** (choice + fill): a sentence from the phone about the
 *   project. Jev on: Jev picks the action and fills it (the task, the
 *   stage). Off: the project's conversation reads the sentence. The push's own buttons are
 *   not this and always work.
 */

import { detach } from "@cawco/core/detach";
import { taskLink } from "@cawco/core/references";
import { Elysia, ElysiaStatus, problem, t } from "elysia";
import type { Caw, PersonsSend } from "./caw";
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
} from "./jev-placement";
import { grepScore, wordsOf } from "./memory-facts";

import {
  hubActor,
  type TaskEvent,
  type Tasks,
  type TaskView,
  YOU_ACTOR,
  YOU_WRITING,
} from "./tasks";
import { isLive } from "./work-item-state";

/** A session as the hub's database reads it. */
type SessionRow = ReturnType<DbShape["getInstancesByIds"]>[number];

export interface JevTasksDeps {
  readonly caw: Pick<Caw, "tell">;
  /**
   * An ended attempt's cold session compressed and continued in a new
   * session in its workspace, which takes on the attempt and opens on
   * `comment` (server.ts `continueAttempt`): the new session's id, and how
   * the job ends (nothing once it started, else why not). Throws why it
   * could not begin.
   */
  readonly continueAttempt: (
    row: SessionRow,
    taskId: string,
    comment: string
  ) => Promise<{
    ended: Promise<string | undefined>;
    targetInstanceId: string;
  }>;
  readonly db: Pick<
    DbShape,
    | "getInstancesByIds"
    | "getJevSettings"
    | "getOpenRouterConnection"
    | "project"
    | "projectAttempts"
  >;
  readonly dispatcher: Pick<Dispatcher, "retryFor" | "startFor">;
  /**
   * Why your words may not reach the session's finished work item, or
   * nothing (work-items `refusal`: an archived workspace, a newer item there).
   */
  readonly refused: (row: SessionRow) => string | undefined;
  /** Your words to a session, theirs alone with CawCo's note beside them (server.ts `sendYours`). */
  readonly sendYours: (row: SessionRow, said: PersonsSend) => void;
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

/** What the Jev-off rule's log line says each answer does. */
const OFF_PLACED = {
  attach: "its session continues",
  continue: "it continues compressed",
  fresh: "a fresh attempt starts",
} as const;

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
  continueAttempt,
  db,
  dispatcher,
  refused,
  sendYours,
  tasks,
  warmth,
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

  /**
   * Attach or fresh with Jev on: Jev says whether the session's history
   * matters; when it does, a warm session takes your words as it is and a
   * cold one is compressed and continued, never woken whole.
   */
  const placedByJev = async (
    jev: JevAccess,
    projectId: string,
    task: TaskView,
    newest: ReturnType<DbShape["projectAttempts"]>[number],
    row: SessionRow,
    text: string
  ): Promise<"attach" | "continue" | "fresh"> => {
    const { warm } = warmth(row);
    const cache = warm ? "warm" : "cold";
    const judged = await jevAttach(jev, projectId, {
      cache,
      lastWork: newest.digest ?? newest.result ?? newest.error ?? "",
      message: text,
      session: row.title ?? row.derivedTitle ?? newest.title,
      task: `${task.id} ${task.title}`,
    });
    let placed: "attach" | "continue" | "fresh" = "fresh";
    if (judged.attach) {
      placed = warm ? "attach" : "continue";
    }
    console.log(
      `[tasks] ${task.id} in ${projectId}: Jev says ${judged.attach ? "attach" : "fresh"} (${judged.noul.toFixed(2)}, cache ${cache})${placed === "continue" ? ": it continues compressed" : ""}`
    );
    return placed;
  };

  /**
   * What your comment on a task's ended attempt does: its session takes it
   * (`attach`, warm), its history goes on compressed in a new session in
   * the attempt's workspace (`continue`, cold), or a fresh attempt starts;
   * `failed` when Jev did not answer, which the task's comments then say,
   * and nothing starts.
   */
  const attachOrFresh = async (
    projectId: string,
    task: TaskView,
    newest: ReturnType<DbShape["projectAttempts"]>[number],
    row: SessionRow,
    text: string
  ) => {
    const { warm, idle } = warmth(row);
    const cache = warm ? "warm" : "cold";
    const jev = key();
    if (!jev) {
      // The newest attempt at the task is this task's: the same task.
      const placed = attachByRule({ warm, idle, sameTask: true });
      offLine(
        "attach",
        projectId,
        `${task.id}'s last attempt ${newest.id.slice(0, 8)} is ${cache} and ${idle ? "idle" : "busy"}: ${OFF_PLACED[placed]}`
      );
      return placed;
    }
    try {
      return await placedByJev(jev, projectId, task, newest, row, text);
    } catch (error) {
      if (!(error instanceof JevFailed)) {
        throw error;
      }
      const said = await tasks.comment(
        projectId,
        task.id,
        `${error.message} Nothing was started for your comment: continue its last attempt's session or start a new attempt yourself.`,
        hubActor("Attach or fresh")
      );
      return said instanceof ElysiaStatus ? said : "failed";
    }
  };

  /**
   * An ended attempt's cold session compressed and continued for your
   * comment ({@link JevTasksDeps.continueAttempt}). What stops it, before it
   * begins or after, is said in the task's comments, and nothing else
   * starts for your comment.
   */
  const continueCompressed = async (
    projectId: string,
    task: TaskView,
    newest: ReturnType<DbShape["projectAttempts"]>[number],
    row: SessionRow,
    yours: string
  ) => {
    const notStarted = async (why: string) => {
      console.warn(
        `[tasks] ${task.id} in ${projectId}: its last attempt ${newest.id.slice(0, 8)} did not continue compressed: ${why}`
      );
      const said = await tasks.comment(
        projectId,
        task.id,
        `Its last attempt's session could not go on compressed: ${why} Nothing was started for your comment: continue its last attempt's session or start a new attempt yourself.`,
        hubActor("Attach or fresh")
      );
      return said instanceof ElysiaStatus ? said : undefined;
    };
    let started: Awaited<ReturnType<typeof continueAttempt>>;
    try {
      started = await continueAttempt(row, task.id, yours);
    } catch (error) {
      return await notStarted(words(error));
    }
    console.log(
      `[tasks] ${task.id} in ${projectId}: it continues compressed: ${row.id.slice(0, 8)}'s history goes on in new session ${started.targetInstanceId.slice(0, 8)} in its workspace, opening on your comment`
    );
    const stopped = await started.ended;
    if (stopped) {
      return await notStarted(stopped);
    }
  };

  /**
   * Attach or fresh (§5.3) for your comment on a task: a live attempt reads
   * it; an ended one's session takes it, goes on compressed with it, or a
   * fresh attempt starts. A task never attempted, or closed, starts
   * nothing: the comment waits in its file for the next brief.
   */
  const commented = async (projectId: string, id: string, text: string) => {
    const [newest] = db
      .projectAttempts(projectId)
      .filter((item) => item.taskId === id);
    if (!newest) {
      return;
    }
    const [row] = db.getInstancesByIds([newest.instanceId]);
    if (isLive(newest.state)) {
      if (row) {
        sendYours(row, commentSend(id, text));
      }
      return;
    }
    return await toEnded(projectId, id, newest, row, text);
  };

  /** Your comment on task `id`, as your words to its attempt's session. */
  const commentSend = (id: string, text: string): PersonsSend => ({
    by: "you",
    words: text,
    note: `It is a comment on ${id}, your task.`,
  });

  /** {@link commented} for a task whose newest attempt has ended: its session takes it, goes on compressed with it, or a fresh attempt starts. */
  const toEnded = async (
    projectId: string,
    id: string,
    newest: ReturnType<DbShape["projectAttempts"]>[number],
    row: SessionRow | undefined,
    text: string
  ) => {
    const task = await tasks.get(projectId, id);
    if (task instanceof ElysiaStatus) {
      return task;
    }
    if (task.kind === "done" || task.kind === "dropped") {
      return;
    }
    const placed = await continuing(projectId, task, newest, row, text);
    if (placed === "failed" || placed instanceof ElysiaStatus) {
      return placed === "failed" ? undefined : placed;
    }
    if (placed?.to === "attach") {
      sendYours(placed.row, commentSend(id, text));
      return;
    }
    if (placed?.to === "continue") {
      return await continueCompressed(
        projectId,
        task,
        newest,
        placed.row,
        `A comment on ${id}, your task:\n\n${text}`
      );
    }
    return await freshFor(projectId, task);
  };

  /** A fresh attempt for your comment: a retry when the last one failed or was stopped, else a start. */
  const freshFor = async (projectId: string, task: TaskView) => {
    const started =
      task.lastAttemptFailed || task.lastAttemptStopped
        ? await dispatcher.retryFor(projectId, task.id, undefined)
        : await dispatcher.startFor(projectId, task.id, undefined);
    if (started instanceof ElysiaStatus) {
      return started;
    }
    console.log(
      `[tasks] ${task.id} in ${projectId}: a fresh attempt for your comment: ${started.text.split("\n")[0]}`
    );
  };

  /**
   * The ended attempt's session your comment goes to as it is (`attach`) or
   * compressed (`continue`), or undefined for a fresh attempt: one that
   * cannot take your words (gone, archived, a newer item in its workspace)
   * starts fresh by code; else Attach or fresh decides. `failed` when Jev
   * did not answer.
   */
  const continuing = async (
    projectId: string,
    task: TaskView,
    newest: ReturnType<DbShape["projectAttempts"]>[number],
    row: SessionRow | undefined,
    text: string
  ) => {
    const blocked = row ? refused(row) : "its session is gone";
    if (blocked || !row) {
      offLine(
        "attach",
        projectId,
        `${task.id}'s last attempt ${newest.id.slice(0, 8)} cannot continue (${blocked}): a fresh attempt starts`
      );
      return;
    }
    const placed = await attachOrFresh(projectId, task, newest, row, text);
    if (placed === "failed" || placed instanceof ElysiaStatus) {
      return placed;
    }
    if (placed === "fresh") {
      return;
    }
    const to: { row: SessionRow; to: "attach" | "continue" } = {
      to: placed,
      row,
    };
    return to;
  };

  /**
   * What runs after a change to a project's tasks: Duplicates and Triage on
   * filing, Attach or fresh on your comment while the project's
   * `attemptsHearComments` switch is on.
   */
  const taskChanged = (event: TaskEvent): void => {
    if (event.kind === "created") {
      const bySession = event.actor.mover === "session";
      const work = async () => {
        // A session's filing is compared in task_create, where it reads the answer.
        if (!bySession) {
          const task = await tasks.get(event.projectId, event.id);
          if (task instanceof ElysiaStatus) {
            return task;
          }
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
      return;
    }
    if (
      event.kind === "changed" &&
      event.id &&
      event.comment?.actor.mover === "you" &&
      db.project(event.projectId)?.attemptsHearComments
    ) {
      const { id, projectId } = event;
      const { text } = event.comment;
      const unreached = (why: string) =>
        console.warn(
          `[tasks] your comment on ${id} in ${projectId} did not reach an attempt: ${why}`
        );
      detach(
        commented(projectId, id, text).then(
          (answer) => {
            if (answer) {
              unreached(answer.response.detail);
            }
          },
          (error: unknown) => unreached(words(error))
        ),
        "task comment"
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
