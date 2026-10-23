/**
 * Live work's one clock (DESIGN.md, Live work breathes; the owner's pick,
 * "One breath everywhere"): every breath, in the dashboard and in a
 * previewed page's overlay alike, begins its loops on the wall clock's
 * multiples of the breath's length. So two documents (the dashboard and the
 * page in its frame, each on a timeline of its own) breathe as one, and a
 * dot drawn again (the overlay redraws its pills) picks the breath up where
 * every other dot stands, never from its start.
 *
 * `timeOrigin` is the document's `performance.timeOrigin`, `at` a time on its
 * document timeline (a start time, or the timeline's current time), both ms;
 * `period` one breath, ms. Answers how far into a breath `at` stands, ms: a
 * breath started at `at` minus it is in step with every other.
 */
export const breathPhase = (
  timeOrigin: number,
  at: number,
  period: number
): number =>
  period > 0 ? (((timeOrigin + at) % period) + period) % period : 0;
