/**
 * A heavy run is admitted for the memory it declares (core heavy-run.ts
 * `unitsOf`, `measureRoom`): real processes taking real slots through
 * scripts/lib/heavy-run.sh, four slots (`CAWCO_HEAVY_RUNS=4`) in a scratch
 * `HOME`'s workspaces' cache, the room's stall and CPU thresholds opened
 * wide and no reserve, so the slots and the run's own peak decide. It makes
 * no namespace, so it runs anywhere, a delegate's workspace included.
 *
 * On 2026-10-19 obelisk's nightly release ran on top of every probe and
 * gate holding a slot ("17.2G memory peak", its systemd unit said), and a
 * probe's browser closed in the window.
 *
 * 1. A run declaring more memory than the machine has (`CAWCO_HEAVY_PEAK_GIB`
 *    of 100000) waits on the measured room, its wait line naming its peak,
 *    though every slot is free.
 * 2. Probes P1, P2, P3 (no peak declared: a slot's 8 GiB) take a slot each.
 * 3. A host job R declaring 17 GiB, three slots' worth, waits while the
 *    probes hold the room: its wait line names its peak and the three slots
 *    it takes, and it has taken nothing.
 * 4. A fourth probe P4 then takes the last slot while R waits: R's wait
 *    starves no probe.
 * 5. P1 and P2 let go: R still waits (P3 and P4 hold two, and its three do
 *    not fit beside them). P3 lets go: R takes its three slots, after P3's
 *    release, and the slots dir holds four locked slots, R's three and P4's.
 * 6. A stream of probes, each holding its slot {@link STREAM_HOLD_MS} and
 *    two always waiting, keeps two or three of the four slots held at every
 *    moment, so three never come free together. A job S declaring 17 GiB,
 *    its reservation's clock scaled to {@link RESERVE_AFTER_S} s
 *    (`CAWCO_HEAVY_RESERVE_AFTER_S`, 15 min unset), starts in the stream:
 *    within {@link RESERVE_AFTER_S} s and two holds it takes its three
 *    slots, its wait line saying when its reservation started and how many
 *    it held so far, and a probe waiting while the reservation stood waited
 *    behind it, its line naming it.
 *
 *   bun scripts/probe-kit/run.ts heavy-peak
 */
import { readdirSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  openLockFile,
  tryLock,
  unlock,
} from "../../../packages/core/src/flock";
import { HEAVY_PEAK_ENV } from "../../../packages/core/src/heavy-run";
import { signalGroup } from "../../../packages/core/src/signal";
import { until } from "../../scratch-fleet";
import { type HeavyProbe, startHeavy } from "../heavy";
import type { Kit, Spec } from "../kit";

const SLOT_FILE = /^slot-\d+$/;
/** Leg 6's reservation clock, in place of 15 minutes. */
const RESERVE_AFTER_S = 20;
/** How long each probe of leg 6's stream holds its slot. */
const STREAM_HOLD_MS = 25_000;
/** Leg 6's bound: the reservation's wait, two of the stream's holds, and the gate's poll. */
const STREAM_BOUND_MS = RESERVE_AFTER_S * 1000 + 2 * STREAM_HOLD_MS + 10_000;

/** How many of the slots in `slots` are held now: each one whose lock this process cannot take. */
const heldSlots = (slots: string): number =>
  readdirSync(slots)
    .filter((name) => SLOT_FILE.test(name))
    .filter((name) => {
      const fd = openLockFile(join(slots, name), false);
      if (tryLock(fd)) {
        unlock(fd);
        return false;
      }
      unlock(fd);
      return true;
    }).length;

type Start = (
  name: string,
  peakGib?: number,
  more?: Record<string, string>
) => HeavyProbe;

/**
 * 6: a stream of probes that never leaves three slots free together, and a
 * 17 GiB job S in it, its reservation's clock scaled ({@link
 * RESERVE_AFTER_S}).
 */
const streamLeg = async (
  kit: Kit,
  slots: string,
  start: Start
): Promise<void> => {
  const stream: HeavyProbe[] = [];
  const released = new Set<HeavyProbe>();
  let n = 0;
  /** One look at the stream: each probe past its hold let go, and two waiting at all times. */
  const tend = () => {
    const now = BigInt(Date.now()) * 1_000_000n;
    for (const probe of stream) {
      const at = probe.took();
      if (at !== undefined && now - at > BigInt(STREAM_HOLD_MS) * 1_000_000n) {
        probe.release();
        released.add(probe);
      }
    }
    const waiting = stream.filter((probe) => probe.took() === undefined);
    for (let i = waiting.length; i < 2; i += 1) {
      n += 1;
      stream.push(start(`Q${n}`));
    }
  };
  /** The stream's probes holding a slot now. */
  const holding = () =>
    stream.filter((probe) => probe.took() !== undefined && !released.has(probe))
      .length;
  const ramp = Date.now();
  while (holding() < 2 && Date.now() - ramp < 60_000) {
    tend();
    // biome-ignore lint/performance/noAwaitInLoops: one look at the stream per tick
    await Bun.sleep(500);
  }
  const sStarted = Date.now();
  const s = start("S", 17, {
    CAWCO_HEAVY_RESERVE_AFTER_S: String(RESERVE_AFTER_S),
  });
  let mostFree = 0;
  let afterReservation: HeavyProbe | undefined;
  let reservedAt: number | undefined;
  while (s.took() === undefined && Date.now() - sStarted < STREAM_BOUND_MS) {
    tend();
    mostFree = Math.max(mostFree, 4 - heldSlots(slots));
    if (
      reservedAt === undefined &&
      s.said().includes("so it holds a reservation since")
    ) {
      reservedAt = Date.now();
    }
    // A probe that started after the reservation, still waiting.
    afterReservation ??=
      reservedAt === undefined
        ? undefined
        : stream.find(
            (probe) =>
              probe.took() === undefined &&
              probe.said().includes("holds a reservation since")
          );
    // biome-ignore lint/performance/noAwaitInLoops: one look at the stream per tick
    await Bun.sleep(500);
  }
  const sTook = s.took();
  const after = Date.now() - sStarted;
  const sSaid = s.said().trim();
  kit.check(
    `6: in a stream of probes that never left three slots free before it (at most ${mostFree} at once), a 17 GiB job holds a reservation after ${RESERVE_AFTER_S} s and takes its three slots within ${STREAM_BOUND_MS / 1000} s`,
    sTook !== undefined &&
      after <= STREAM_BOUND_MS &&
      sSaid.includes("so it holds a reservation since") &&
      sSaid.includes("of its 3 so far"),
    `S took: ${sTook ?? "nothing"}, ${Math.round(after / 1000)} s after it started; ${n} probes in the stream; S said:\n${sSaid || "nothing"}`
  );
  kit.check(
    "6: a probe waiting while the reservation stood waited behind it, its line naming it",
    afterReservation !== undefined,
    afterReservation?.said().trim() ?? "no waiting probe named a reservation"
  );
  s.release();
  for (const probe of stream) {
    probe.release();
  }
  await Promise.all([s.exited, ...stream.map((probe) => probe.exited)]);
};

const spec: Spec = {
  name: "heavy-peak",
  async run(kit: Kit) {
    const { check } = kit;
    const home = await mkdtemp(
      join(process.env.TMPDIR ?? tmpdir(), "heavy-peak-")
    );
    const slots = join(home, ".cawco", "workspace-cache", "heavy-runs");
    // The cache a workspace finds made: disk-room.sh reads its filesystem.
    await mkdir(slots, { recursive: true });
    const env = {
      ...process.env,
      HOME: home,
      CAWCO_HEAVY_RUNS: "4",
      CAWCO_HEAVY_MEMORY_STALL_MAX: "100",
      CAWCO_HEAVY_CPU_STALL_MAX: "100",
      CAWCO_HEAVY_RESERVE_GIB: "0",
      CAWCO_HEAVY_CPU_BUSY_MAX: "100",
      CAWCO_HEAVY_SWAP_FREE_MIN_PCT: "0",
      CAWCO_HEAVY_SWAP_USED_MAX_PCT: "100",
      [HEAVY_PEAK_ENV]: undefined,
    };
    const runs: HeavyProbe[] = [];
    const start = (
      name: string,
      peakGib?: number,
      more: Record<string, string> = {}
    ) => {
      const run = startHeavy(
        home,
        {
          ...env,
          ...more,
          ...(peakGib === undefined
            ? {}
            : { [HEAVY_PEAK_ENV]: String(peakGib) }),
        },
        name,
        { hold: true }
      );
      runs.push(run);
      return run;
    };
    const took = (run: HeavyProbe, name: string) =>
      until(`${name} took its slots`, run.took, Boolean, 30_000).catch(
        () => undefined
      );
    const waiting = (run: HeavyProbe, words: string) =>
      until(
        `a wait line with “${words}”`,
        () => run.said(),
        (said) => said.includes(words),
        30_000
      ).catch(() => run.said());
    try {
      // 1: a peak the machine cannot hold waits on the room, every slot free.
      const huge = start("HUGE", 100_000);
      const hugeWait = await waiting(huge, "CAWCO-QUEUE wait heavy:");
      await Bun.sleep(2000);
      check(
        "1: a run declaring 100000 GiB waits on the measured room, its wait line naming its peak, though every slot is free",
        hugeWait.includes("this machine's measured room:") &&
          hugeWait.includes("a run needs 100000.0 GiB: 100000.0 GiB for it") &&
          hugeWait.includes("✗") &&
          huge.took() === undefined,
        hugeWait.trim() || "no wait line"
      );
      huge.release();
      signalGroup(huge.group, "SIGTERM");
      await huge.exited;

      // 2: three probes at a slot's worth each.
      const p1 = start("P1");
      await took(p1, "P1");
      const p2 = start("P2");
      await took(p2, "P2");
      const p3 = start("P3");
      await took(p3, "P3");
      check(
        "2: probes P1, P2 and P3, declaring no peak, take a slot each",
        [p1, p2, p3].every((run) => run.took() !== undefined) &&
          heldSlots(slots) === 3,
        `took: ${[p1, p2, p3].map((run) => run.took() ?? "no").join(", ")}; slots held ${heldSlots(slots)}`
      );

      // 3: a 17 GiB host job waits while the probes hold the room.
      const r = start("R", 17);
      await waiting(r, "CAWCO-QUEUE wait heavy:");
      // Past the 10 s between two runs' starts, so what holds it is the slots.
      await Bun.sleep(12_000);
      const rWait = r.said();
      check(
        "3: a host job declaring 17 GiB waits while the probes hold the room, naming its peak and the three slots it takes",
        rWait.includes(
          "this run's peak of 17.0 GiB takes 3 of the 4 heavy-run slots"
        ) &&
          rWait.includes("and 3 are held, by") &&
          r.took() === undefined,
        `${rWait.trim() || "no wait line"}\nR took: ${r.took() ?? "nothing"}`
      );

      // 4: the waiting job starves no probe.
      const p4 = start("P4");
      const p4Took = await took(p4, "P4");
      check(
        "4: a fourth probe takes the last slot while the 17 GiB job waits",
        p4Took !== undefined && r.took() === undefined,
        `P4 took: ${p4Took ?? "nothing"}; R took: ${r.took() ?? "nothing"}; P4 said: ${p4.said().trim() || "nothing"}`
      );

      // 5: the job takes its three slots only once three are free.
      p1.release();
      p2.release();
      await Promise.all([p1.exited, p2.exited]);
      await Bun.sleep(3000);
      const rAfterTwo = r.took();
      const p3Released = BigInt(Date.now()) * 1_000_000n;
      p3.release();
      await p3.exited;
      const rTook = await took(r, "R");
      check(
        "5: with two probes gone the job still waits; with the third gone it takes its three slots, beside P4's",
        rAfterTwo === undefined &&
          rTook !== undefined &&
          rTook > p3Released &&
          heldSlots(slots) === 4,
        `R took after two let go: ${rAfterTwo ?? "nothing"}; after P3 let go: ${rTook ?? "nothing"} (P3 let go at ${p3Released}); slots held ${heldSlots(slots)}`
      );
      r.release();
      p4.release();
      await Promise.all([r.exited, p4.exited]);

      await streamLeg(kit, slots, start);
    } finally {
      for (const run of runs) {
        run.release();
        signalGroup(run.group, "SIGKILL");
      }
      await Promise.all(runs.map((run) => run.exited));
      await rm(home, { recursive: true, force: true });
    }
  },
};

export default spec;
