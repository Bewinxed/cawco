/**
 * The agent's loop watch, held: `watchLoop` started as daemon.ts starts it,
 * then the loop held {@link HOLD_MS} in a marked section that spins on the
 * CPU, let go, and the process ended {@link AFTER_MS} later. Run inside the
 * compiled binary as `cawco proof-loop-held` (proof-runtime.ts), so the
 * watch from its own thread starts from the binary's embedded entry
 * (build-binary.ts, ./scripts/binary/loop-watch-worker.js) as it does in a
 * shipped agent. The probe kit's loop-held-said reads what it said.
 */
import { syncSection, watchLoop } from "../../packages/agent/src/loop-watch";

/** How long the loop is held: past the watch's second saying, at 30 s. */
export const HOLD_MS = 35_000;
/** The marked section the loop is held in. */
export const SECTION = "probe: a spin on the CPU";
/** When the hold begins, once the watch's thread is up. */
const START_MS = 2000;
/** How long after the hold the process lives, for the lines that end it. */
const AFTER_MS = 4000;

export const holdLoop = (): void => {
  watchLoop((line) => console.warn(line));
  setInterval(() => undefined, 1000);
  setTimeout(() => {
    syncSection(SECTION, () => {
      const end = Date.now() + HOLD_MS;
      while (Date.now() < end) {
        // Held on the CPU: no timer, socket or message runs here.
      }
    });
    setTimeout(() => process.exit(0), AFTER_MS);
  }, START_MS);
};
