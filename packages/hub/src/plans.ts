/**
 * Every session's plan (Projects spec §5.2, "Every session's plan, in a
 * panel"; shapes in core plan.ts): its steps, its spec, and on a task attempt
 * the task's to-dos, the same for a plain session, a delegate and an attempt.
 *
 * Every session's steps are CawCo's list, on every harness: written whole
 * through `todo_write`'s session scope and stored here. Each harness's own
 * list and plan mode are denied to every session (core `OWN_LIST_DENIED`),
 * so there is no other list to read. The spec is CawCo's too.
 *
 * The person changes a plan too ({@link Plans.edit}): each change is applied
 * to the steps here and kept as a row in their words (`plan_changes`);
 * plan-changes.ts decides who hears it and when. A write of the session's
 * steps names every step's wait whole: a step it gives none waits on
 * nothing. An id the session gives no step is only its place, so nothing is
 * kept by id across its writes. A page the session asked the person on is
 * the plan's wait, not a step's ({@link Plans.waitOn}): it stands while the
 * page is unanswered and not deleted, whatever the steps become, shown on
 * the open step whose `waitsOn` names the page, else in the plan's `needs`.
 * The person's comments stay on the step of the same words, wherever it
 * stands, else on the plan as orphaned comments ({@link keepComments}).
 * A step's wait is a task's wait (wait-targets.ts): the hub's one
 * resolver settles it (task-waits.ts `settled`), and a settled wait is
 * dropped; and a write of the session's steps that would undo a change it
 * has not written over since is refused once, naming the change
 * ({@link Plans.write}).
 *
 * Live, a session's followers (stream.ts) hear the plan as AG-UI state
 * events: a `plan.snapshot` when they subscribe or ask, or when a change
 * replaces most of it; else a `plan.delta`, the RFC 6902 patch from the last
 * revision. One queue per session orders every read and send, so a snapshot
 * and the deltas after it never cross.
 */
import {
  artifactLink,
  awayNotesOf,
  type InstanceRow,
  type OrphanedComments,
  type PlanChange,
  type PlanComment,
  type PlanDelta,
  type PlanEdit,
  type PlanReceiver,
  type PlanSnapshot,
  type PlanStep,
  type PlanWaits,
  type SessionPlan,
  stepLink,
  stepNamesArtifact,
  waitArtifact,
  waitTarget,
} from "@cawco/core";
import { detach } from "@cawco/core/detach";
import { unhandled } from "@cawco/core/unhandled";
import { Elysia, t } from "elysia";
import { createPatch } from "rfc6902";
import type { DbShape, PlanChangeRow } from "./db";
import { FolderRefusal, refused } from "./project-folder";
import type { TaskEvent, Tasks } from "./tasks";

export interface PlansDeps {
  db: Pick<
    DbShape,
    | "artifacts"
    | "getInstancesByIds"
    | "planChangesOf"
    | "putAwaySeen"
    | "putPageWaits"
    | "putPlanChange"
    | "putSessionSpec"
    | "putSessionSteps"
    | "sessionPlan"
    | "settlePlanChanges"
    | "unsettledPlanChanges"
    | "workItem"
  >;
  /** Fans a plan frame out to the session's followers (stream.ts). */
  publish: (instanceId: string, message: PlanSnapshot | PlanDelta) => void;
  tasks: Pick<Tasks, "get" | "waitState">;
}

interface Held {
  plan: SessionPlan;
  rev: number;
}

/** How many of a plan's latest changes it carries, for the panel's acknowledgements. */
const CHANGES_SHOWN = 20;

/**
 * A step as the session writes it (`todo_write`): its `waitsOn` the whole of
 * what it waits on, none when left out. Comments are the person's: never
 * written.
 */
export type WrittenStep = Omit<PlanStep, "comments">;

/**
 * The person's comments through a write of the session's steps: each old
 * step's, and each orphaned one's, go to the first new step of the same
 * words, wherever it stands; those whose words no new step has are the
 * plan's orphaned comments. Never by id: an id the session gives no step is
 * its place (task-tools.ts `stepsOf`).
 */
const keepComments = (
  before: readonly PlanStep[],
  orphaned: readonly OrphanedComments[],
  written: readonly WrittenStep[]
): { orphaned: OrphanedComments[]; steps: PlanStep[] } => {
  const byWords = new Map<string, PlanComment[]>();
  for (const { step, comments } of [
    ...orphaned,
    ...before.map((one) => ({ step: one.content, comments: one.comments })),
  ]) {
    if (comments?.length) {
      byWords.set(step, [...(byWords.get(step) ?? []), ...comments]);
    }
  }
  const steps = written.map((step): PlanStep => {
    const comments = byWords.get(step.content);
    byWords.delete(step.content);
    return comments
      ? {
          ...step,
          comments: comments.toSorted((a, b) => a.at.localeCompare(b.at)),
        }
      : step;
  });
  return {
    steps,
    orphaned: [...byWords].map(([step, comments]) => ({ step, comments })),
  };
};

/** The receiver's key, as `plan_changes.receiver` holds it. */
export const receiverKey = (to: PlanReceiver): string =>
  to.kind === "session" ? `session:${to.instanceId}` : `caw:${to.projectId}`;

/** A receiver key's kind, and the id after its first colon. */
const KEY_PARTS = /:(.*)/su;

/** The receiver a key names. */
export const receiverOfKey = (key: string): PlanReceiver => {
  const [kind, id = ""] = key.split(KEY_PARTS);
  return kind === "caw"
    ? { kind: "caw", projectId: id }
    : { kind: "session", instanceId: id };
};

/** A change as the plan carries it. */
const changeOf = (row: PlanChangeRow): PlanChange => ({
  id: row.id,
  kind: row.kind,
  step: row.step,
  was: row.was,
  words: row.words,
  at: row.at.toISOString(),
  to: receiverOfKey(row.receiver),
  ...(row.toldAt ? { toldAt: row.toldAt.toISOString() } : {}),
  ...(row.undelivered ? { undelivered: row.undelivered } : {}),
});

/** A step and the sub-steps under it: its place and the place past its last sub-step. */
const blockOf = (steps: PlanStep[], at: number): [number, number] => {
  const depth = steps[at]?.depth ?? 0;
  let end = at + 1;
  while (end < steps.length && (steps[end]?.depth ?? 0) > depth) {
    end += 1;
  }
  return [at, end];
};

/**
 * Whether a session's write of `steps` would undo the person's change: a
 * reworded step back in other words, an added one gone, a removed one back,
 * a tick turned the other way. A comment or a move is never undone by it.
 */
const undoes = (steps: WrittenStep[], change: PlanChangeRow): boolean => {
  const step = steps.find((one) => one.id === change.step);
  switch (change.kind) {
    case "reword":
      return step !== undefined && step.content !== change.words;
    case "add":
      return step === undefined;
    case "remove":
      return step !== undefined;
    case "tick":
      return (
        step !== undefined &&
        (step.status === "completed") !== (change.words === "done")
      );
    // A write keeps each step's comments by id ({@link Plans.write}), so it
    // cannot take one back.
    case "comment":
      return false;
    // The order is the session's to keep: a move is bookkeeping (Projects
    // spec §5.2 "The plan model", point 3), and the write's order stands.
    case "move":
      return false;
    default:
      unhandled("plan change", change.kind);
  }
};

/** One change as a message says it: what the person did, in their words. */
export const changeLine = (
  change: Pick<PlanChangeRow, "kind" | "was" | "words">
): string => {
  switch (change.kind) {
    case "reword":
      return `Reworded “${change.was}” to: “${change.words}”`;
    case "add":
      return change.was
        ? `Added a step after “${change.was}”: “${change.words}”`
        : `Added a step: “${change.words}”`;
    case "remove":
      return `Removed “${change.was}”`;
    case "comment":
      return `Commented on “${change.was}”: “${change.words}”`;
    case "tick":
      return change.words === "done"
        ? `Ticked “${change.was}” done`
        : `Unticked “${change.was}”: not done`;
    case "move":
      return `Moved “${change.was}” ${change.words}`;
    default:
      return `Changed “${change.was}”`;
  }
};

/** Each status's box, as a message lists a step. */
const BOX: Record<PlanStep["status"], string> = {
  completed: "[x]",
  in_progress: "[~]",
  pending: "[ ]",
};

/** The page a step waits on, by its link (its name the label); a page gone, said so. */
const pageNamed = (db: Pick<DbShape, "artifacts">, id: string): string => {
  const page = db.artifacts.get(id);
  return page ? artifactLink(page.id, page.name) : "a page since removed";
};

/** What a step waits on, in a message's words: a card or pin by its page's link, any other target as kept. */
const waitWords = (db: Pick<DbShape, "artifacts">, handle: string): string => {
  const target = waitTarget(handle);
  switch (target?.kind) {
    case "card":
      return `the person's pick on ${pageNamed(db, target.artifactId)}`;
    case "pin":
      return `pin ${target.number} on ${pageNamed(db, target.artifactId)}`;
    case "session":
      return "a session's work";
    case "task":
    case "pr":
    case "run":
    case undefined:
      return handle;
  }
};

/**
 * A plan's steps as a message lists them: a box per status, nested by
 * indent, each by its link (session `session`'s, its words the label), a
 * wait by what it waits on.
 */
export const stepLines = (
  db: Pick<DbShape, "artifacts">,
  session: string,
  steps: PlanStep[]
): string =>
  steps.length === 0
    ? "(no steps)"
    : steps
        .map((step) => {
          const box = BOX[step.status];
          const wait = step.waitsOn
            ? ` (waiting on ${waitWords(db, step.waitsOn)})`
            : "";
          return `${"  ".repeat(step.depth)}- ${box} ${stepLink(session, step.id, step.content)}${wait}`;
        })
        .join("\n");

/** What one of the person's edits made of a plan's steps, and how its change reads. */
interface Applied {
  step: string;
  steps: PlanStep[];
  /** The step's words before it; for an add, the step it follows ("" at the top). */
  was: string;
  /** The person's words (core `PlanChange.words`). */
  words: string;
}

/** The place of step `id` in `steps`; refused when the plan has no such step. */
const placeOf = (steps: PlanStep[], id: string): number => {
  const index = steps.findIndex((step) => step.id === id);
  if (index < 0) {
    throw new FolderRefusal(
      404,
      `This plan has no step ${id}: it may have changed since you opened it.`
    );
  }
  return index;
};

/** The person's words, trimmed; refused when there are none. */
const wordsOf = (given: string, what: string): string => {
  const words = given.trim();
  if (!words) {
    throw new FolderRefusal(400, `${what} needs words.`);
  }
  return words;
};

const reword = (
  steps: PlanStep[],
  edit: Extract<PlanEdit, { kind: "reword" }>
): Applied => {
  const index = placeOf(steps, edit.step);
  const step = steps[index] as PlanStep;
  const words = wordsOf(edit.content, "A step");
  if (words === step.content) {
    throw new FolderRefusal(400, "The step reads the same as before.");
  }
  const next = [...steps];
  next[index] = { ...step, content: words };
  return { steps: next, step: step.id, was: step.content, words };
};

const add = (
  steps: PlanStep[],
  edit: Extract<PlanEdit, { kind: "add" }>
): Applied => {
  const words = wordsOf(edit.content, "A step");
  const id = `you-${crypto.randomUUID().slice(0, 8)}`;
  const next = [...steps];
  if (edit.after === undefined) {
    next.push({ id, content: words, status: "pending", depth: 0 });
    return { steps: next, step: id, was: steps.at(-1)?.content ?? "", words };
  }
  const index = placeOf(steps, edit.after);
  const after = steps[index] as PlanStep;
  const [, end] = blockOf(steps, index);
  next.splice(end, 0, {
    id,
    content: words,
    status: "pending",
    depth: after.depth,
  });
  return { steps: next, step: id, was: after.content, words };
};

const remove = (
  steps: PlanStep[],
  edit: Extract<PlanEdit, { kind: "remove" }>
): Applied => {
  const index = placeOf(steps, edit.step);
  const step = steps[index] as PlanStep;
  const [start, end] = blockOf(steps, index);
  const next = [...steps];
  next.splice(start, end - start);
  return { steps: next, step: step.id, was: step.content, words: "" };
};

const comment = (
  steps: PlanStep[],
  edit: Extract<PlanEdit, { kind: "comment" }>,
  at: Date
): Applied => {
  const index = placeOf(steps, edit.step);
  const step = steps[index] as PlanStep;
  const words = wordsOf(edit.text, "A comment");
  const next = [...steps];
  next[index] = {
    ...step,
    comments: [...(step.comments ?? []), { at: at.toISOString(), text: words }],
  };
  return { steps: next, step: step.id, was: step.content, words };
};

const tick = (
  steps: PlanStep[],
  edit: Extract<PlanEdit, { kind: "tick" }>
): Applied => {
  const index = placeOf(steps, edit.step);
  const step = steps[index] as PlanStep;
  if ((step.status === "completed") === edit.done) {
    throw new FolderRefusal(
      409,
      `“${step.content}” is ${edit.done ? "done" : "not done"} already.`
    );
  }
  const next = [...steps];
  next[index] = { ...step, status: edit.done ? "completed" : "pending" };
  return {
    steps: next,
    step: step.id,
    was: step.content,
    words: edit.done ? "done" : "not done",
  };
};

/** Where the step at `start` (depth `depth`) goes one place up: the start of the sibling before it. */
const siblingBefore = (
  steps: PlanStep[],
  start: number,
  depth: number
): number | undefined => {
  let before = start - 1;
  while (before >= 0 && (steps[before]?.depth ?? 0) > depth) {
    before -= 1;
  }
  return before >= 0 && (steps[before]?.depth ?? 0) === depth
    ? before
    : undefined;
};

const move = (
  steps: PlanStep[],
  edit: Extract<PlanEdit, { kind: "move" }>
): Applied => {
  const index = placeOf(steps, edit.step);
  const step = steps[index] as PlanStep;
  const [start, end] = blockOf(steps, index);
  const block = steps.slice(start, end);
  const next = [...steps];
  if (edit.by === -1) {
    const before = siblingBefore(steps, start, step.depth);
    if (before === undefined) {
      throw new FolderRefusal(
        409,
        `“${step.content}” is the first step at its level.`
      );
    }
    next.splice(start, block.length);
    next.splice(before, 0, ...block);
  } else {
    if (end >= steps.length || (steps[end]?.depth ?? 0) !== step.depth) {
      throw new FolderRefusal(
        409,
        `“${step.content}” is the last step at its level.`
      );
    }
    const [, nextEnd] = blockOf(steps, end);
    next.splice(start, nextEnd - start, ...steps.slice(end, nextEnd), ...block);
  }
  return {
    steps: next,
    step: step.id,
    was: step.content,
    words: edit.by === -1 ? "up" : "down",
  };
};

/** The person's edit applied to a plan's steps; refused, in words, when it names no step or changes nothing. */
const applyEdit = (steps: PlanStep[], edit: PlanEdit, at: Date): Applied => {
  switch (edit.kind) {
    case "reword":
      return reword(steps, edit);
    case "add":
      return add(steps, edit);
    case "remove":
      return remove(steps, edit);
    case "comment":
      return comment(steps, edit, at);
    case "tick":
      return tick(steps, edit);
    case "move":
      return move(steps, edit);
    default:
      unhandled("edit", edit);
  }
};

export const createPlans = (deps: PlansDeps) => {
  const { db } = deps;
  /** The plan each session's followers last heard, by instance. */
  const held = new Map<string, Held>();
  /** Each session's queue: every read and send for it runs in turn. */
  const queues = new Map<string, Promise<unknown>>();

  const inTurn = <T>(
    instanceId: string,
    work: () => Promise<T>
  ): Promise<T> => {
    const next = (queues.get(instanceId) ?? Promise.resolve()).then(work, work);
    const tail = next.catch(() => undefined);
    queues.set(instanceId, tail);
    detach(
      tail.then(() => {
        if (queues.get(instanceId) === tail) {
          queues.delete(instanceId);
        }
      }),
      "plan queue cleanup"
    );
    return next;
  };

  const rowOf = (instanceId: string): InstanceRow => {
    const [row] = db.getInstancesByIds([instanceId]);
    if (!row) {
      throw new FolderRefusal(404, "No session with that id on this hub.");
    }
    return row;
  };

  /** The plan as it stands now: the session's own steps and spec, and an attempt's to-dos. */
  const compute = async (row: InstanceRow): Promise<SessionPlan> => {
    const own = db.sessionPlan(row.id);
    const item = row.workItemId ? db.workItem(row.workItemId) : undefined;
    const attempt =
      item?.taskId && item.projectId
        ? {
            taskId: item.taskId,
            todos: (await deps.tasks.get(item.projectId, item.taskId)).todos,
          }
        : {};
    const changes = db.planChangesOf(row.id, CHANGES_SHOWN).map(changeOf);
    const away = awayNotesOf(own?.spec ?? undefined);
    const steps = own?.steps ?? [];
    const needs = (own?.pageWaits ?? []).filter(
      (page) => !steps.some((step) => stepNamesArtifact(step, page))
    );
    return {
      ...(away && away.notes !== own?.awaySeen
        ? { awayUnseen: { since: away.since } }
        : {}),
      source: "cawco",
      steps,
      ...(needs.length > 0 ? { needs } : {}),
      ...(own?.orphanedComments.length
        ? { orphanedComments: own.orphanedComments }
        : {}),
      ...(changes.length > 0 ? { changes } : {}),
      ...(own?.spec && own.specAt
        ? { spec: { markdown: own.spec, at: own.specAt.toISOString() } }
        : {}),
      ...attempt,
    };
  };

  const snapshotOf = (
    instanceId: string,
    { plan, rev }: Held
  ): PlanSnapshot => ({
    type: "plan.snapshot",
    instanceId,
    rev,
    ...plan,
  });

  /**
   * Reads the plan and tells the followers what changed: nothing, a delta
   * from the last revision, or a snapshot when the change is most of it.
   */
  /**
   * A step's wait the resolver settles now is dropped from it (task-waits.ts
   * `settled`, read in the session's project): what stopped a step waiting
   * on a card once its page's Send carried a pick, for every kind of wait.
   */
  const dropSettled = async (row: InstanceRow): Promise<void> => {
    const own = db.sessionPlan(row.id);
    const waits = [
      ...new Set(own?.steps.flatMap((step) => step.waitsOn ?? []) ?? []),
    ];
    if (!own || waits.length === 0) {
      return;
    }
    const settled = new Set<string>();
    for (const handle of waits) {
      if ((await deps.tasks.waitState(row.projectId ?? null, handle)).settled) {
        settled.add(handle);
      }
    }
    if (settled.size > 0) {
      db.putSessionSteps(
        row.id,
        own.steps.map(({ waitsOn, ...step }) =>
          waitsOn && !settled.has(waitsOn) ? { ...step, waitsOn } : step
        )
      );
    }
  };

  /** A page the plan waits on that is deleted waits on no one: it goes. */
  const dropGonePages = (instanceId: string): void => {
    const pageWaits = db.sessionPlan(instanceId)?.pageWaits ?? [];
    const standing = pageWaits.filter((page) => db.artifacts.get(page));
    if (standing.length < pageWaits.length) {
      db.putPageWaits(instanceId, standing);
    }
  };

  const settle = (instanceId: string): Promise<Held> =>
    inTurn(instanceId, async () => {
      const row = rowOf(instanceId);
      await dropSettled(row);
      dropGonePages(instanceId);
      const plan = await compute(row);
      const before = held.get(instanceId);
      if (!before) {
        const first = { plan, rev: 1 };
        held.set(instanceId, first);
        deps.publish(instanceId, snapshotOf(instanceId, first));
        return first;
      }
      const patch = createPatch(before.plan, plan);
      if (patch.length === 0) {
        return before;
      }
      const after = { plan, rev: before.rev + 1 };
      held.set(instanceId, after);
      deps.publish(
        instanceId,
        JSON.stringify(patch).length < JSON.stringify(plan).length
          ? { type: "plan.delta", instanceId, rev: after.rev, patch }
          : snapshotOf(instanceId, after)
      );
      return after;
    });

  /** The session's plan stops waiting on page `artifactId` whole; its followers hear it. */
  const dropPageWait = (instanceId: string, artifactId: string): void => {
    const pageWaits = db.sessionPlan(instanceId)?.pageWaits ?? [];
    if (!pageWaits.includes(artifactId)) {
      return;
    }
    db.putPageWaits(
      instanceId,
      pageWaits.filter((page) => page !== artifactId)
    );
    settleQuietly(instanceId);
  };

  const settleQuietly = (instanceId: string): void => {
    settle(instanceId).catch((error: unknown) =>
      console.warn(
        `[plans] ${instanceId}: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  };

  return {
    /** What `GET /api/instances/:id/plan` answers: read now, and the followers told of any change. */
    async read(instanceId: string): Promise<SessionPlan> {
      return (await settle(instanceId)).plan;
    },

    /**
     * A follower subscribed, or found a gap: the plan whole, to it alone,
     * in turn with every delta so none lands before it.
     */
    snapshotTo(
      instanceId: string,
      send: (message: PlanSnapshot) => void
    ): void {
      inTurn(instanceId, async () => {
        const known = held.get(instanceId);
        if (known) {
          send(snapshotOf(instanceId, known));
          return;
        }
        const first = { plan: await compute(rowOf(instanceId)), rev: 1 };
        held.set(instanceId, first);
        send(snapshotOf(instanceId, first));
      }).catch((error: unknown) =>
        console.warn(
          `[plans] ${instanceId}: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    },

    /**
     * `todo_write`'s session scope: the session's steps, its spec, or both,
     * each replaced whole, every step's `waitsOn` with them: exactly what the
     * write names. The person's comments stay on the step of the same words,
     * else on the plan ({@link keepComments}); its page waits are the plan's
     * and stand as they were. A write of steps
     * that would undo a change the person made since the session last wrote
     * them is refused, naming each and the plan as it stands; the next write
     * goes through, whatever it says: the session has heard them.
     */
    async write(
      row: InstanceRow,
      written: { steps?: WrittenStep[]; spec?: string }
    ): Promise<SessionPlan> {
      const { steps } = written;
      if (steps) {
        const before = db.sessionPlan(row.id)?.steps ?? [];
        const undone = db
          .unsettledPlanChanges(row.id)
          .filter((change) => undoes(steps, change));
        db.settlePlanChanges(row.id);
        if (undone.length > 0) {
          throw new Error(
            `Not written: the person changed your plan since you last wrote it, and these steps would undo it:\n${undone.map((change) => `- ${changeLine(change)}`).join("\n")}\n\nYour plan as it stands now:\n${stepLines(db, row.id, before)}\n\nWrite your steps again from it: the next write goes through as you give it.`
          );
        }
        const kept = keepComments(
          before,
          db.sessionPlan(row.id)?.orphanedComments ?? [],
          steps
        );
        db.putSessionSteps(row.id, kept.steps, kept.orphaned);
      }
      if (written.spec !== undefined) {
        db.putSessionSpec(row.id, written.spec);
      }
      return (await settle(row.id)).plan;
    },

    /**
     * The person's change to a session's plan, applied to its steps and kept
     * in their words, for `to`; `settled` when the plan's own session never
     * hears it. Refused, in words, when it names no step of the plan or
     * changes nothing.
     */
    async edit(
      row: InstanceRow,
      edit: PlanEdit,
      to: PlanReceiver,
      settled: boolean
    ): Promise<PlanChangeRow> {
      const at = new Date();
      const { steps, step, was, words } = applyEdit(
        db.sessionPlan(row.id)?.steps ?? [],
        edit,
        at
      );
      const change: PlanChangeRow = {
        id: crypto.randomUUID(),
        instanceId: row.id,
        receiver: receiverKey(to),
        kind: edit.kind,
        step,
        was,
        words,
        at,
        toldAt: null,
        sentUuid: null,
        settled,
        undelivered: null,
      };
      db.putSessionSteps(row.id, steps);
      db.putPlanChange(change);
      await settle(row.id);
      return change;
    },

    /** A wait of the session's steps may have settled (a page's picks moved): the plan is read again, settled waits dropped. */
    waitsMoved(instanceId: string): void {
      settleQuietly(instanceId);
    },

    /** Page `artifactId`'s picks or pins moved: each followed plan with a step waiting on a card or pin of it is read again. */
    pageMoved(artifactId: string): void {
      for (const [instanceId, { plan }] of held) {
        if (
          plan.steps.some(
            (step) =>
              step.waitsOn !== undefined &&
              waitArtifact(step.waitsOn) === artifactId
          )
        ) {
          settleQuietly(instanceId);
        }
      }
    },

    /**
     * Artifact `artifactId` waits on the person (its maker's `artifact_create`
     * or `artifact_update` with `does: pick` or `judge` returned): while the
     * session is at work on its plan (an open step names the page, or one is
     * in progress), the plan waits on the page whole, until the page is
     * answered or deleted ({@link clearArtifactWait}), whatever its steps are
     * rewritten to. Answers the step it was asked at: the one naming it, else
     * the first in progress; null when there is none and the plan waits on
     * nothing.
     */
    waitOn(instanceId: string, artifactId: string): string | null {
      const own = db.sessionPlan(instanceId);
      const steps = own?.steps ?? [];
      const at =
        steps.find((step) => stepNamesArtifact(step, artifactId)) ??
        steps.find((step) => step.status === "in_progress");
      if (!at) {
        return null;
      }
      const pageWaits = own?.pageWaits ?? [];
      if (!pageWaits.includes(artifactId)) {
        db.putPageWaits(instanceId, [...pageWaits, artifactId]);
        settleQuietly(instanceId);
      }
      return at.id;
    },

    /** Nothing on artifact `artifactId` waits on the person now: the session's plan waits on it whole no more. */
    clearArtifactWait(instanceId: string, artifactId: string): void {
      dropPageWait(instanceId, artifactId);
    },

    /** The session's page waits and steps as they stand: what its artifacts' waits are read against. */
    waits(instanceId: string): PlanWaits {
      const own = db.sessionPlan(instanceId);
      return { pageWaits: own?.pageWaits ?? [], steps: own?.steps ?? [] };
    },

    /**
     * A session's steps start another's plan: the new session that goes on
     * from an ended one. Its page waits stay the ended session's: each page
     * was asked by it (needs.ts `ArtifactAsked.by`).
     */
    copySteps(from: string, to: string): void {
      const steps = db.sessionPlan(from)?.steps;
      if (steps?.length) {
        db.putSessionSteps(to, steps);
      }
    },

    /**
     * The person saw the session's away notes as they stand: opened its plan
     * (`POST /api/instances/:id/plan/seen`), or had them recapped (server.ts
     * `recapFor`). Answers whether they were unseen till now; the plan's
     * followers hear `awayUnseen` go.
     */
    async seeAway(instanceId: string): Promise<boolean> {
      const own = db.sessionPlan(instanceId);
      const away = awayNotesOf(own?.spec ?? undefined);
      if (!away || away.notes === own?.awaySeen) {
        return false;
      }
      db.putAwaySeen(instanceId, away.notes);
      await settle(instanceId);
      return true;
    },

    /** The plan's followers hear its changes' new state (told, or reaching no one). */
    changed(instanceId: string): void {
      settleQuietly(instanceId);
    },

    /** A project's tasks changed: an attempt's to-dos may have ticked. */
    taskChanged(event: TaskEvent): void {
      for (const [instanceId, { plan }] of held) {
        if (!plan.taskId) {
          continue;
        }
        const [row] = db.getInstancesByIds([instanceId]);
        const item = row?.workItemId ? db.workItem(row.workItemId) : undefined;
        const task = event.id;
        if (
          item?.projectId === event.projectId &&
          (task === undefined || task === item.taskId)
        ) {
          settleQuietly(instanceId);
        }
      }
    },
  };
};

export type Plans = ReturnType<typeof createPlans>;

/**
 * `GET /api/instances/:id/plan`: the session's plan, as its followers hold
 * it. `POST /api/instances/:id/plan/seen`: the person opened it, so its away
 * notes are seen (`awayUnseen` goes); the owner's alone, as every route no
 * hub-auth list names.
 */
export const planRoutes = (plans: Plans) =>
  new Elysia()
    .get(
      "/api/instances/:id/plan",
      { params: t.Object({ id: t.String() }) },
      async ({ params }) => {
        try {
          return await plans.read(params.id);
        } catch (error) {
          return refused(error);
        }
      }
    )
    .post(
      "/api/instances/:id/plan/seen",
      { params: t.Object({ id: t.String() }) },
      async ({ params }) => {
        try {
          return { seen: await plans.seeAway(params.id) };
        } catch (error) {
          return refused(error);
        }
      }
    );
