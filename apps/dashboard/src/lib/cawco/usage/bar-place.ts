/**
 * A moment's place on a bar of spans laid end to end, the house's one
 * mapping of time onto a line (DESIGN.md, the relay bar): the spans share the
 * bar's width less the gaps between them in proportion to their lengths, so a
 * moment inside the k-th span sits at its share of that width plus the k gaps
 * before it. The relay draws its hours by it; a routine's schedule strip draws
 * its runs by it (one span, no gaps).
 *
 * `at` and `spans` are in one unit (ms); `gap` is a CSS length. The answer is
 * a CSS length for `inset-inline-start`.
 */
export function barPlace(
  at: number,
  spans: readonly number[],
  gap: string
): string {
  const total = spans.reduce((sum, span) => sum + span, 0);
  const gaps = Math.max(0, spans.length - 1);
  if (total <= 0) {
    return "0%";
  }
  let before = 0;
  let k = 0;
  for (const span of spans) {
    if (at <= before + span) {
      break;
    }
    before += span;
    k += 1;
  }
  const share = Math.min(1, Math.max(0, at / total));
  return `calc((100% - ${gaps} * ${gap}) * ${share.toFixed(6)} + ${Math.min(k, gaps)} * ${gap})`;
}
