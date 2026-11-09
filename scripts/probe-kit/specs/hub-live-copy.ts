/**
 * Updates › a hub started on a copy of a live hub's database answers what
 * the updater's trial probes, `GET /health` and this machine's row, within
 * the probe's 3 s, every second of the trial's confirmation (core
 * binary-health.ts `PROBE_TIMEOUT_MS`; cli binary-apply.ts `verify` holds
 * 60 s), and its loop is never held long enough to say so.
 *
 * 2026-11-05 09:29Z, obelisk, nightly 6809: the trial went healthy at 1.9 s,
 * then "the hub does not answer (GET http://127.0.0.1:3456/health: no
 * answer within 3002ms)" again and again until its deadline, and the build
 * was rolled back. The hub's journal: "[loop] the hub's loop was held
 * 15326 ms; … most of the stall is in no marked section", every ten
 * seconds or so; 6804 and 6801 had the same holds and passed only by luck
 * of a quiet minute. On a copy of that hub's database (643 MB: 6,140
 * sessions, 1,628 artifacts, 256 owed sends, 4 sessions held at their
 * limit), this hub alone, no dashboard and no other machine, was held 5 to
 * 8 s at each at-limit look: the look asked Needs you's lane once per
 * session, and the lane read every waiting artifact again for each
 * (artifacts/lane.ts), and each of its changes scanned every owed send of
 * every machine for the limit's (sends.ts `releaseLimitHeld`).
 *
 * The scratch fleet seeded to row counts (hub-restart-load) holds no such
 * shape, so this spec takes a real database: PROBE_HUB_DB names a copy
 * (`sqlite3 cawco.db ".backup copy.db"`, or the `cawco.db.migrated-<version>`
 * a rollback leaves). It is copied again into the fleet's sandbox; the copy
 * named is never written. Without it the spec fails, saying so.
 *
 * (a) Every probe of `/health` and of this machine's row in {@link WATCH_MS}
 *     is answered within the trial's 3 s.
 * (b) The hub's log says no hold of its loop of 5 s or more ("[loop] the
 *     hub's loop was held <ms> ms", its own tick's line, hub-loop.ts
 *     `HUB_LATE_MS`), the lines obelisk's journal held every ten seconds.
 *
 * `PROBE_CPU_PROF=1` writes the hub's CPU profile (Chrome .cpuprofile) to
 * the spec's folder.
 *
 *   PROBE_HUB_DB=/path/to/copy.db bun scripts/probe-kit/run.ts hub-live-copy
 */
import { copyFileSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readWithin } from "../../../packages/core/src/bounded";
import {
  fetchHub,
  type HubRequest,
  hubRequest,
} from "../../../packages/core/src/hub-request";
import { MACHINE } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

/** The trial's probe: once a second, each request given 3 s (core binary-health.ts). */
const PROBE_EVERY_MS = 1000;
const PROBE_TIMEOUT_MS = 3000;
/** How long the hub is probed: the trial's 60 s held, and the 30 s of looks before it. */
const WATCH_MS = 90_000;
/**
 * A hold of the hub's loop of 5 s or more, as its own tick says one once it
 * ends and its watch says one at 10 s while it lasts (hub-loop.ts
 * `HUB_LATE_MS`, core words/loop.ts): the lines obelisk's journal held.
 */
const HELD =
  /\[loop\] the hub's loop (?:was held \d+ ms|has been held \d+ s)[^\n]*/gu;
/** The watch's line for any hold it saw (2 s or more), counted and said, not failed. */
const BRIEF_HOLD = /\[loop\] the hub's loop was held about \d+ s/gu;

/** One probe of `url`, as the trial makes it: its time to answer, or null for none within the probe's bound. */
const probe = async (
  base: string,
  request: HubRequest
): Promise<number | null> => {
  const from = performance.now();
  const read = await readWithin(PROBE_TIMEOUT_MS, async (signal) => {
    const response = await fetchHub(fetch, base, request, { signal });
    await response.arrayBuffer();
  }).catch(() => undefined);
  return read?.kind === "answered"
    ? Math.round(performance.now() - from)
    : null;
};

async function run(kit: Kit): Promise<void> {
  const source = process.env.PROBE_HUB_DB;
  if (!(source && existsSync(source))) {
    throw new Error(
      `PROBE_HUB_DB names no database (${source ?? "unset"}): this spec runs on a copy of a live hub's`
    );
  }
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  await fleet.stop("hub");
  // The copy in the fleet's place, its own WAL gone first: a stale -wal
  // beside another file is never this one's.
  const dbPath = fleet.env.CAWCO_DB_PATH ?? "";
  rmSync(`${dbPath}-wal`, { force: true });
  rmSync(`${dbPath}-shm`, { force: true });
  copyFileSync(source, dbPath);
  const profile = process.env.PROBE_CPU_PROF === "1";
  // Profiled, the hub ends itself as the watch ends: Bun writes the profile
  // on an exit of the process's own (hub-restart-load says why).
  const ending = join(kit.out, "profile-exit.ts");
  if (profile) {
    writeFileSync(
      ending,
      `setTimeout(() => process.exit(0), ${WATCH_MS + 20_000}).unref?.();\n`
    );
  }
  const mark = await fleet.logMark("hub");
  fleet.launch(
    "hub",
    [],
    profile
      ? {
          BUN_OPTIONS: `--cpu-prof --cpu-prof-dir=${kit.out} --preload ${ending}`,
        }
      : {}
  );
  await fleet.hubUp();
  const health = hubRequest("GET /health");
  const row = hubRequest("GET /api/agents/:machineId", {
    path: { machineId: MACHINE },
  });
  const reads: { at: number; health: number | null; row: number | null }[] = [];
  const from = Date.now();
  while (Date.now() - from < WATCH_MS) {
    const at = Date.now() - from;
    const [h, r] = await Promise.all([
      probe(fleet.base, health),
      probe(fleet.base, row),
    ]);
    reads.push({ at, health: h, row: r });
    const spent = Date.now() - from - at;
    await Bun.sleep(Math.max(0, PROBE_EVERY_MS - spent));
  }
  writeFileSync(join(kit.out, "probes.json"), JSON.stringify(reads, null, 1));
  const missed = reads.filter((one) => one.health === null || one.row === null);
  const slowest = Math.max(
    ...reads.map((one) =>
      Math.max(one.health ?? PROBE_TIMEOUT_MS, one.row ?? PROBE_TIMEOUT_MS)
    )
  );
  kit.check(
    `a: on a copy of a live hub's database, every probe of /health and this machine's row in ${WATCH_MS / 1000} s is answered within the trial's ${PROBE_TIMEOUT_MS / 1000} s`,
    missed.length === 0,
    `${reads.length} probes, ${missed.length} unanswered (at ${missed.map((one) => `${(one.at / 1000).toFixed(0)}s`).join(", ") || "none"}), slowest ${slowest} ms; each probe in probes.json`
  );
  const logged = await mark.since();
  const held = logged.match(HELD) ?? [];
  kit.note(
    `the watch's lines for holds of 2 s or more: ${(logged.match(BRIEF_HOLD) ?? []).length}`
  );
  kit.check(
    "b: the hub's log says no hold of its loop of 5 s or more",
    held.length === 0,
    held.length === 0
      ? "no [loop] hold line"
      : `${held.length} hold line(s), the first: ${held[0]?.slice(0, 300)}`
  );
}

export default {
  group: "Speed",
  name: "hub-live-copy",
  run,
} satisfies Spec;
