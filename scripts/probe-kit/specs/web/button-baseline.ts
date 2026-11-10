/**
 * The rendered checks' baseline rule (rendered-checks.ts): a control in a
 * row set on baselines (`items-baseline`) stands its words on the line its
 * neighbour's words stand on, within 1px. A kit Button with no icon stood
 * about 6px high beside a paragraph in such a row: its icon slot, folded and
 * empty, is its first box, and a box with no words gives its bottom edge for
 * a baseline (design.css `icon-swap` now draws a zero-size line at its
 * centre for one).
 *
 * Planted, the rule's own cases:
 *
 *  1. off its line by an empty slot: a button whose first box is an empty
 *     zero-size inline-flex slot, its label after it, beside a paragraph: the
 *     rule names the button.
 *  2. words alone: the same button with no slot: nothing found.
 *  3. wrapped: a paragraph that fills its line, the button wrapped onto the
 *     next one alone: each flex line read apart, nothing found.
 *
 * The kit's own Button, on the artifact panel's bench (`/dev/artifact-panel`),
 * at the desk (1440) and the phone (390):
 *
 *  4. `gone`: PinCard's notice, "The element this was pinned to is gone"
 *     beside its outline Pin it somewhere else, set on baselines: the
 *     label's baseline within 1px of the notice's, measured, and the rule
 *     finds nothing on the page.
 *  5. `place`: the same row, its Button saying Cancel.
 *  6. `unsent`: PinCard's other notice, why the comment wasn't sent beside
 *     its outline Try again, the same.
 *
 *   bun scripts/probe-kit/run.ts web button-baseline
 */
import { open, settle } from "../../kit";
import { type CheckName, RenderedChecks, RULES } from "../../rendered-checks";
import type { Kit, Spec } from "../../spec";

const READ: CheckName = "baseline";
const BENCH = "/dev/artifact-panel";
/** Each bench state, and PinCard's notice row it shows. */
const ROWS = {
  gone: '[data-slot="gone"]',
  place: '[data-slot="gone"]',
  unsent: '[data-slot="not-sent"]',
} as const;
/** Within this many px of the notice's baseline. */
const ON_LINE = 1;

const BASE = `<!doctype html>
<meta name="viewport" content="width=device-width">
<style>
  *, ::before, ::after { box-sizing: border-box; }
  body { margin: 0; padding: 40px; font: 13px/20px sans-serif; background: #f6f3ee; color: #2b2622; }
  .row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; inline-size: 480px; }
  .row p { margin: 0; }
  button { display: inline-flex; align-items: center; gap: 4px; block-size: 28px; padding: 0 10px; font: 500 13px/20px sans-serif; border: 1px solid #c9c0b4; border-radius: 8px; background: #fff; color: inherit; }
  .slot { display: inline-flex; inline-size: 0; block-size: 0; }
</style>`;

interface Fixture {
  html: string;
  /** The element the rule names, by its words; none when it finds nothing. */
  want?: string;
}

const FIXTURES: Record<string, Fixture> = {
  "off its line by an empty slot": {
    want: "Read its log",
    html: `${BASE}<div class="row"><p>The nightly build stopped at its third step.</p><button type="button"><span class="slot"></span><span>Read its log</span></button></div>`,
  },
  "words alone": {
    html: `${BASE}<div class="row"><p>The nightly build stopped at its third step.</p><button type="button"><span>Read its log</span></button></div>`,
  },
  wrapped: {
    html: `${BASE}<div class="row"><p style="inline-size: 100%">The nightly build stopped at its third step, past its time.</p><button type="button"><span class="slot"></span><span>Read its log</span></button></div>`,
  },
};

interface RowRead {
  /** The Button's words. */
  label: string;
  /** The Button's label's baseline less the notice's, px. */
  off: number;
}

/**
 * The notice row's two baselines, each a text run's line box top plus the
 * font's ascent share of its height, as the rule reads them.
 */
function readRow(selector: string): RowRead | null {
  const row = document.querySelector(selector);
  const notice = row?.querySelector("p");
  const button = row?.querySelector("button");
  if (!(notice && button)) {
    return null;
  }
  const measure = document.createElement("canvas").getContext("2d");
  const baselineOf = (holder: Element): number | null => {
    const walker = document.createTreeWalker(holder, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const node = n as Text;
      if (!(node.data.trim() && node.parentElement && measure)) {
        continue;
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      const box = [...range.getClientRects()].find((r) => r.width > 1);
      if (!box) {
        continue;
      }
      const s = getComputedStyle(node.parentElement);
      measure.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
      const m = measure.measureText(node.data.trim());
      return (
        box.top +
        (box.height * m.fontBoundingBoxAscent) /
          (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)
      );
    }
    return null;
  };
  const said = baselineOf(notice);
  const label = baselineOf(button);
  return said === null || label === null
    ? null
    : {
        label: button.textContent?.trim() ?? "",
        off: Math.round((label - said) * 100) / 100,
      };
}

async function planted(kit: Kit, checks: RenderedChecks) {
  const page = await kit.page("desk");
  for (const [label, fixture] of Object.entries(FIXTURES)) {
    await page.setContent(fixture.html);
    const read = await checks.at(page, label);
    const found = read.findings.filter((one) => one.rule === READ);
    const said =
      found.length > 0
        ? found.map((one) => `${one.element}: ${one.measured}`).join(" | ")
        : "0 findings";
    const { want } = fixture;
    kit.check(
      want ? `${label}, names “${want}”` : `${label}, finds nothing`,
      want
        ? found.some((one) => one.element.includes(want))
        : found.length === 0,
      said
    );
  }
  await page.close();
}

async function bench(
  kit: Kit,
  checks: RenderedChecks,
  at: string,
  view: "desk" | "phone"
) {
  const page = await kit.page(view);
  for (const [state, selector] of Object.entries(ROWS)) {
    await open(page, `${at}${BENCH}?state=${state}`, `${selector} button`);
    await settle(page);
    const where = `${view} ${state}`;
    const row = await page.evaluate(readRow, selector);
    kit.check(
      `${where}, PinCard's notice and its “${row?.label}” share a baseline (${row?.off}px off, within ${ON_LINE}px)`,
      !!row && Math.abs(row.off) <= ON_LINE,
      JSON.stringify(row)
    );
    const read = await checks.at(page, where);
    const found = read.findings.filter((one) => one.rule === READ);
    kit.check(
      `${where}, the rule finds nothing on the bench`,
      found.length === 0,
      found.length > 0
        ? found.map((one) => `${one.element}: ${one.measured}`).join(" | ")
        : "0 findings"
    );
  }
  await page.context().close();
}

const spec: Spec = {
  group: "The probe kit's own rig",
  name: "button-baseline",
  run: async (kit) => {
    const why = "button-baseline proves its own rule alone";
    const checks = new RenderedChecks(kit, "button-baseline", {
      exempt: Object.fromEntries(
        RULES.filter((rule) => rule !== READ).map((rule) => [rule, why])
      ),
      noImpeccable: why,
    });
    await planted(kit, checks);
    const at = await kit.bench();
    await bench(kit, checks, at, "desk");
    await bench(kit, checks, at, "phone");
  },
};
export default spec;
