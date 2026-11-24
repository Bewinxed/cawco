/**
 * Caw's seat on the project head with his switch beside him (Component
 * Story Format 3, live components): the crow is the switch, fed the
 * fixtures (caw-seat-frame). Flip the switch and he wakes or falls asleep
 * in his seat; with what he started still running, turning him off asks
 * through the Caw-off confirm hung from the switch's glass. The meta's
 * `beforeEach` feeds the machines through the board's own writer, so the
 * confirm names them.
 */
import CawSeatFrame from "./caw-seat-frame.svelte";
import { seedStores } from "./caw-settings-play";

export default {
  title: "Caw/Caw's seat",
  component: CawSeatFrame,
  args: {
    projectId: "seat-awake",
    on: true,
    running: true,
    asked: null,
  },
  beforeEach: seedStores,
};

/** Caw awake in his seat, the switch on beside him. */
export const Awake = {};

/** Caw asleep in his seat, the switch off. */
export const Asleep = { args: { projectId: "seat-asleep", on: false } };

/** Turning him off while what he started still runs: the confirm comes down out of the switch's glass and asks which to stop. */
export const TurningOff = {
  args: { projectId: "seat-turning-off", asked: "off", height: 420 },
};
