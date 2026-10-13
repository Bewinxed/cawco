/**
 * Stage hooks that hold a task (§5.2, stages.ts): `until: <field>` holds it
 * until the time its file's field names, `after: <n>m|h|d|w` holds it that
 * long from when it entered the stage; then a routine moves it on. This is
 * that routine, `waits`.
 *
 * - **When.** Every minute, and a second after any change to a project's
 *   tasks (a task moved into such a stage with its time already past moves
 *   on at once). The field's value is an ISO 8601 date (task-file.ts fields,
 *   indexed); entering is the last move into the stage in the task's history
 *   (task-history.ts). A task whose history shows no move in is left, as is
 *   one whose field is missing or no date.
 * - **Where to.** The stage the project's moves let a `routine` take it to
 *   from there: the only one, or, where several are open, the only one that
 *   names `routine` alone (outreach's `contacted → lost  routine` beside
 *   `contacted → replied  routine, lead, session`). Anything else moves
 *   nothing and is said once in the log: the stages' moves bind the routine
 *   as they bind anyone (tasks.ts `move`, mover `routine`).
 */
import type { HubLifetimeShape } from "./lifetime";
import { hasProjectFolder } from "./project-folder";
import { movesFrom, type Stage, type Stages } from "./stages";
import { routineActor, type TaskEvent, type Tasks } from "./tasks";

/** The routine's id, in its commits' `CawCo-Actor: routine:waits`. */
const ROUTINE = "waits";
const TICK_MS = 60_000;
/** A change's look waits this long, so a burst of changes looks once. */
const SETTLE_MS = 1000;
const ISO_DATE =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

export interface WaitsDeps {
  readonly lifetime: HubLifetimeShape;
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
export const wakeTo = (
  stages: Stages,
  stage: string
): { to: string } | { problem: string } => {
  const open = movesFrom(stages, stage, "routine");
  if (open.length === 1) {
    return { to: open[0] as string };
  }
  const alone = open.filter((to) => routineAlone(stages, stage, to));
  if (alone.length === 1) {
    return { to: alone[0] as string };
  }
  return {
    problem:
      open.length === 0
        ? `no move in stages.md lets a routine take a task out of ${stage}`
        : `a routine may take a task out of ${stage} to ${open.join(", ")}, and none of them is the routine's alone`,
  };
};

/** The ms epoch a field's value names, or undefined when it names none. */
const dateOf = (value: string | undefined): number | undefined => {
  if (!(value && ISO_DATE.test(value))) {
    return;
  }
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : at;
};

export const createWaits = ({ lifetime, projectIds, tasks }: WaitsDeps) => {
  /** Problems already said, by project and stage: said once each. */
  const said = new Set<string>();
  /** Projects whose look is under way, and those asked again meanwhile. */
  const looking = new Set<string>();
  const again = new Set<string>();
  const soon = new Map<string, ReturnType<HubLifetimeShape["after"]>>();

  const warnOnce = (projectId: string, key: string, text: string): void => {
    const id = `${projectId}\0${key}`;
    if (!said.has(id)) {
      said.add(id);
      console.warn(`[waits] ${projectId}: ${text}`);
    }
  };

  /** Why a task held in `stage` may go now; undefined while it is still held. */
  const due = async (
    projectId: string,
    task: { fields: Record<string, string>; id: string; stage: string },
    stage: Stage,
    now: number
  ): Promise<string | undefined> => {
    const { until, after, afterMs } = stage.hooks;
    if (until) {
      const at = dateOf(task.fields[until]);
      if (at !== undefined && at <= now) {
        return `${until} ${new Date(at).toISOString()} passed`;
      }
    }
    if (after && afterMs) {
      const { events } = await tasks.history(projectId, task.id);
      const entered = events.findLast(
        (event) => event.stage?.to === stage.name
      )?.at;
      if (entered !== undefined && entered + afterMs <= now) {
        return `${after} in ${stage.name}`;
      }
    }
  };

  /** Moves every task of one project whose hold in its stage is over. */
  const lookAt = async (projectId: string): Promise<void> => {
    if (!(await hasProjectFolder(projectId))) {
      return;
    }
    const view = await tasks.stages(projectId);
    const holding = new Map(
      view.stages
        .filter((stage) => stage.hooks.until || stage.hooks.after)
        .map((stage) => [stage.name, stage])
    );
    if (holding.size === 0) {
      return;
    }
    const { tasks: rows, tracker } = await tasks.list(projectId);
    if (tracker !== "cawco") {
      return;
    }
    const now = Date.now();
    for (const task of rows) {
      const stage = holding.get(task.stage);
      if (stage) {
        // biome-ignore lint/performance/noAwaitInLoops: one task's move at a time, in the project's turn
        await wake(projectId, view, task, stage, now);
      }
    }
  };

  /** Moves one task on when its hold in `stage` is over and the moves say where. */
  const wake = async (
    projectId: string,
    stages: Stages,
    task: { fields: Record<string, string>; id: string; stage: string },
    stage: Stage,
    now: number
  ): Promise<void> => {
    const why = await due(projectId, task, stage, now);
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
    try {
      await tasks.move(
        projectId,
        task.id,
        where.to,
        routineActor(ROUTINE, why)
      );
      console.info(
        `[waits] ${projectId} ${task.id}: ${why}; moved ${stage.name} → ${where.to}`
      );
    } catch (error) {
      warnOnce(
        projectId,
        `${task.id}\0${where.to}`,
        `${task.id} could not move ${stage.name} → ${where.to}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  /** One look at a project at a time; one asked for during a look runs after it. */
  const look = (projectId: string): void => {
    if (looking.has(projectId)) {
      again.add(projectId);
      return;
    }
    looking.add(projectId);
    lookAt(projectId)
      .catch((error: unknown) =>
        console.warn(
          `[waits] ${projectId}: ${error instanceof Error ? error.message : String(error)}`
        )
      )
      .finally(() => {
        looking.delete(projectId);
        if (again.delete(projectId)) {
          look(projectId);
        }
      });
  };

  return {
    /** Starts the minute's tick, with a first look at every project now. */
    start(): void {
      const all = () => {
        for (const projectId of projectIds()) {
          look(projectId);
        }
      };
      all();
      lifetime.every(TICK_MS, all);
    },

    /** A project's tasks changed (tasks.ts `listen`): it is looked at again shortly. */
    taskChanged(event: TaskEvent): void {
      lifetime.cancel(soon.get(event.projectId));
      soon.set(
        event.projectId,
        lifetime.after(SETTLE_MS, () => {
          soon.delete(event.projectId);
          look(event.projectId);
        })
      );
    },
  };
};
