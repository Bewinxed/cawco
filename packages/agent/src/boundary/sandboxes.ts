/**
 * The sandboxes running on this machine, and the TCP listeners and networks of
 * a workspace's boundaries.
 */

import { readFile } from "node:fs/promises";
import { processStart } from "@cawco/core/process-identity";
import { until } from "@cawco/core/until";
import { membershipName } from "../boundary-policy";
import { answering, inBoundaries, killAnswering } from "./processes";
import {
  type Held,
  holding,
  type Place,
  readHeld,
  readPlace,
  readRetiring,
  running,
  WHITESPACE,
} from "./state";

/**
 * What runs in workspace `workspace`'s boundary whose keeper child is `host`
 * (the current generation's or a retiring one's), for a reading of what its
 * commands left (agent leak-watch.ts). Linux: its sandbox, its init and every
 * process it held when its runner was ready; every process of the sandbox
 * descends from that init. macOS: of `pids`, every process that answers to
 * that generation's name ({@link answering}), wherever it moved. Undefined
 * when no generation of the workspace has that host.
 */
export const sandboxOf = async (
  workspace: string,
  host: number,
  pids: readonly number[]
): Promise<
  | { idle: readonly number[]; inner: number }
  | { members: readonly number[] }
  | undefined
> => {
  const generations = [
    await readHeld(workspace).catch(() => undefined),
    ...(await readRetiring(workspace)),
  ];
  const held = generations.find((one) => one?.pid === host);
  if (!held) {
    return;
  }
  if (process.platform === "darwin") {
    return {
      members: answering(
        inBoundaries(pids.map((pid) => ({ pid }))),
        membershipName(workspace, held.gen)
      ),
    };
  }
  return await readPlace(workspace, held.gen);
};

/** Whether `pid` is still a bwrap: a pid on record names no other process. */
export const isBwrap = async (pid: number): Promise<boolean> =>
  (await readFile(`/proc/${pid}/cmdline`, "utf8").catch(() => ""))
    .split("\0")[0]
    ?.endsWith("bwrap") ?? false;

/** Linux: one generation of a workspace whose sandbox runs now ({@link sandboxes}). */
export interface RunningSandbox {
  readonly boundary: Held;
  readonly place: Place;
  /** Its host's start, in clock ticks since boot (a later generation's host starts later); the current generation's reads as the newest. */
  readonly started: number;
}

/** Whether `outer` is a bwrap that `host` started: the sandbox the srt host `host` runs now. */
const hostsSandbox = async (host: number, outer: number): Promise<boolean> => {
  const text = await readFile(`/proc/${outer}/stat`, "utf8").catch(() => "");
  const parent = Number(text.slice(text.lastIndexOf(")") + 2).split(" ")[1]);
  return parent === host && (await isBwrap(outer));
};

/**
 * Linux: the generations of workspace `id` whose sandbox runs now, the
 * current one first, then each older one still running beside it (ensure.ts `handOver`), newest first. A generation's sandbox runs while the outer bwrap
 * its srt host names (state.ts `placeOf`) is alive and is that host's own child:
 * the host removes the name as it ends, and the bwrap ends with the host
 * (`--die-with-parent`). Read off the generation's own files and `/proc`
 * alone, never a keeper: what a keeper answers or not, during a keeper's
 * handover among others, says nothing of whether a sandbox runs.
 */
export const sandboxes = async (id: string): Promise<RunningSandbox[]> => {
  const held = await readHeld(id).catch(() => undefined);
  const named = new Set<string>();
  // During a handover the older one is both the record and retiring.
  const records = [
    ...(held ? [{ boundary: held, current: true }] : []),
    ...(await readRetiring(id)).map((boundary) => ({
      boundary,
      current: false,
    })),
  ].filter(({ boundary }) => {
    if (named.has(boundary.gen)) {
      return false;
    }
    named.add(boundary.gen);
    return true;
  });
  const found = await Promise.all(
    records.map(async ({ boundary, current }) => {
      const place = await readPlace(id, boundary.gen);
      if (!(place && (await hostsSandbox(boundary.pid, place.outer)))) {
        return;
      }
      return {
        boundary,
        place,
        started: current
          ? Number.POSITIVE_INFINITY
          : Number(await processStart(boundary.pid)) || 0,
      };
    })
  );
  return found
    .filter((one): one is RunningSandbox => one !== undefined)
    .sort((a, b) => (a.started === b.started ? 0 : b.started - a.started));
};

/** A TCP table's state for a listening socket (`/proc/net/tcp`'s `st`). */
const TCP_LISTEN = "0A";

/**
 * Linux: the TCP sockets listening in the network of the sandbox whose init
 * is `inner`, each with its port and socket inode, from `/proc/<inner>/net/tcp`
 * and `tcp6`: the tables of the network namespace that process is in. Empty
 * once it is gone.
 */
export const listeners = async (
  inner: number
): Promise<{ inode: string; port: number }[]> => {
  const tables = await Promise.all(
    ["tcp", "tcp6"].map((table) =>
      readFile(`/proc/${inner}/net/${table}`, "utf8").catch(() => "")
    )
  );
  return tables.flatMap((text) =>
    text
      .split("\n")
      .slice(1)
      .flatMap((line) => {
        // sl local_address rem_address st tx:rx tr:when retrnsmt uid timeout inode
        const [, local, , state, , , , , , inode] = line
          .trim()
          .split(WHITESPACE);
        if (state !== TCP_LISTEN || !local || !inode) {
          return [];
        }
        return [
          {
            port: Number.parseInt(local.slice(local.indexOf(":") + 1), 16),
            inode,
          },
        ];
      })
  );
};

/**
 * Where a workspace's servers listen: on Linux each network of a generation
 * whose sandbox runs ({@link sandboxes}), named by its sandbox's init
 * (`inner`), the current one first, then each older one newest first: a port
 * is served from the newest generation that listens on it, so a server one
 * generation started is reached over one an older generation still runs on
 * the same port. On macOS, which gives a boundary no network of its own, the
 * host's (`host`) while its boundary runs. Empty when no boundary of the
 * workspace runs on this machine.
 */
export const workspaceNetworks = async (
  id: string
): Promise<({ inner: number } | "host")[]> => {
  if (process.platform === "linux") {
    return (await sandboxes(id)).map(({ place }) => ({ inner: place.inner }));
  }
  const held = await readHeld(id).catch(() => undefined);
  const boundaries = [...(held ? [held] : []), ...(await readRetiring(id))];
  for (const boundary of boundaries) {
    if (await running(id, boundary)) {
      return ["host"];
    }
  }
  return [];
};

/**
 * macOS: SIGKILLs every process any boundary of workspace `id` started, of
 * every generation, recorded or not, but those of the generations `keep`
 * names, by the name each answers to ({@link killAnswering}): what a runner
 * started outlives it there. Nothing on Linux, where each sandbox's
 * processes end with it (stop.ts `stopBoundary`).
 */
export const endMembers = async (
  id: string,
  keep: readonly string[] = []
): Promise<void> => {
  await killAnswering(
    membershipName(id),
    keep.map((gen) => membershipName(id, gen))
  );
};

/** Waits up to `ms` for sessiond to hold `procId` no more: whether it is gone. */
export const goneWithin = async (
  procId: string,
  ms: number
): Promise<boolean> =>
  await until(async () => !(await holding(procId)), {
    deadline: Date.now() + ms,
    every: 20,
  });
