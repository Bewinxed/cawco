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
 * So the agent records each session's tree while its commands run: from its
 * model's shell call until no shell call of its is running, the harness
 * process's descendants and the process groups they lead, each by its
 * start, read every {@link RECORD_EVERY_MS} (a harness may spawn the command
 * well after the call: OpenCode's waits on its own permission step). Each
 * reading keeps what still runs of the last, so a background command the
 * turn left is still held after its call returned. When its harness
 * process is found dead, everything recorded that is still the same
 * process, what it started since and the members of the groups it leads, is
 * told to end (SIGTERM) and killed after {@link LEFT_GRACE_MS}; each one is
 * named in the agent's log. Nothing is ended while the harness process
 * lives: an OpenCode server that runs on for other sessions keeps its work.
 * Read by lineage, on Linux and macOS alike (core `processLineage`).
 */
import {
  commandLine,
  commandLines,
  type ProcessLineage,
  processLineage,
  processTable,
} from "@cawco/core/process-identity";
import { listedPid, signal as signalPid } from "@cawco/core/signal";
import { workWords } from "@cawco/core/words/work";

/** How long what a dead harness left is given to end on SIGTERM before SIGKILL. Ours: the sweep's own (sessiond `SWEEP_GRACE_MS`). */
const LEFT_GRACE_MS = 2000;
/** When, after a shell call, its command's tree is first read: as it spawns. */
const RECORD_FIRST_MS = 300;
/** How often it is read again while a shell call of the session runs. Ours: the agent's pulse's own beat. */
const RECORD_EVERY_MS = 2000;

/** A process as one reading knew it: its start says it is still the same one; its command line, as it was then. */
interface Known {
  command: string;
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
  /**
   * Each session's records, one per harness process it ran commands under:
   * a session moved to another process (OpenCode's next server) keeps the
   * record of the one before until that one is found dead.
   */
  const recorded = new Map<string, Recorded[]>();
  /** Each session's readings while a shell call of its runs. */
  const reading = new Map<string, ReturnType<typeof setTimeout>>();

  /** One reading of `instanceId`'s tree under harness process `pid`: what still runs of the last, and what runs now. */
  const read = async (instanceId: string, pid: number): Promise<void> => {
    const rows = await processLineage();
    const root = rows.find((row) => row.pid === pid);
    if (!root) {
      return;
    }
    const records = recorded.get(instanceId) ?? [];
    let held = records.find(
      (one) => one.root.pid === pid && one.root.started === root.started
    );
    if (!held) {
      held = { root: { pid, started: root.started }, tree: new Map() };
      records.push(held);
      recorded.set(instanceId, records);
    }
    const now = new Map(rows.map((row) => [row.pid, row.started]));
    for (const [at, one] of held.tree) {
      if (now.get(at) !== one.started) {
        held.tree.delete(at);
      }
    }
    for (const row of treeOf(rows, new Set([pid]))) {
      if (row.pid !== pid && !held.tree.has(row.pid)) {
        held.tree.set(row.pid, {
          started: row.started,
          command: (await commandLine(row.pid)) ?? "?",
        });
      }
    }
  };

  /** Reads `instanceId`'s tree after `after`, and again every {@link RECORD_EVERY_MS} until {@link stop}. */
  const schedule = (instanceId: string, pid: number, after: number): void => {
    reading.set(
      instanceId,
      setTimeout(() => {
        read(instanceId, pid)
          .catch((error: unknown) =>
            console.warn(
              `[agent] ${instanceId}: its command's processes could not be read: ${error instanceof Error ? error.message : String(error)}`
            )
          )
          .finally(() => {
            if (reading.has(instanceId)) {
              schedule(instanceId, pid, RECORD_EVERY_MS);
            }
          });
      }, after)
    );
  };

  const stop = (instanceId: string): void => {
    clearTimeout(reading.get(instanceId));
    reading.delete(instanceId);
  };

  /** What runs now of `records`' trees: each recorded process still the same one, what it started since, the groups it leads. */
  const leftOf = (
    rows: readonly ProcessLineage[],
    records: readonly Recorded[]
  ): ProcessLineage[] => {
    const still = new Set(
      rows
        .filter((row) =>
          records.some(
            (held) => held.tree.get(row.pid)?.started === row.started
          )
        )
        .map((row) => row.pid)
    );
    return treeOf(rows, still).filter((row) => row.pid !== process.pid);
  };

  /**
   * Ends `left` (SIGTERM, then SIGKILL after {@link LEFT_GRACE_MS}), and
   * names each in the log, with what `gone` recorded that had ended before
   * (its keeper's own sweep can be first: sessiond `#sweep`).
   */
  const end = async (
    instanceId: string,
    left: readonly ProcessLineage[],
    gone: readonly Known[]
  ): Promise<void> => {
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
      `[agent] ${instanceId}: ${workWords.leftRunningEnded}: ${[
        ...left.map(
          (row) =>
            `pid ${row.pid} (${(named.get(row.pid) ?? "?").slice(0, 120)})`
        ),
        ...gone.map(
          (one) =>
            `${one.command.slice(0, 120)} (${workWords.leftRunningGoneFirst})`
        ),
      ].join(", ")}`
    );
  };

  return {
    /**
     * Session `instanceId`'s model called a shell in its harness process
     * `pid`: its tree is read from now while its shell calls run.
     */
    commandStarted(instanceId: string, pid: number): void {
      stop(instanceId);
      schedule(instanceId, pid, RECORD_FIRST_MS);
    },

    /** No shell call of session `instanceId` runs any more: its readings stop, and what they hold stays. */
    commandsEnded(instanceId: string): void {
      stop(instanceId);
    },

    /**
     * A harness process of session `instanceId` has gone: what each dead one
     * left running of its recorded tree ends, each named in the log. A
     * harness process that still runs (and is no zombie its parent has yet
     * to reap) keeps its record.
     */
    async processGone(instanceId: string): Promise<void> {
      stop(instanceId);
      const records = recorded.get(instanceId);
      if (!records) {
        return;
      }
      const table = await processTable();
      const alive = (held: Recorded): boolean =>
        table.some(
          (row) =>
            row.pid === held.root.pid &&
            row.started === held.root.started &&
            !row.state.startsWith("Z")
        );
      const dead = records.filter((held) => !alive(held));
      if (dead.length === 0) {
        return;
      }
      const living = records.filter(alive);
      if (living.length > 0) {
        recorded.set(instanceId, living);
      } else {
        recorded.delete(instanceId);
      }
      const rows = await processLineage();
      const left = leftOf(rows, dead);
      const running = new Map(rows.map((row) => [row.pid, row.started]));
      const gone = dead.flatMap((held) =>
        [...held.tree].flatMap(([at, one]) =>
          running.get(at) === one.started ? [] : [one]
        )
      );
      if (left.length > 0 || gone.length > 0) {
        await end(instanceId, left, gone);
      }
    },
  };
};

export type LeftRunning = ReturnType<typeof createLeftRunning>;
