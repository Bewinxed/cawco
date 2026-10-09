/**
 * Forgetting a project never leaves its sessions running, and an unreachable
 * machine never makes a project unforgettable. Before a project is forgotten
 * its running sessions are listed as a tree (each lead with its delegates),
 * stopped in one request, and each one's end is reported back as its machine
 * confirms it, or as it fails, with the hub's reason. The delete itself is
 * refused while any of them still runs, so no client can orphan a session by
 * forgetting its project.
 *
 * A session lists in a project by the rail's own rule (core
 * project-membership): the projects of the session at the top of its chain
 * of parents. It may still run while its process may be alive: starting,
 * running, `unknown` (its machine went away with it running: the hub writes
 * that at the disconnect, and the process lives on in the machine's keeper),
 * asleep in the middle of a turn, or ended on request but not yet confirmed
 * ended by its machine (`endIntent` without `endConfirmedAt`; a stop marks
 * the row `stopped` the moment it is asked for, long before the process is
 * gone).
 *
 * Two rules, by whether its machine is connected:
 * - Online, a session runs until its machine confirms its end: it blocks the
 *   delete, however slow the machine is to answer.
 * - Offline, the hub cannot stop it now. Its stop is recorded instead
 *   (session-lifecycle `oweEndSession`), and the lifecycle sends it when the
 *   machine registers again (the register's reconcile reads every row with
 *   an `endIntent` and no `endConfirmedAt`). Once that stop is recorded the
 *   session no longer blocks the delete: it stops when its machine is back.
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
  /**
   * Its machine is not connected: it cannot be stopped now, and stops when
   * its machine is back.
   */
  offline: boolean;
  /** The nearest running session it is a delegate of; null for a lead. */
  parentId: string | null;
  /** Its name as the rails give it (null: nobody named it; the client names it by its folder). */
  title: string | null;
}

/** Why a stop was not confirmed in time. */
const NO_ANSWER =
  "Stop got no answer in time. The machine may be offline. Check the machine, then retry.";

export const createProjectStops = (ports: {
  db: DbShape;
  /** The session's live pulse, if its daemon has sent one. */
  pulse: (id: string) => SessionPulse | undefined;
  /** Asks for the session's stop (stored first, then sent); throws the hub's refusal. */
  stop: (id: string) => void;
  /** Records the session's stop for its machine's next register. */
  owe: (id: string) => void;
  /** Its machine's agent is connected. */
  online: (machineId: string) => boolean;
  publish: (frame: ProjectStopFrame) => void;
  /** How long a stop may go unconfirmed before it is reported failed. */
  timeoutMs: number;
}) => {
  /** Sessions a forget asked to stop, by id, until their end is confirmed. */
  const asked = new Map<
    string,
    {
      machineId: string;
      projectId: string;
      timer: ReturnType<typeof setTimeout> | undefined;
      /** Reported deferred: owed to its machine's next register. */
      deferred?: boolean;
    }
  >();

  /** Its process may still be alive. */
  const mayRun = (row: Row): boolean => {
    if (row.machineRemoved || row.status === "discarded") {
      return false;
    }
    if (row.endIntent) {
      return !row.endConfirmedAt;
    }
    if (
      row.status === "starting" ||
      row.status === "running" ||
      row.status === "unknown"
    ) {
      return true;
    }
    const turn = ports.pulse(row.id);
    return row.status === "sleeping" && !!turn && turn.activity !== "idle";
  };

  /**
   * It keeps the project from being forgotten: on a connected machine until
   * its end is confirmed; on one that is not, until its stop is recorded.
   */
  const blocks = (row: Row): boolean =>
    mayRun(row) && (ports.online(row.machineId) || !row.endIntent);

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
    const live = new Map(
      all.filter(mayRun).map((row) => [row.id, row] as const)
    );
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
          offline: !ports.online(row.machineId),
        });
        walk(row.id);
      }
    };
    walk(null);
    return out;
  };

  const settle = (id: string, frame: Omit<ProjectStopFrame, "kind">) => {
    ports.publish({ kind: "project.stop", ...frame });
    const entry = asked.get(id);
    if (entry && frame.outcome !== "failed") {
      clearTimeout(entry.timer);
      entry.timer = undefined;
      entry.deferred = frame.outcome === "deferred";
    }
    if (frame.outcome === "stopped") {
      asked.delete(id);
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
   * Records the stop of a session whose machine is away. It stays asked: the
   * confirmation its machine sends after its next register reports it
   * stopped to whoever still listens.
   */
  const defer = (projectId: string, row: Row): void => {
    const { id } = row;
    clearTimeout(asked.get(id)?.timer);
    asked.set(id, { machineId: row.machineId, projectId, timer: undefined });
    if (!row.endIntent) {
      ports.owe(id);
    }
    settle(id, { projectId, instanceId: id, outcome: "deferred" });
  };

  /** Asks one running session's stop, and reports what is already known. */
  const stopOne = (projectId: string, row: Row): void => {
    const { id } = row;
    clearTimeout(asked.get(id)?.timer);
    asked.set(id, {
      machineId: row.machineId,
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
    }
  };

  /**
   * Stops `ids`, each a session of the project. One already ended is reported
   * stopped at once; one on a machine that is away is recorded and reported
   * deferred; the rest are reported as their machines confirm (or a failure
   * arrives). A failure keeps the entry: a confirmation that comes later
   * still reports the session stopped.
   */
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
      if (!mayRun(row)) {
        settle(id, { projectId, instanceId: id, outcome: "stopped" });
      } else if (ports.online(row.machineId)) {
        stopOne(projectId, row);
      } else {
        defer(projectId, row);
      }
    }
  };

  return {
    running,
    stop,
    /** How many of the project's sessions keep it from being forgotten (the delete's refusal). */
    stillRunning: (projectId: string): number =>
      members(projectId).filter(blocks).length,
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
    /**
     * A machine's socket closed: the stops it had not confirmed, waiting or
     * failed, are owed to its next register (they are stored already), so
     * they are deferred, not failed for want of an answer.
     */
    machineGone: (machineId: string): void => {
      for (const [id, entry] of asked) {
        if (entry.machineId === machineId && !entry.deferred) {
          settle(id, {
            projectId: entry.projectId,
            instanceId: id,
            outcome: "deferred",
          });
        }
      }
    },
  };
};
