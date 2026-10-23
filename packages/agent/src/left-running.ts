/**
 * WHAT A SESSION'S HARNESS PROCESS STARTED DOES NOT OUTLIVE ITS DEATH. A
 * Claude Code, pi or OpenCode process killed from outside (an OOM kill, a
 * stray `kill`) leaves the command its turn was running behind: adopted by
 * init, with nobody to end it, on the host and in a workspace alike
 * (2026-10-24: the probe kit's kill of a Claude CLI left two `sleep`s
 * running under PID 1). Its keeper's own sweep ends only what its last
 * reading of the tree held, every half minute (sessiond server.ts
 * `SURVEY_INTERVAL_MS`), so a command started inside that interval is missed.
 *
 * So the agent records each session's tree as its commands start: when its
 * model calls a shell, the harness process's descendants and the process
 * groups they lead, each by its start (two readings, a moment apart, so a
 * command that is still being spawned is held too). When its harness
 * process is found dead, everything recorded that is still the same
 * process, what it started since and the members of the groups it leads, is
 * told to end (SIGTERM) and killed after {@link LEFT_GRACE_MS}; each one is
 * named in the agent's log. Nothing is ended while the harness process
 * lives: an OpenCode server that runs on for other sessions keeps its work.
 * Read by lineage, on Linux and macOS alike (core `processLineage`).
 */
import {
  commandLines,
  type ProcessLineage,
  processLineage,
} from "@cawco/core/process-identity";
import { listedPid, signal as signalPid } from "@cawco/core/signal";

/** How long what a dead harness left is given to end on SIGTERM before SIGKILL. Ours: the sweep's own (sessiond `SWEEP_GRACE_MS`). */
const LEFT_GRACE_MS = 2000;
/** When, after a shell call, its command's tree is read: as it spawns, and once it has. */
const RECORD_AFTER_MS = [300, 1500] as const;

/** A process as one reading knew it: its start says it is still the same one. */
interface Known {
  started: string;
}

interface Recorded {
  /** The harness process: its pid and its start. */
  root: { pid: number; started: string };
  /** Each process found under it, by pid. */
  tree: Map<number, Known>;
}

const byParent = (rows: readonly ProcessLineage[]) => {
  const map = new Map<number, ProcessLineage[]>();
  for (const row of rows) {
    const siblings = map.get(row.ppid);
    if (siblings) {
      siblings.push(row);
    } else {
      map.set(row.ppid, [row]);
    }
  }
  return map;
};

/**
 * The processes under `seeds` in `rows`: each seed, its descendants by
 * parentage, and the members of every process group one of them leads.
 */
const treeOf = (
  rows: readonly ProcessLineage[],
  seeds: ReadonlySet<number>
): ProcessLineage[] => {
  const children = byParent(rows);
  const taken = new Map<number, ProcessLineage>();
  const take = (row: ProcessLineage): void => {
    if (taken.has(row.pid)) {
      return;
    }
    taken.set(row.pid, row);
    for (const child of children.get(row.pid) ?? []) {
      take(child);
    }
  };
  for (const row of rows) {
    if (seeds.has(row.pid)) {
      take(row);
    }
  }
  for (let grew = true; grew;) {
    grew = false;
    for (const row of rows) {
      if (!taken.has(row.pid) && taken.has(row.pgid)) {
        take(row);
        grew = true;
      }
    }
  }
  return [...taken.values()];
};

export const createLeftRunning = () => {
  const recorded = new Map<string, Recorded>();

  /** One reading of `instanceId`'s tree under harness process `pid`, added to what it had. */
  const read = async (instanceId: string, pid: number): Promise<void> => {
    const rows = await processLineage();
    const root = rows.find((row) => row.pid === pid);
    if (!root) {
      return;
    }
    const known = recorded.get(instanceId);
    const held =
      known?.root.pid === pid && known.root.started === root.started
        ? known
        : { root: { pid, started: root.started }, tree: new Map() };
    for (const row of treeOf(rows, new Set([pid]))) {
      if (row.pid !== pid) {
        held.tree.set(row.pid, { started: row.started });
      }
    }
    recorded.set(instanceId, held);
  };

  return {
    /**
     * Session `instanceId`'s model called a shell in its harness process
     * `pid`: its tree is read as the command spawns, and once it has.
     */
    commandStarted(instanceId: string, pid: number): void {
      for (const after of RECORD_AFTER_MS) {
        setTimeout(() => {
          read(instanceId, pid).catch((error: unknown) =>
            console.warn(
              `[agent] ${instanceId}: its command's processes could not be read: ${error instanceof Error ? error.message : String(error)}`
            )
          );
        }, after);
      }
    },

    /**
     * Session `instanceId`'s harness process has gone: what it left running
     * of its recorded tree ends, each named in the log. Nothing when its
     * harness process still runs, or nothing was recorded.
     */
    async processGone(instanceId: string): Promise<void> {
      const held = recorded.get(instanceId);
      if (!held) {
        return;
      }
      const rows = await processLineage();
      if (
        rows.some(
          (row) =>
            row.pid === held.root.pid && row.started === held.root.started
        )
      ) {
        return;
      }
      recorded.delete(instanceId);
      const still = new Set(
        rows
          .filter((row) => held.tree.get(row.pid)?.started === row.started)
          .map((row) => row.pid)
      );
      const left = treeOf(rows, still).filter((row) => row.pid !== process.pid);
      if (left.length === 0) {
        return;
      }
      const named = new Map(
        (await commandLines()).map((one) => [one.pid, one.command])
      );
      for (const row of left) {
        signalPid(listedPid(row.pid), "SIGTERM");
      }
      await Bun.sleep(LEFT_GRACE_MS);
      const now = new Map(
        (await processLineage()).map((row) => [row.pid, row.started])
      );
      for (const row of left) {
        if (now.get(row.pid) === row.started) {
          signalPid(listedPid(row.pid), "SIGKILL");
        }
      }
      console.info(
        `[agent] ${instanceId}: its harness process died, so what it left running was ended: ${left
          .map(
            (row) =>
              `pid ${row.pid} (${(named.get(row.pid) ?? "?").slice(0, 120)})`
          )
          .join(", ")}`
      );
    },
  };
};

export type LeftRunning = ReturnType<typeof createLeftRunning>;
