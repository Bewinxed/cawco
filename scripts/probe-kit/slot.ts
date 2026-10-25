/**
 * A probe run's heavy-work slot (core heavy-slots.ts): a heavy probe run (a
 * dashboard build, a dev or preview server, a browser, a scratch fleet)
 * takes one of the machine's slots before it starts any of them, and holds
 * it until its process ends. The pool is the machine's one: merge checks
 * and `bun run check` take from it too. quiet.ts only makes a timing leg
 * wait and measure again; it never kept a run from starting.
 *
 * The holder and every process it starts afterwards run at core
 * `HEAVY_NICE` and the idle I/O class (core `runInBackground`).
 */
import { basename } from "node:path";
import {
  HEAVY_NICE,
  HEAVY_SLOT_ENV,
  heldAbove,
  machinePlace,
  runInBackground,
  type SlotLease,
  type SlotOptions,
  type SlotPlace,
  takeSlot,
} from "../../packages/core/src/heavy-slots";

/**
 * Takes a slot of `place` for this process's run, and holds it under it:
 * every process it starts runs under the lease ({@link HEAVY_SLOT_ENV}).
 * Null when an ancestor's lease already covers this process (core
 * `heldAbove`), whose words its environment then carries. Either way this
 * process and what it starts afterwards run at core `HEAVY_NICE` and the
 * idle I/O class (core `runInBackground`), unless `background` is false
 * ({@link probeSlot} lowers its process at its first heavy start instead).
 */
export async function holdSlot(
  place: SlotPlace,
  what: string,
  options: SlotOptions = {},
  background = true
): Promise<SlotLease | null> {
  const above = heldAbove(place);
  const lease = above ? null : await takeSlot(place, what, options);
  process.env[HEAVY_SLOT_ENV] = above ?? lease?.words;
  if (background) {
    runInBackground();
    if (lease) {
      (options.say ?? console.log)(
        `… it and what it starts run at nice ${HEAVY_NICE} or more, in the idle I/O class`
      );
    }
  }
  return lease;
}

/** What this process's run is, in a holder's line: its specs once run.ts names them, else its script. */
let runName = basename(process.argv[1] ?? "probe", ".ts");

/** Names this process's run in its lease's line (run.ts: the specs it runs). */
export const nameProbeRun = (name: string): void => {
  runName = name;
};

let machineLease: Promise<SlotLease | null> | null = null;
/** Whether this process runs in the background yet (core `runInBackground`). */
let lowered = false;

/**
 * This process's slot on the machine, taken the first time anything heavy
 * starts and held until it ends. Every later call answers the same lease,
 * and a run whose wait ran out fails each heavy start after it at once.
 * From the first call with `background` on, this process and what it
 * starts run in the background ({@link holdSlot}); run.ts takes an
 * `ownHome` spec's slot with it off.
 */
export const probeSlot = async (
  background = true
): Promise<SlotLease | null> => {
  machineLease ??= holdSlot(machinePlace(), runName, {}, false);
  const lease = await machineLease;
  if (background && !lowered) {
    lowered = true;
    runInBackground();
    console.log(
      `… it and what it starts run at nice ${HEAVY_NICE} or more, in the idle I/O class`
    );
  }
  return lease;
};
