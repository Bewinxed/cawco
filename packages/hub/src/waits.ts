/**
 * Stage hooks that hold a task (§5.2, stages.ts): `until: <field>` holds it
 * until what its file's field names settles, `after: <n>m|h|d|w` holds it
 * that long from when it entered the stage; then a routine moves it on.
 * This is that routine, `waits`. It also tells a project when a date its
 * tasks or plans wait on passes, since nothing else moves then.
 *
 * - **When.** Every minute, and a second after any change to a project's
 *   tasks (a task moved into such a stage with its hold already over moves
 *   on at once).
 * - **`until:`.** The field's value is a wait as a file keeps it
 *   (wait-targets.ts), settled by the one resolver (task-waits.ts, through
 *   tasks.ts `waitStates`): a date holds the task until it passes, a
 *   `routine:<id>` until its condition is met. A field that is missing, or
 *   settles never, holds it.
 * - **`after:`.** Entering is the last move into the stage in the task's
 *   history (task-history.ts). A task whose history shows no move in is
 *   left.
 * - **A date passing.** Each look at a project asks whether a date any of
 *   its tasks waits on passed since the last look (an inherited wait is its
 *   whole's own, so the whole's file names it);
 *   if one did, the project's waits moved (tasks.ts `waitsMoved`), so
 *   dispatch looks and the board redraws. Each minute, followed plans with
 *   a step on a date that passed hear it too (plans.ts `clockMoved`).
 * - **Where to.** The stage the project's moves let a `routine` take it to
 *   from there: the only one, or, where several are open, the only one that
 *   names `routine` alone (outreach's `contacted → lost  routine` beside
 *   `contacted → replied  routine, lead, session`); a stages.md with no
 *   moves section gives it one, on to the next stage that is not dropped
 *   (stages.ts `heldOn`). Anything else moves
 *   nothing and is said once in the log: the stages' moves bind the routine
 *   as they bind anyone (tasks.ts `move`, mover `routine`).
 */

import type { Stage, WaitState } from "@cawco/core/task-views";
import { timeTarget } from "@cawco/core/wait-targets";
import { ElysiaStatus } from "elysia";
import type { HubLifetimeShape } from "./lifetime";
import type { Plans } from "./plans";
import { hasProjectFolder } from "./project-folder";
import { createProjectLooks } from "./project-looks";
import { movesFrom, type Stages } from "./stages";
import { routineActor, type TaskEvent, type Tasks } from "./tasks";

/** The routine's id, in its commits' `CawCo-Actor: routine:waits`. */
const ROUTINE = "waits";
const TICK_MS = 60_000;
/** A change's look waits this long, so a burst of changes looks once. */
const SETTLE_MS = 1000;

export interface WaitsDeps {
  readonly lifetime: HubLifetimeShape;
  readonly plans: Pick<Plans, "clockMoved">;
  /** Every project the hub keeps. */
  readonly projectIds: () => string[];
  readonly tasks: Tasks;
}

/** Whether a move from `from` names `routine` and nobody else. */
const routineAlone = (stages: Stages, from: string, to: string): boolean =>
  stages.moves.some(
    (move) =>
      (move.from === from || move.from === "*") &&
      move.to === to &&
      move.who.length === 1 &&
      move.who[0] === "routine"
  );

/** Where the routine takes a task held in `stage`, or why nowhere. */
const wakeTo = (
  stages: Stages,
  stage: string
): { to: string } | { problem: string } => {
  const open = movesFrom(stages, stage, "routine");
  if (open.length === 1) {
    return { to: open[0] };
  }
  const alone = open.filter((to) => routineAlone(stages, stage, to));
  if (alone.length === 1) {
    return { to: alone[0] };
  }
  return {
    problem:
      open.length === 0
        ? `no move in stages.md lets a routine take a task out of ${stage}`
        : `a routine may take a task out of ${stage} to ${open.join(", ")}, and none of them is the routine's alone`,
  };
};

/** Whether one of `handles` is a date in `(from, to]`. */
const datePassed = (
  handles: readonly string[],
  from: number,
  to: number
): boolean =>
  handles.some((handle) => {
    const at = timeTarget(handle)?.at;
    return at !== undefined && from < at && at <= to;
  });

export const createWaits = ({
  lifetime,
  plans,
  projectIds,
  tasks,
}: WaitsDeps) => {
  /** Problems already said, by project and stage: said once each. */
  const said = new Set<string>();
  /** When each project was last looked at whole: a date between then and now has passed since. */
  const lookedAt = new Map<string, number>();
  /** When the minute last ticked, for the plans' dates. */
  let tickedAt = 0;

  const warnOnce = (projectId: string, key: string, text: string): void => {
    const id = `${projectId}\0${key}`;
    if (!said.has(id)) {
      said.add(id);
      console.warn(`[waits] ${projectId}: ${text}`);
    }
  };

  /**
   * Why a task held in `stage` may go now; undefined while it is still
   * held; its history's refused read. `until` is its `until:` field's wait
   * as the resolver settled it, when the stage has the hook and the task
   * the field.
   */
  const due = async (
    projectId: string,
    task: { id: string },
    stage: Stage,
    until: WaitState | undefined,
    now: number
  ) => {
    const { after, afterMs } = stage.hooks;
    if (until?.settled) {
      return `${stage.hooks.until}: ${until.label} ${until.state}`;
    }
    if (after && afterMs) {
      const history = await tasks.history(projectId, task.id);
      if (history instanceof ElysiaStatus) {
        return history;
      }
      const entered = history.events.findLast(
        (event) => event.stage?.to === stage.name
      )?.at;
      if (entered !== undefined && entered + afterMs <= now) {
        return `${after} in ${stage.name}`;
      }
    }
  };

  /** Tells the project when a date its tasks wait on passed since its last look; its tasks' refused read. */
  const tellDates = async (projectId: string, now: number) => {
    const from = lookedAt.get(projectId) ?? 0;
    if (datePassed(tasks.waitHandles(projectId), from, now)) {
      const refused = await tasks.waitsMoved(projectId);
      if (refused) {
        return refused;
      }
    }
    lookedAt.set(projectId, now);
  };

  /**
   * Tells the project when a date its tasks wait on passed since its last
   * look, then moves every task whose hold in its stage is over; the first
   * refused read, which ends the look.
   */
  const lookAt = async (projectId: string) => {
    if (!(await hasProjectFolder(projectId))) {
      return;
    }
    const now = Date.now();
    const untold = await tellDates(projectId, now);
    if (untold) {
      return untold;
    }
    const view = await tasks.stages(projectId);
    if (view instanceof ElysiaStatus) {
      return view;
    }
    const holding = new Map(
      view.stages
        .filter((stage) => stage.hooks.until || stage.hooks.after)
        .map((stage) => [stage.name, stage])
    );
    if (holding.size === 0) {
      return;
    }
    const list = await tasks.list(projectId);
    if (list instanceof ElysiaStatus) {
      return list;
    }
    const held = list.tasks.flatMap((task) => {
      const stage = holding.get(task.stage);
      return stage ? [{ task, stage }] : [];
    });
    const fields = held.flatMap(({ task, stage }) => {
      const value = stage.hooks.until && task.fields[stage.hooks.until];
      return value ? [{ id: task.id, value }] : [];
    });
    const states = await tasks.waitStates(
      projectId,
      fields.map(({ value }) => value)
    );
    if (states instanceof ElysiaStatus) {
      return states;
    }
    const untilOf = new Map(fields.map(({ id }, at) => [id, states[at]]));
    for (const { task, stage } of held) {
      const refused = await wake(
        projectId,
        view,
        task,
        stage,
        untilOf.get(task.id),
        now
      );
      if (refused) {
        return refused;
      }
    }
  };

  /** Moves one task on when its hold in `stage` is over and the moves say where; its history's refused read. */
  const wake = async (
    projectId: string,
    stages: Stages,
    task: { id: string },
    stage: Stage,
    until: WaitState | undefined,
    now: number
  ) => {
    const why = await due(projectId, task, stage, until, now);
    if (why instanceof ElysiaStatus) {
      return why;
    }
    if (!why) {
      return;
    }
    const where = wakeTo(stages, stage.name);
    if ("problem" in where) {
      warnOnce(
        projectId,
        stage.name,
        `${task.id} is due to move on, but ${where.problem}.`
      );
      return;
    }
    const unmoved = (words: string) =>
      warnOnce(
        projectId,
        `${task.id}\0${where.to}`,
        `${task.id} could not move ${stage.name} → ${where.to}: ${words}`
      );
    try {
      const moved = await tasks.move(
        projectId,
        task.id,
        where.to,
        routineActor(ROUTINE, why)
      );
      if (moved instanceof ElysiaStatus) {
        unmoved(moved.response.detail);
        return;
      }
      console.info(
        `[waits] ${projectId} ${task.id}: ${why}; moved ${stage.name} → ${where.to}`
      );
    } catch (error) {
      unmoved(error instanceof Error ? error.message : String(error));
    }
  };

  const { look, soon } = createProjectLooks({
    lifetime,
    lookAt,
    name: "waits",
    settleMs: SETTLE_MS,
  });

  return {
    /** Starts the minute's tick, with a first look at every project now. */
    start(): void {
      const all = () => {
        const now = Date.now();
        plans.clockMoved(tickedAt, now);
        tickedAt = now;
        for (const projectId of projectIds()) {
          look(projectId);
        }
      };
      all();
      lifetime.every("waits tick", TICK_MS, all);
    },

    /** A project's tasks changed (tasks.ts `listen`): it is looked at again shortly. */
    taskChanged(event: TaskEvent): void {
      soon(event.projectId);
    },
  };
};
