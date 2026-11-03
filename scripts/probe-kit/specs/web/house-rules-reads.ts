/**
 * The house rules read a drawn page as a person sees it: planted pages of
 * their own, each a case a rule once misread or the rule must still catch,
 * so a rule's fix never quiets what it is for (house-rules.ts).
 *
 *  1. fat-row, a field column: three labelled selects stacked, each its
 *     label over its control. A field is no one-line row: no finding.
 *  2. fat-row, a page's column: a 56px bar, a pane whose scroller holds
 *     one short line, a foot. A pane is no row: no finding (the bar alone
 *     is one of three).
 *  3. fat-row, rows grown: three 64px rows of one 12px line each: the
 *     rule names them.
 *  4. text-overlap, a ruler: figures placed by their mark run into each
 *     other ("409600819200"), aria-hidden as a ruler is: the rule names
 *     them.
 *  5. text-overlap, cut by a scroller: a list scrolled under the drawer
 *     head standing over it, the rows' words outside the scroller's box
 *     drawn nowhere: no finding.
 *
 *   bun scripts/probe-kit/run.ts web house-rules-reads
 */
import { type HouseRule, HouseRules } from "../../house-rules";
import type { Spec } from "../../kit";

const BASE = `<!doctype html>
<meta name="viewport" content="width=device-width">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font: 16px/1.4 sans-serif; color: #222; background: #fff; }
  .col { display: flex; flex-direction: column; gap: 12px; inline-size: 360px; padding: 16px; }
  label { font-size: 12px; }
  select { inline-size: 100%; block-size: 36px; font: inherit; }
  .field { display: flex; flex-direction: column; gap: 8px; }
</style>`;

interface Case {
  html: string;
  rule: HouseRule;
  want: "finding" | "none";
}

const CASES: Record<string, Case> = {
  "a field column": {
    rule: "fat-row",
    want: "none",
    html: `${BASE}<div class="col">${["Repeat", "Hour", "Region"]
      .map(
        (name, i) =>
          `<div class="field"><label for="f${i}">${name}</label><select id="f${i}"><option>Every hour</option><option>Every day</option><option>Every weekday</option></select></div>`
      )
      .join("")}</div>`,
  },
  "a page's column": {
    rule: "fat-row",
    want: "none",
    html: `${BASE}<style>
  .page { display: flex; flex-direction: column; block-size: 600px; inline-size: 360px; }
  .bar { block-size: 56px; padding: 12px; font-size: 13px; }
  .pane { flex: 1; min-block-size: 0; display: flex; }
  .scroll { flex: 1; overflow-y: auto; padding: 16px; }
  .foot { block-size: 44px; padding: 12px; }
</style><div class="page"><div class="bar">Run budget</div><div class="pane"><div class="scroll"><p style="margin:0">Running</p></div></div><div class="foot">Steps</div></div>`,
  },
  "rows grown": {
    rule: "fat-row",
    want: "finding",
    html: `${BASE}<style>
  .rows { display: flex; flex-direction: column; inline-size: 360px; }
  .rows > div { block-size: 64px; display: flex; align-items: center; font-size: 12px; padding-inline: 12px; }
</style><div class="rows"><div>Just opened</div><div>Filled in</div><div>Every week</div></div>`,
  },
  "a ruler": {
    rule: "text-overlap",
    want: "finding",
    html: `${BASE}<style>
  .ruler { position: relative; block-size: 20px; inline-size: 200px; margin: 16px; font-size: 12px; }
  .ruler span { position: absolute; top: 0; transform: translateX(-50%); white-space: nowrap; }
</style><div class="ruler" aria-hidden="true">${[0, 409_600, 819_200, 1_228_800]
      .map(
        (mark, i) =>
          `<span style="inset-inline-start: ${i * 15 + 20}%">${mark}</span>`
      )
      .join("")}</div>`,
  },
  "cut by a scroller": {
    rule: "text-overlap",
    want: "none",
    html: `${BASE}<style>
  .sheet { position: relative; inline-size: 360px; block-size: 120px; margin: 16px; }
  .head { block-size: 44px; padding: 12px; }
  .list { block-size: 0; overflow-y: auto; }
  .list p { margin: 0; block-size: 44px; }
</style><div class="sheet"><div class="head">States</div><div class="list" style="margin-block-start: -44px"><p>Just opened</p><p>Filled in</p></div></div>`,
  },
};

const spec: Spec = {
  group: "The probe kit's own rig",
  name: "house-rules-reads",
  run: async (kit) => {
    const page = await kit.page("phone");
    const house = new HouseRules(kit, "house-rules-reads", {
      noImpeccable: "planted pages, read by the house's own code",
    });
    for (const [label, { html, rule, want }] of Object.entries(CASES)) {
      await page.setContent(html);
      const read = await house.at(page, label);
      const named = read.findings.filter((one) => one.rule === rule);
      kit.check(
        want === "finding"
          ? `house-rules-reads: ${label}, ${rule} names it`
          : `house-rules-reads: ${label}, ${rule} finds nothing`,
        want === "finding" ? named.length > 0 : named.length === 0,
        named.length > 0
          ? named.map((one) => `${one.element}: ${one.measured}`).join(" | ")
          : "0 findings"
      );
    }
    await page.close();
  },
};
export default spec;
