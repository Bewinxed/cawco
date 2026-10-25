/**
 * A probe run's heavy-work slot (core heavy-slots.ts): a heavy probe run (a
 * dashboard build, a dev or preview server, a browser, a scratch fleet)
 * takes one of the machine's slots before it starts any of them, and holds
 * it until its process ends. The pool is the machine's one: merge checks
 * and `bun run check` take from it too. quiet.ts only makes a timing leg
 * wait and measure again; it never kept a run from starting.
 *
 * The holder and every process it starts afterwards run at nice
 * {@link SLOT_NICE}. Sessions and their commands share sessiond's
 * `children` cgroup, which has no cpu controller of its own (its
 * subtree_control reads "pids"), so inside it the scheduler weighs tasks by
 * nice alone: a nice-10 task weighs 110 against a nice-0 task's 1024
 * (kernel/sched/core.c `sched_prio_to_weight`; "nice levels were changed to
 * be multiplicative", https://docs.kernel.org/scheduler/sched-nice-design.html),
 * so the person's own sessions win the CPU from the probes.
 */
import { readdirSync } from "node:fs";
import { getPriority, setPriority } from "node:os";
import { basename } from "node:path";
import {
  HEAVY_SLOT_ENV,
  heldAbove,
  machinePlace,
  type SlotLease,
  type SlotOptions,
  type SlotPlace,
  takeSlot,
} from "../../packages/core/src/heavy-slots";

/** The nice a lease's holder and its children run at. */
export const SLOT_NICE = 10;

/**
 * This process and every thread it has at {@link SLOT_NICE} at least
 * (never raised back: a run started at a lower priority keeps it): Linux
 * keeps a nice per thread, and a child takes the nice of the thread that
 * starts it.
 */
function lowerPriority(): void {
  const tids =
    process.platform === "linux"
      ? readdirSync("/proc/self/task").map(Number)
      : [0];
  for (const tid of tids) {
    try {
      if (getPriority(tid) < SLOT_NICE) {
        setPriority(tid, SLOT_NICE);
      }
    } catch {
      // A thread that ended between the listing and the call.
    }
  }
}

/**
 * Takes a slot of `place` for this process's run, and holds it under it:
 * every process it starts runs under the lease ({@link HEAVY_SLOT_ENV}) and
 * at {@link SLOT_NICE}. Null when an ancestor's lease already covers this
 * process (core `heldAbove`), whose words its environment then carries.
 */
export async function holdSlot(
  place: SlotPlace,
  what: string,
  options: SlotOptions = {}
): Promise<SlotLease | null> {
  const above = heldAbove(place);
  if (above) {
    process.env[HEAVY_SLOT_ENV] = above;
    return null;
  }
  const lease = await takeSlot(place, what, options);
  process.env[HEAVY_SLOT_ENV] = lease.words;
  lowerPriority();
  (options.say ?? console.log)(
    `… it and what it starts run at nice ${SLOT_NICE} or more`
  );
  return lease;
}

/** What this process's run is, in a holder's line: its specs once run.ts names them, else its script. */
let runName = basename(process.argv[1] ?? "probe", ".ts");

/** Names this process's run in its lease's line (run.ts: the specs it runs). */
export const nameProbeRun = (name: string): void => {
  runName = name;
};

let machineLease: Promise<SlotLease | null> | null = null;

/**
 * This process's slot on the machine, taken the first time anything heavy
 * starts and held until it ends. Every later call answers the same lease,
 * and a run whose wait ran out fails each heavy start after it at once.
 */
export const probeSlot = (): Promise<SlotLease | null> => {
  machineLease ??= holdSlot(machinePlace(), runName);
  return machineLease;
};
