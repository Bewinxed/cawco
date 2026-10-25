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
 * plan-changes.ts decides who hears it and when. A step keeps the person's
 * comments and its decision-page wait across the session's own writes, by
 * id; and a write of the session's steps that would undo a change it has
 * not written over since is refused once, naming the change
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
  type PlanChange,
  type PlanDelta,
  type PlanEdit,
  type PlanReceiver,
  type PlanSnapshot,
  type PlanStep,
  type PlanWait,
  type SessionPlan,
  stepLink,
} from "@cawco/core";
import { detach } from "@cawco/core/detach";
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
  tasks: Pick<Tasks, "get">;
}

interface Held {
  plan: SessionPlan;
  rev: number;
}

/** How many of a plan's latest changes it carries, for the panel's acknowledgements. */
const CHANGES_SHOWN = 20;

/**
 * A step as the session writes it (`todo_write`): its `waitsOn` set, kept
 * when left out, cleared with null. Comments are the person's: never written.
 */
export type WrittenStep = Omit<PlanStep, "comments" | "waitsOn"> & {
  waitsOn?: PlanWait | null;
};

/** The receiver's key, as `plan_changes.receiver` holds it. */
export const receiverKey = (to: PlanReceiver): string =>
  to.kind === "session" ? `session:${to.instanceId}` : `caw:${to.projectId}`;

/** A receiver key's kind, and the id after its first colon. */
const KEY_PARTS = /:(.*)/s;

/** The receiver a key names. */
export const receiverOfKey = (key: string): PlanReceiver => {
  const [kind, id = ""] = key.split(KEY_PARTS);
  return kind === "caw"
    ? { kind: "caw", projectId: id }
    : { kind: "session", instanceId: id };
};

/** A change as the plan carries it. */
export const changeOf = (row: PlanChangeRow): PlanChange => ({
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
    default: {
      const unhandled: never = change.kind;
      throw new Error(`unhandled plan change: ${String(unhandled)}`);
    }
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

/**
 * A plan's steps as a message lists them: a box per status, nested by
 * indent, each by its link (session `session`'s, its words the label), a
 * wait by its page's link.
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
          let wait = "";
          if (step.waitsOn?.card) {
            wait = ` (waiting on the person's pick on ${pageNamed(db, step.waitsOn.artifactId)})`;
          } else if (step.waitsOn) {
            wait = ` (waiting on the person on ${pageNamed(db, step.waitsOn.artifactId)})`;
          }
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
    default: {
      const unhandled: never = edit;
      throw new Error(`unhandled edit: ${JSON.stringify(unhandled)}`);
    }
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
    return {
      ...(away && away.notes !== own?.awaySeen
        ? { awayUnseen: { since: away.since } }
        : {}),
      source: "cawco",
      steps: own?.steps ?? [],
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
  const settle = (instanceId: string): Promise<Held> =>
    inTurn(instanceId, async () => {
      const plan = await compute(rowOf(instanceId));
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

  /** Each step of the session's plan whose wait `drops` names stops waiting; its followers hear it. */
  const dropWaits = (
    instanceId: string,
    drops: (wait: PlanWait) => boolean
  ): void => {
    const own = db.sessionPlan(instanceId);
    if (!own?.steps.some((step) => step.waitsOn && drops(step.waitsOn))) {
      return;
    }
    db.putSessionSteps(
      instanceId,
      own.steps.map(({ waitsOn, ...step }) =>
        waitsOn && drops(waitsOn)
          ? step
          : { ...step, ...(waitsOn ? { waitsOn } : {}) }
      )
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
     * each replaced whole. Each step keeps the person's comments, and its
     * wait unless the write names one or clears it, by id. A write of steps
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
        db.putSessionSteps(
          row.id,
          steps.map(({ waitsOn, ...step }) => {
            const kept = before.find((one) => one.id === step.id);
            const wait = waitsOn === undefined ? kept?.waitsOn : waitsOn;
            return {
              ...step,
              ...(kept?.comments ? { comments: kept.comments } : {}),
              ...(wait ? { waitsOn: wait } : {}),
            };
          })
        );
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

    /**
     * The page's Send carried picks for these cards: each step of the
     * session's plan waiting on one of them stops waiting.
     */
    clearWaits(
      instanceId: string,
      artifactId: string,
      picked: ReadonlySet<string>
    ): void {
      dropWaits(
        instanceId,
        (wait) =>
          wait.artifactId === artifactId &&
          wait.card !== undefined &&
          picked.has(wait.card)
      );
    },

    /**
     * Artifact `artifactId` waits on the person (its maker's `artifact_create`
     * or `artifact_update` with `does: pick` or `judge` returned): the
     * session's current step, its first in progress, waits on it, unless it
     * waits on something already. Answers the step that waits on it now, or
     * null when no step does (the session has no step in progress).
     */
    waitOn(instanceId: string, artifactId: string): string | null {
      const steps = db.sessionPlan(instanceId)?.steps ?? [];
      const waiting = steps.find(
        (step) =>
          step.status !== "completed" && step.waitsOn?.artifactId === artifactId
      );
      if (waiting) {
        return waiting.id;
      }
      const current = steps.find((step) => step.status === "in_progress");
      if (!current || current.waitsOn) {
        return null;
      }
      db.putSessionSteps(
        instanceId,
        steps.map((step) =>
          step.id === current.id ? { ...step, waitsOn: { artifactId } } : step
        )
      );
      settleQuietly(instanceId);
      return current.id;
    },

    /** Nothing on artifact `artifactId` waits on the person now: no step of the session waits on it whole. */
    clearArtifactWait(instanceId: string, artifactId: string): void {
      dropWaits(
        instanceId,
        (wait) => wait.artifactId === artifactId && wait.card === undefined
      );
    },

    /** The session's steps as they stand: what its artifacts' waits are read against. */
    steps(instanceId: string): PlanStep[] {
      return db.sessionPlan(instanceId)?.steps ?? [];
    },

    /** A session's steps start another's plan: the new session that goes on from an ended one. */
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
