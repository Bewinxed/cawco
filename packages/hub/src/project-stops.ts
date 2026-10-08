/**
 * Forgetting a project never leaves its sessions running. Before a project
 * is forgotten its running sessions are listed as a tree (each lead with its
 * delegates), stopped in one request, and each one's end is reported back as
 * its machine confirms it, or as it fails, with the hub's reason. The delete
 * itself is refused while any of them still runs, so no client can orphan a
 * session by forgetting its project.
 *
 * A session lists in a project by the rail's own rule (core
 * project-membership): the projects of the session at the top of its chain
 * of parents. It runs while its process may still be alive: starting,
 * running, asleep in the middle of a turn, or ended on request but not yet
 * confirmed ended by its machine (`endIntent` without `endConfirmedAt`; a
 * stop marks the row `stopped` the moment it is asked for, long before the
 * process is gone).
 */
import {
  type ProjectStopFrame,
  projectsFor,
  type SessionPulse,
  topsIn,
} from "@cawco/core";
import { checkoutOf, type DbShape } from "./db";

type Row = ReturnType<DbShape["sessionOwnership"]>[number];

/** One running session of a project, in tree order (parents first). */
export interface RunningSession {
  cwd: string;
  id: string;
  machineId: string;
  /** The nearest running session it is a delegate of; null for a lead. */
  parentId: string | null;
  /** Its name as the rails give it (null: nobody named it; the client names it by its folder). */
  title: string | null;
}

/** Why a stop was not confirmed in time. */
const NO_ANSWER =
  "Stop got no answer in time. The machine may be offline. Check the machine, then retry.";
const OFFLINE =
  "Stop is recorded, but the machine is offline. Check the machine, then retry.";

export const createProjectStops = (ports: {
  db: DbShape;
  /** The session's live pulse, if its daemon has sent one. */
  pulse: (id: string) => SessionPulse | undefined;
  /** Asks for the session's stop (stored first, then sent); throws the hub's refusal. */
  stop: (id: string) => void;
  /** Its machine's agent is connected. */
  online: (machineId: string) => boolean;
  publish: (frame: ProjectStopFrame) => void;
  /** How long a stop may go unconfirmed before it is reported failed. */
  timeoutMs: number;
}) => {
  /** Sessions a forget asked to stop, by id, until their end is confirmed. */
  const asked = new Map<
    string,
    { projectId: string; timer: ReturnType<typeof setTimeout> }
  >();

  const runs = (row: Row): boolean => {
    if (row.machineRemoved || row.status === "discarded") {
      return false;
    }
    if (row.endIntent) {
      return !row.endConfirmedAt;
    }
    if (row.status === "starting" || row.status === "running") {
      return true;
    }
    const turn = ports.pulse(row.id);
    return row.status === "sleeping" && !!turn && turn.activity !== "idle";
  };

  /** Every session that lists in the project, running or not. */
  const members = (projectId: string): Row[] => {
    // As the dashboard reads them (GET /api/projects): with the primary named.
    const projects = ports.db.listProjects().map((project) => ({
      ...project,
      primaryPlaceId: checkoutOf(project)?.id ?? null,
    }));
    const rows = ports.db.sessionOwnership();
    const byId = new Map(rows.map((row) => [row.id, row]));
    const topOf = topsIn(byId);
    return rows.filter((row) =>
      projectsFor(projects, topOf(row)).some(
        (project) => project.id === projectId
      )
    );
  };

  const spawned = (row: Row) => row.spawnedAt?.getTime() ?? 0;

  /** The project's running sessions, each lead followed by its delegates. */
  const running = (projectId: string): RunningSession[] => {
    const all = members(projectId);
    const live = new Map(all.filter(runs).map((row) => [row.id, row] as const));
    const byId = new Map(all.map((row) => [row.id, row]));
    /** The nearest running ancestor: a stopped parent between them is skipped. */
    const parentOf = (row: Row): string | null => {
      const seen = new Set([row.id]);
      let up = row.parentInstanceId
        ? byId.get(row.parentInstanceId)
        : undefined;
      while (up && !seen.has(up.id)) {
        if (live.has(up.id)) {
          return up.id;
        }
        seen.add(up.id);
        up = up.parentInstanceId ? byId.get(up.parentInstanceId) : undefined;
      }
      return null;
    };
    const children = new Map<string | null, Row[]>();
    for (const row of live.values()) {
      const parent = parentOf(row);
      children.set(parent, [...(children.get(parent) ?? []), row]);
    }
    const out: RunningSession[] = [];
    const walk = (parent: string | null) => {
      const rows = (children.get(parent) ?? []).sort(
        (a, b) => spawned(a) - spawned(b) || a.id.localeCompare(b.id)
      );
      for (const row of rows) {
        out.push({
          id: row.id,
          parentId: parent,
          title: row.title ?? row.derivedTitle ?? null,
          machineId: row.machineId,
          cwd: row.cwd,
        });
        walk(row.id);
      }
    };
    walk(null);
    return out;
  };

  const settle = (id: string, frame: Omit<ProjectStopFrame, "kind">) => {
    ports.publish({ kind: "project.stop", ...frame });
    if (frame.outcome === "stopped") {
      const entry = asked.get(id);
      if (entry) {
        clearTimeout(entry.timer);
        asked.delete(id);
      }
    }
  };

  const fail = (id: string, error: string) => {
    const entry = asked.get(id);
    if (entry) {
      clearTimeout(entry.timer);
      settle(id, {
        projectId: entry.projectId,
        instanceId: id,
        outcome: "failed",
        error,
      });
    }
  };

  /**
   * Stops `ids`, each a session of the project. One already ended is reported
   * stopped at once; the rest are reported as their machines confirm (or a
   * failure arrives). A failure keeps the entry: a confirmation that comes
   * later still reports the session stopped.
   */
  /** Asks one running session's stop, and reports what is already known. */
  const stopOne = (projectId: string, row: Row): void => {
    const { id } = row;
    clearTimeout(asked.get(id)?.timer);
    asked.set(id, {
      projectId,
      timer: setTimeout(() => fail(id, NO_ANSWER), ports.timeoutMs),
    });
    try {
      ports.stop(id);
    } catch (error) {
      fail(id, error instanceof Error ? error.message : String(error));
      return;
    }
    const now = ports.db.ownedInstance(id);
    if (!now || now.endConfirmedAt) {
      settle(id, { projectId, instanceId: id, outcome: "stopped" });
    } else if (!ports.online(row.machineId)) {
      fail(id, OFFLINE);
    }
  };

  const stop = (projectId: string, ids: string[]): void => {
    const mine = new Map(members(projectId).map((row) => [row.id, row]));
    const foreign = ids.filter((id) => !mine.has(id)).length;
    if (foreign > 0) {
      throw new Error(
        foreign === 1
          ? "A session named here is not this project's. Refresh, then retry."
          : `${foreign} sessions named here are not this project's. Refresh, then retry.`
      );
    }
    for (const id of ids) {
      const row = mine.get(id) as Row;
      if (runs(row)) {
        stopOne(projectId, row);
      } else {
        settle(id, { projectId, instanceId: id, outcome: "stopped" });
      }
    }
  };

  return {
    running,
    stop,
    /** How many of the project's sessions still run (the delete's refusal). */
    stillRunning: (projectId: string): number =>
      members(projectId).filter(runs).length,
    /** A session's end was confirmed by its machine (session-lifecycle `confirmed`). */
    confirmed: (id: string): void => {
      const entry = asked.get(id);
      if (entry) {
        settle(id, {
          projectId: entry.projectId,
          instanceId: id,
          outcome: "stopped",
        });
      }
    },
    /** Its machine refused the stop, with its reason. */
    failed: fail,
  };
};
