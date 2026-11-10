/**
 * Counts that move each time the hub says a project's tasks, decision pages
 * or blocks changed, for the views that read them again when they move; and
 * each project's starters as the hub last wrote them while this page stood.
 */
import type { ProjectStarter, StarterPlace } from "@cawco/core/starters";
import type { FrameOf } from "../hub/frames";

const tickersState = $state<{
  /**
   * How many times each project's tasks have changed since this page
   * connected, by project id (`tasks.changed` frames): what shows its tasks
   * reads them again when it moves.
   */
  tasksChanged: Record<string, number>;

  /**
   * How many `tasks.changed` frames have named each task, by
   * `projectId/taskId`, and how many named none, by project id: an open
   * task reads itself again when either moves (`taskChangedOf`).
   */
  taskChanged: Record<string, number>;
  tasksChangedUnnamed: Record<string, number>;

  /**
   * How many times each project's decision pages have changed since this
   * page connected (`decisions.changed` frames): the Decisions tab reads them
   * again when it moves.
   */
  decisionsChanged: Record<string, number>;

  /**
   * How many times each project's arrangement of blocks has changed since
   * this page connected (`blocks.changed` frames): its pages read it again
   * when it moves.
   */
  blocksChanged: Record<string, number>;

  /**
   * Each project's starters for each place as the hub last wrote them while
   * this page was connected (`starters.changed` frames), by
   * `<place>:<project id>`: newer than the set its stages read carried.
   */
  starters: Record<string, ProjectStarter[]>;
}>({
  tasksChanged: {},
  taskChanged: {},
  tasksChangedUnnamed: {},
  decisionsChanged: {},
  blocksChanged: {},
  starters: {},
});

export function takeTasksChanged(frame: FrameOf<"tasks.changed">): void {
  tickersState.tasksChanged[frame.projectId] =
    (tickersState.tasksChanged[frame.projectId] ?? 0) + 1;
  if (frame.taskId) {
    const named = `${frame.projectId}/${frame.taskId}`;
    tickersState.taskChanged[named] =
      (tickersState.taskChanged[named] ?? 0) + 1;
  } else {
    tickersState.tasksChangedUnnamed[frame.projectId] =
      (tickersState.tasksChangedUnnamed[frame.projectId] ?? 0) + 1;
  }
}

export function takeDecisionsChanged(
  frame: FrameOf<"decisions.changed">
): void {
  tickersState.decisionsChanged[frame.projectId] =
    (tickersState.decisionsChanged[frame.projectId] ?? 0) + 1;
}

export function takeBlocksChanged(frame: FrameOf<"blocks.changed">): void {
  tickersState.blocksChanged[frame.projectId] =
    (tickersState.blocksChanged[frame.projectId] ?? 0) + 1;
}

/**
 * A set heard before the socket went may have been replaced while it was
 * away: the stages each page reads again on a connection carry the newer.
 */
export function forgetStarters(): void {
  tickersState.starters = {};
}

export function takeStarters(frame: FrameOf<"starters.changed">): void {
  tickersState.starters[`${frame.place}:${frame.projectId}`] = frame.starters;
}

/** The counts that move as a project's tasks, decisions and blocks change, and its starters. */
export const tickersStore = {
  /** A count that moves each time the project's tasks change (`tasks.changed`). */
  tasksChangedOf: (projectId: string): number =>
    tickersState.tasksChanged[projectId] ?? 0,
  /** A count that moves each time a `tasks.changed` frame names the task, or names none of the project's. */
  taskChangedOf: (projectId: string, taskId: string): number =>
    (tickersState.taskChanged[`${projectId}/${taskId}`] ?? 0) +
    (tickersState.tasksChangedUnnamed[projectId] ?? 0),
  /** A count that moves each time the project's decision pages change (`decisions.changed`). */
  decisionsChangedOf: (projectId: string): number =>
    tickersState.decisionsChanged[projectId] ?? 0,
  /** A count that moves each time the project's arrangement of blocks changes (`blocks.changed`). */
  blocksChangedOf: (projectId: string): number =>
    tickersState.blocksChanged[projectId] ?? 0,
  /**
   * The project's starters for a place: the set the hub last sent while
   * this page was connected, else `read`, the set its stages read carried.
   */
  startersOf: (
    projectId: string,
    where: StarterPlace,
    read: ProjectStarter[] | undefined
  ): ProjectStarter[] =>
    tickersState.starters[`${where}:${projectId}`] ?? read ?? [],
};
