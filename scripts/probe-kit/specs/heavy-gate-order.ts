/**
 * A landing gate's heavy run takes the next free slot before any leaf's
 * (core heavy-run.ts): real processes taking real slots through
 * scripts/lib/heavy-run.sh, one slot (`CAWCO_HEAVY_RUNS=1`) in a scratch
 * `HOME`'s workspaces' cache. The room's thresholds are opened wide for the
 * spec, so only the slot decides. It makes no namespace, so it runs anywhere,
 * a delegate's workspace included.
 *
 * - A leaf's run L1 holds the slot; a second leaf's run L2 waits behind it.
 * - Gate T arrives and waits: its ticket is in the slots dir, and L2's wait
 *   line names it. TERM to its group (the runner's way): within 3 s its
 *   ticket is gone and its run has ended.
 * - Gate K arrives, and is killed (KILL to its group): the ticket it leaves,
 *   held by nobody, is deleted by the next look within 3 s.
 * - Gates A, then B, arrive: B's wait line names A ("an earlier one waits"),
 *   and L2's names A.
 * - L1 lets the slot go: A takes it, then B, then L2, by the times each
 *   printed as it took it; no ticket is left.
 *
 *   bun scripts/probe-kit/run.ts heavy-gate-order
 */
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readWithin } from "../../../packages/core/src/bounded";
import { signalGroup } from "../../../packages/core/src/signal";
import { until } from "../../scratch-fleet";
import { type HeavyProbe, startHeavy, ticketsIn } from "../heavy";
import type { Kit, Spec } from "../kit";

/** A gate's words as the hub names one (work-items.ts `asStep`). */
const gateWords = (tag: string): string =>
  `the landing gate of “Probe ${tag}” (${tag.toLowerCase().repeat(8)}): order`;

const spec: Spec = {
  name: "heavy-gate-order",
  async run(kit: Kit) {
    const { check } = kit;
    const home = await mkdtemp(
      join(process.env.TMPDIR ?? tmpdir(), "heavy-gate-order-")
    );
    const slots = join(home, ".cawco", "workspace-cache", "heavy-runs");
    // The cache a workspace finds made: disk-room.sh reads its filesystem.
    await mkdir(slots, { recursive: true });
    const env = {
      ...process.env,
      HOME: home,
      CAWCO_HEAVY_RUNS: "1",
      CAWCO_HEAVY_MEMORY_STALL_MAX: "100",
      CAWCO_HEAVY_CPU_STALL_MAX: "100",
      CAWCO_HEAVY_RESERVE_GIB: "0",
      CAWCO_HEAVY_CPU_BUSY_MAX: "100",
    };
    const runs: HeavyProbe[] = [];
    const start = (
      name: string,
      options: { gate?: string; hold?: boolean } = {}
    ) => {
      const run = startHeavy(home, env, name, options);
      runs.push(run);
      return run;
    };
    const waiting = (run: HeavyProbe, words: string) =>
      until(
        `a wait line with “${words}”`,
        () => run.said(),
        (said) => said.includes(words),
        15_000
      ).catch(() => run.said());
    try {
      const l1 = start("L1", { hold: true });
      await until("L1 took the slot", l1.took, Boolean, 15_000);
      const l2 = start("L2");
      const l2Wait = await waiting(l2, "CAWCO-QUEUE wait heavy: all 1");
      check(
        "a leaf's run waits while another leaf's holds the one slot",
        l2Wait.includes("CAWCO-QUEUE wait heavy: all 1 heavy-run slots") &&
          l2.took() === undefined,
        l2Wait
      );

      // T: a waiting gate stopped the runner's way gives up its place.
      const t = start("T", { gate: gateWords("T") });
      const tTicket = await until(
        "T's ticket",
        () => ticketsIn(slots),
        (names) => names.length === 1,
        15_000
      ).catch(() => ticketsIn(slots));
      const l2BehindT = await waiting(l2, gateWords("T"));
      check(
        "a waiting gate holds a ticket in the slots dir, and the waiting leaf's line names that gate",
        tTicket.length === 1 &&
          l2BehindT.includes(
            `a landing gate waits for a heavy-run slot, and takes the next free one before any other run: ${gateWords("T")}`
          ),
        `tickets: ${tTicket.join(", ") || "none"}\nL2 said:\n${l2BehindT}`
      );
      const tSent = signalGroup(t.group, "SIGTERM");
      const tEnded =
        (await readWithin(3000, () => t.exited)).kind === "answered";
      const afterT = await until(
        "T's ticket gone",
        () => ticketsIn(slots),
        (names) => names.length === 0,
        3000
      ).catch(() => ticketsIn(slots));
      check(
        "TERM to a waiting gate's group: its run ends and its ticket is gone within 3 s",
        tSent === "sent" && tEnded && afterT.length === 0,
        `signal ${tSent}; ended ${tEnded}; tickets after: ${afterT.join(", ") || "none"}`
      );

      // K: a gate killed outright leaves a ticket nobody holds.
      const k = start("K", { gate: gateWords("K") });
      await until(
        "K's ticket",
        () => ticketsIn(slots),
        (names) => names.length === 1,
        15_000
      ).catch(() => undefined);
      const kSent = signalGroup(k.group, "SIGKILL");
      await k.exited;
      const afterK = await until(
        "K's ticket deleted",
        () => ticketsIn(slots),
        (names) => names.length === 0,
        3000
      ).catch(() => ticketsIn(slots));
      check(
        "KILL to a waiting gate: the ticket it leaves, held by nobody, is deleted by the next look within 3 s",
        kSent === "sent" && afterK.length === 0,
        `signal ${kSent}; tickets after: ${afterK.join(", ") || "none"}`
      );

      // A and B: gates in the order they came, both before the leaf.
      const a = start("A", { gate: gateWords("A") });
      await waiting(a, "CAWCO-QUEUE wait heavy");
      const b = start("B", { gate: gateWords("B") });
      const bWait = await waiting(b, "an earlier one waits");
      const l2BehindA = await waiting(l2, gateWords("A"));
      check(
        "a later gate waits behind the earlier one, naming it, and the leaf waits behind the first gate",
        bWait.includes(
          `landing gates take heavy-run slots in the order they came, and an earlier one waits: ${gateWords("A")}`
        ) && l2BehindA.includes(gateWords("A")),
        `B said:\n${bWait}\nL2 said:\n${l2BehindA}`
      );
      l1.release();
      const took = await until(
        "A, B and L2 took the slot",
        () => [a.took(), b.took(), l2.took()],
        (times) => times.every((time) => time !== undefined),
        30_000
      ).catch(() => [a.took(), b.took(), l2.took()]);
      const [aAt, bAt, l2At] = took;
      check(
        "the slot let go goes to gate A, then gate B, then the leaf that waited longest",
        aAt !== undefined &&
          bAt !== undefined &&
          l2At !== undefined &&
          aAt < bAt &&
          bAt < l2At,
        `took at (ns): A ${aAt}, B ${bAt}, L2 ${l2At}`
      );
      await Promise.all([a.exited, b.exited, l2.exited]);
      check(
        "no ticket is left once every run has ended",
        ticketsIn(slots).length === 0,
        ticketsIn(slots).join(", ") || "none"
      );
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
