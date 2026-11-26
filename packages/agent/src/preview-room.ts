/**
 * Room for live previews (stage.ts: each sheet's stage and each preview's
 * server, a pin's among them): what one costs, and whether the machine keeps
 * its margin once the next one runs. The owner's call on "What stays running
 * on a machine" (2026-11-19): up to {@link MAX_LIVE} live, the least recently
 * used put to sleep first, the limit sized by the machine's free memory at
 * the moment, with no setup step, so a small laptop runs two or three and a
 * large machine eight.
 */

import { CAWCO_ENV } from "@cawco/core/cawco-env";
import {
  type ProcessLineage,
  processArgs,
  processLineage,
  proportionalBytes,
} from "@cawco/core/process-identity";
import { answering, inBoundaries, inTree } from "./boundary/processes";
import { sandboxes } from "./boundary/sandboxes";
import { membershipName } from "./boundary-policy";
import { leastRoom } from "./machine-room";

/** The most previews live at once on one machine, whatever its memory: the owner's pick. */
export const MAX_LIVE = 8;

/**
 * What a preview is expected to take before any of its kind was measured on
 * this machine. Ours, set high on purpose: obelisk's one reading of pins'
 * servers (19 Nov, boundary/servers.ts) was eight Vite servers and a
 * headless Chromium in 2.3 GB, about 290 MB each, and a project the size of
 * the dashboard takes several times a starter's. 1 GiB holds either until
 * the first measurement replaces it.
 */
const STARTING_BYTES = 1024 ** 3;

/** The share of the machine's memory kept free: earlyoom's line, `-m` "default 10 %" of MemAvailable, under which it starts killing (github.com/rfjakob/earlyoom README). */
const KEPT_SHARE = 0.1;

/**
 * The memory kept free beside a preview, in bytes: earlyoom's line
 * ({@link KEPT_SHARE} of the machine) with a session's start on top of it
 * (machine-room.ts `leastRoom`, 1 GiB, what a session start waits for), so
 * previews never take the room an agent's next session needs, nor bring the
 * machine to the line where an OOM killer acts. 1.8 GiB on an 8 GiB laptop,
 * 19.8 GiB on a 188 GiB machine.
 */
export const marginOf = (total: number): number =>
  total * KEPT_SHARE + leastRoom();

/** A preview's two kinds: a sheet's stage host, or a preview's own server. */
export type PreviewKind = "serve" | "sheet";

/** Each preview's last measurement, by its stage's key: kept after it sleeps, its expected cost when it wakes. */
const measured = new Map<string, { bytes: number; kind: PreviewKind }>();

/**
 * What starting the preview `key` is expected to take: its own last
 * measurement; else the mean of the last measurement of each preview of its
 * kind; else {@link STARTING_BYTES}.
 */
export const expectedBytes = (key: string, kind: PreviewKind): number => {
  const own = measured.get(key);
  if (own) {
    return own.bytes;
  }
  const same = [...measured.values()].filter((one) => one.kind === kind);
  return same.length === 0
    ? STARTING_BYTES
    : same.reduce((sum, one) => sum + one.bytes, 0) / same.length;
};

/** The last measurement of preview `key`; undefined before its first. */
export const lastBytes = (key: string): number | undefined =>
  measured.get(key)?.bytes;

/** A live preview to measure: its stage's key (its processes' mark), its kind and the boundary it runs in. */
export interface LivePreview {
  readonly boundary: string;
  readonly key: string;
  readonly kind: PreviewKind;
}

/**
 * The processes of workspace `id`'s boundaries, read off `seen`: on Linux
 * each sandbox's init and everything below it (processes.ts `inTree`), on
 * macOS each that answers to the workspace's name (processes.ts `answering`).
 */
const boundaryPids = async (
  id: string,
  seen: readonly ProcessLineage[]
): Promise<number[]> => {
  if (process.platform === "linux") {
    const rows = seen.map((row) => ({ ...row, command: "" }));
    return (await sandboxes(id)).flatMap(({ place }) =>
      inTree(rows, place.inner).map((one) => one.pid)
    );
  }
  return answering(inBoundaries(seen), membershipName(id));
};

/**
 * Measures each of `live` as it runs, one read of the process table for
 * all: the sum of {@link proportionalBytes} (Linux PSS, the Mac's physical
 * footprint) over the processes of its boundary that carry its mark
 * (`CAWCO_STAGE_SERVER=<key>`, stage.ts `start`, which its command's shell
 * hands to all it starts). Each figure is kept as the preview's
 * ({@link expectedBytes}); one with no process found keeps its last.
 */
export const measure = async (live: readonly LivePreview[]): Promise<void> => {
  if (live.length === 0) {
    return;
  }
  const seen = await processLineage();
  // Each boundary's processes read once, however many previews run in it.
  const boundaries = [...new Set(live.map((one) => one.boundary))];
  const byBoundary = new Map(
    await Promise.all(
      boundaries.map(
        async (boundary) =>
          [boundary, await boundaryPids(boundary, seen)] as const
      )
    )
  );
  await Promise.all(
    live.map(async (one) => {
      const mark = `${CAWCO_ENV.stageServer}=${one.key}`;
      const pids = byBoundary.get(one.boundary) ?? [];
      const each = await Promise.all(
        pids.map(async (pid) =>
          ((await processArgs(pid))?.env ?? []).includes(mark)
            ? ((await proportionalBytes(pid)) ?? 0)
            : 0
        )
      );
      const bytes = each.reduce((sum, part) => sum + part, 0);
      if (bytes > 0) {
        measured.set(one.key, { bytes, kind: one.kind });
      }
    })
  );
};

const MIB = 1024 ** 2;

/** Bytes in words: MiB under a GiB, GiB with a tenth over. */
export const bytesWords = (bytes: number): string =>
  bytes < 1024 * MIB
    ? `${Math.round(bytes / MIB)} MiB`
    : `${(bytes / (1024 * MIB)).toFixed(1)} GiB`;
