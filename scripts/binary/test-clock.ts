/**
 * packages/core/src/clock.ts as the end-to-end test's builds have it
 * (scripts/build-binary.ts puts it in that module's place when `stubHarness`
 * is set; no published binary carries it). `CAWCO_TEST_TIME_SCALE`, set by
 * e2e-test.sh in its machines' service manager, divides each timed step's
 * length, so a scenario runs the real code path in seconds where the product
 * takes minutes. Unset, every length is the one written.
 */
const asked = Number(process.env.CAWCO_TEST_TIME_SCALE);

export const TIME_SCALE = Number.isFinite(asked) && asked > 1 ? asked : 1;

export const timerMs = (ms: number): number =>
  TIME_SCALE === 1 ? ms : Math.max(1, Math.round(ms / TIME_SCALE));
