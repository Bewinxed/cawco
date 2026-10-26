/**
 * A timing leg waits until the MACHINE is quiet, not only its own cgroup
 * (quiet.ts `quietLeg`, core machine-room.ts `machinePressure`). On the host,
 * from a shell outside every workspace: the load is a user unit of its own
 * (`systemd-run --user`), a cgroup apart from the spec's, which a workspace
 * cannot start.
 *
 * On 2026-10-19 tab-return's gate read "PSI some avg10 0.14 / 0.08 / 0.04"
 * off its own cgroup's `cpu.pressure` while the machine's load was 25 to 30,
 * and its pointer budgets missed at load 24 to 43.
 *
 * 1. Twice as many CPU spinners as the machine has cores run in a unit of
 *    their own. A one-try leg with a 15 s wait is gated: its line names the
 *    machine's pressure files, reads the CPU's at or over the limit, and
 *    calls the leg CONTENDED. The spec's own cgroup's `cpu.pressure` is
 *    noted beside it.
 * 2. The unit stopped and the machine given up to 3 min to settle, the same
 *    leg's line names the same files and reads the CPU's lower than it did
 *    under the spinners.
 *
 * The gate is called through `gate` alone; on a checkout from before the
 * machine's reading, `gate(name, leg)` is `quietLeg(name, pressureFile(),
 * leg)` from specs/two-pane-perf.ts, which reads the spec's own cgroup.
 *
 *   bun scripts/probe-kit/run.ts quiet-gate
 */
import { readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { machineGauge } from "../../../packages/core/src/machine-room";
import type { Kit, Spec } from "../kit";
import { machineQuiet, quietLeg } from "../quiet";

/** The CPU reading at which the gate calls a leg contended. */
const QUIET_LIMIT = machineGauge().limit.cpu;

/** One leg through the kit's timing gate, one try, a short wait. */
const gate = (name: string, leg: () => Promise<void>): Promise<string> =>
  quietLeg(name, leg, { tries: 1, waitMs: 15_000 });

/** A leg's own work: a second of nothing, so only the gate's readings say anything. */
const idleLeg = () => Bun.sleep(1000);

/** The CPU values a leg's line reads, start / middle / end. */
const CPU_READ = /cpu ([\d.]+) \/ ([\d.]+) \/ ([\d.]+)/;
const cpuOf = (line: string): number[] =>
  (CPU_READ.exec(line)?.slice(1) ?? []).map(Number);

/** This process's own cgroup's `cpu.pressure` "some avg10", for the note; what it cannot read, said. */
const ownPressure = (): string => {
  try {
    const line = readFileSync("/proc/self/cgroup", "utf8")
      .split("\n")
      .find((one) => one.startsWith("0::"));
    const file = `/sys/fs/cgroup${line?.slice(3) ?? ""}/cpu.pressure`;
    return `${file}: ${readFileSync(file, "utf8").split("\n")[0]}`;
  } catch (error) {
    return `its own cgroup's cpu.pressure could not be read: ${String(error)}`;
  }
};

const run = async (kit: Kit): Promise<void> => {
  const unit = `cawco-quiet-gate-${crypto.randomUUID().slice(0, 8)}`;
  const spinners = availableParallelism() * 2;
  const started =
    await Bun.$`systemd-run --user --quiet --collect --unit=${unit} -p CPUWeight=1 -p Nice=19 sh -c ${`i=0; while [ $i -lt ${spinners} ]; do (while :; do :; done) & i=$((i + 1)); done; wait`}`
      .quiet()
      .nothrow();
  if (started.exitCode !== 0) {
    kit.check(
      "0: the load starts in a user unit of its own (run this spec from a host shell, outside every workspace)",
      false,
      started.stderr.toString().trim()
    );
    return;
  }
  let loaded = "";
  try {
    // The avg10 window, filled.
    await Bun.sleep(15_000);
    loaded = await gate("under the spinners", idleLeg);
    const own = ownPressure();
    const cpu = cpuOf(loaded);
    kit.check(
      `1: with ${spinners} spinners in a unit of their own, the leg names the machine's pressure, reads its CPU at ${QUIET_LIMIT} or over and is CONTENDED`,
      loaded.includes("/proc/pressure/cpu") &&
        loaded.includes("CONTENDED") &&
        cpu.length === 3 &&
        cpu.some((one) => one >= QUIET_LIMIT),
      `${loaded}\nthe spec's own cgroup meanwhile: ${own}`
    );
  } finally {
    await Bun.$`systemctl --user stop ${unit}`.quiet().nothrow();
  }
  const settled = Date.now();
  while (machineQuiet().cpu >= QUIET_LIMIT && Date.now() - settled < 180_000) {
    // biome-ignore lint/performance/noAwaitInLoops: one reading every 5 s until the machine settles
    await Bun.sleep(5000);
  }
  const after = await gate("after the spinners", idleLeg);
  const before = cpuOf(loaded);
  const now = cpuOf(after);
  kit.check(
    "2: with the spinners stopped, the leg names the same files and reads the machine's CPU pressure lower than under them",
    after.includes("/proc/pressure/cpu") &&
      now.length === 3 &&
      before.length === 3 &&
      Math.max(...now) < Math.max(...before),
    after
  );
};

const spec: Spec = {
  group: "The probe kit's own rig",
  name: "quiet-gate",
  host: "its load runs in a user unit of its own, which a workspace cannot start",
  run,
};

export default spec;
