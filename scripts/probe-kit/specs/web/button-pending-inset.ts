/**
 * A kit Button with a rest icon and a longer pending wording (`pendingLabel`)
 * is as wide as its pending words from the start, and keeps its icon and the
 * words it draws centred in that width: one inset at both ends, at rest and
 * while pending. Every empty-state Try again kept the pending words' width
 * with its resting content at its start, 12px from its left edge and 37.5px
 * from its right, and the rendered checks' uneven-inset rule named it
 * (`/dev/browser-panel?state=failed`, PreviewPane's failure states).
 *
 * On the button bench (`/motion/button-pending`), at the desk (1440) and the
 * phone (390), the `icon-wide` pair, a preview's Try again ("Trying
 * again…") at rest and pending:
 *
 *  1. each button's ink (its icon and its drawn words) stands within 1px as
 *     far from its left edge as from its right, measured;
 *  2. uneven-inset finds nothing on the bench.
 *
 *   bun scripts/probe-kit/run.ts web button-pending-inset
 */
import { open, settle } from "../../kit";
import { type CheckName, RenderedChecks, RULES } from "../../rendered-checks";
import type { Kit, Spec } from "../../spec";

const READ: CheckName = "uneven-inset";
const BENCH = "/motion/button-pending";
const CASES = ["icon-wide-rest", "icon-wide-pending"] as const;
/** Within this many px, left inset against right. Ours: clientWidth rounds each wording to the px. */
const EVEN = 1;

interface Inset {
  left: number;
  right: number;
}

/** The button's ink (its slot's shown glyph and its drawn words), from each edge, px. */
function readInset(kase: string): Inset | null {
  const button = document.querySelector(`[data-case="${kase}"]`);
  if (!button) {
    return null;
  }
  const box = button.getBoundingClientRect();
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  const take = (r: DOMRect) => {
    if (r.width > 0) {
      left = Math.min(left, r.left);
      right = Math.max(right, r.right);
    }
  };
  for (const svg of button.querySelectorAll(
    '[data-slot="btn-slot"] > [data-active="true"] svg'
  )) {
    take(svg.getBoundingClientRect());
  }
  const words = button.querySelector(
    '[data-slot="words"] > [data-active="true"]'
  );
  if (words) {
    const range = document.createRange();
    range.selectNodeContents(words);
    for (const r of range.getClientRects()) {
      take(r);
    }
  }
  return Number.isFinite(left)
    ? {
        left: Math.round((left - box.left) * 100) / 100,
        right: Math.round((box.right - right) * 100) / 100,
      }
    : null;
}

async function bench(
  kit: Kit,
  checks: RenderedChecks,
  at: string,
  view: "desk" | "phone"
) {
  const page = await kit.page(view);
  await open(page, `${at}${BENCH}`, `[data-case="${CASES[1]}"]`);
  await settle(page);
  const width = view === "desk" ? 1440 : 390;
  for (const kase of CASES) {
    const inset = await page.evaluate(readInset, kase);
    kit.check(
      `${width} ${kase}, its icon and words stand as far from its left edge as from its right (within ${EVEN}px)`,
      !!inset && Math.abs(inset.left - inset.right) <= EVEN,
      JSON.stringify(inset)
    );
  }
  const read = await checks.at(page, `${view} button bench`);
  const found = read.findings.filter((one) => one.rule === READ);
  kit.check(
    `${width}, uneven-inset finds nothing on the button bench`,
    found.length === 0,
    found.length > 0
      ? found.map((one) => `${one.element}: ${one.measured}`).join(" | ")
      : "0 findings"
  );
  await page.context().close();
}

const spec: Spec = {
  group: "The probe kit's own rig",
  name: "button-pending-inset",
  run: async (kit) => {
    const why = "button-pending-inset reads one rule alone";
    const checks = new RenderedChecks(kit, "button-pending-inset", {
      exempt: Object.fromEntries(
        RULES.filter((rule) => rule !== READ).map((rule) => [rule, why])
      ),
      noImpeccable: why,
    });
    const at = await kit.bench();
    await bench(kit, checks, at, "desk");
    await bench(kit, checks, at, "phone");
  },
};
export default spec;
