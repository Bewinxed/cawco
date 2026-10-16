/**
 * packages/core/src/clock.ts as the stage 2 proof's builds have it
 * (scripts/build-binary.ts puts it in that module's place when `stubHarness`
 * is set; no published binary carries it). `CAWCO_PROOF_TIME_SCALE`, set by
 * prove-stage2.sh in its machines' service manager, divides each timed step's
 * length, so a scenario runs the real code path in seconds where the product
 * takes minutes. Unset, every length is the one written.
 *
 * `CAWCO_PROOF_RETIRING_LIST_MS`, set there too, is how late a retiring
 * keeper answers a `list` (3000: as late as a keeper on a loaded machine
 * answered one, past the agent's 2000 ms wait for it). Unset, at once.
 */
const asked = Number(process.env.CAWCO_PROOF_TIME_SCALE);

export const TIME_SCALE = Number.isFinite(asked) && asked > 1 ? asked : 1;

export const timerMs = (ms: number): number =>
  TIME_SCALE === 1 ? ms : Math.max(1, Math.round(ms / TIME_SCALE));

const late = Number(process.env.CAWCO_PROOF_RETIRING_LIST_MS);

export const RETIRING_LIST_MS = Number.isFinite(late) && late > 0 ? late : 0;
