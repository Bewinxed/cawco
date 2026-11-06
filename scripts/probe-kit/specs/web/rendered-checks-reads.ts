/**
 * The rendered checks read a drawn page as a person sees it: planted pages of
 * their own, each a case a rule once misread or the rule must still catch,
 * so a rule's fix never quiets what it is for (rendered-checks.ts).
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
 *  6. coral, a chosen card: a card on the coral edge whose one control
 *     says it is current (beside a graph's connection handles, out of the
 *     tab order), and the view's coral act: the chosen card's own use
 *     (DESIGN.md, Map mode), no finding.
 *  7. coral, a card not chosen: the same card with nothing saying it is
 *     chosen: two corals, named.
 *  8. bar-room, a bar claiming a row: a side card's head in flow, its
 *     list's scroller starting at the head's foot: the rule names it.
 *  9. bar-room, a bar over its content: the same head floating over the
 *     card, the list's scroller running to the card's top under it, its
 *     first row clear by the scroller's padding: no finding.
 * 10. bar-room, a bar over a page: the head floating over a page in a
 *     frame that runs to the card's top: no finding.
 * 11. bar-room, a page under a bar's room: the head in flow over a page
 *     in a frame, another document whose layout is not the host's to
 *     inset: named, no finding.
 * 12. coral, his edit marks: three bare undo glyphs in coral ink, each
 *     after a value he changed (`data-edited`), and the view's coral act:
 *     his own marks, as checked controls are (the owner's pick on
 *     graph-dials-questions `coral`), no finding.
 * 13. coral, an edit mark that says words: the same mark with "Reset" in
 *     it beside the act: a second act, named.
 *
 *   bun scripts/probe-kit/run.ts web rendered-checks-reads
 */

import type { Spec } from "../../kit";
import { type CheckName, RenderedChecks } from "../../rendered-checks";

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

/** A card on the coral edge, and the view's one act on the coral fill: tokens.css coral-9 in the light scheme, oklch(64.5% 0.175 33). */
const CORAL = `<style>
  .card { position: relative; inline-size: 200px; margin: 16px; padding: 8px 12px; border: 1px solid #ccc; border-radius: 8px; }
  .card button { all: unset; }
  .card button::before { content: ""; position: absolute; inset: 0; }
  .chosen { border-color: oklch(64.5% 0.175 33); }
  .act { margin: 16px; padding: 8px 16px; border: 0; border-radius: 8px; background: oklch(64.5% 0.175 33); color: #fff; }
</style>`;

/** His edit marks: bare undo glyphs in the coral ink, no fill, no edge. */
const EDIT_MARKS = `<style>
  .row { display: flex; align-items: center; gap: 8px; margin: 8px 16px; }
  .mark { all: unset; display: grid; place-items: center; inline-size: 24px; block-size: 24px; color: oklch(64.5% 0.175 33); }
</style>`;
const GLYPH = `<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h11a5 5 0 0 1 0 10H8M4 9l4-4M4 9l4 4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
const editMark = (name: string, words = "") =>
  `<div class="row"><span>${name}</span><button class="mark" type="button" data-edited="${name}" aria-label="${name}: reset">${GLYPH}${words}</button></div>`;

/** A side card: its head, and a list of rows that scrolls. */
const CARD = `<style>
  .card { position: relative; display: flex; flex-direction: column; inline-size: 360px; block-size: 400px; margin: 16px; }
  .card header { display: flex; align-items: center; block-size: 52px; padding-inline: 12px; flex: none; }
  .card .float { position: absolute; inset-inline: 0; inset-block-start: 0; z-index: 1; }
  .list { flex: 1; min-block-size: 0; overflow-y: auto; }
  .card .under { padding-block-start: 52px; }
  .list p { margin: 0; padding: 12px; }
  .card iframe { flex: 1; border: 0; }
</style>`;
const ROWS = [
  "Plum",
  "Pear",
  "Quince",
  "Fig",
  "Damson",
  "Medlar",
  "Sloe",
  "Rowan",
  "Loquat",
]
  .map((row) => `<p>${row}</p>`)
  .join("");

interface Case {
  html: string;
  rule: CheckName;
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
  "a chosen card": {
    rule: "coral",
    want: "none",
    html: `${BASE}${CORAL}<div class="card chosen"><div role="button" tabindex="-1" aria-label="Handle"></div><button type="button" aria-current="true">Hub didn't answer</button><div role="button" tabindex="-1" aria-label="Handle"></div></div><button class="act" type="button">Create routine</button>`,
  },
  "a bar claiming a row": {
    rule: "bar-room",
    want: "finding",
    html: `${BASE}${CARD}<section class="card" aria-label="Task"><header data-slot="side-head"><h2>Run budget</h2></header><div class="list">${ROWS}</div></section>`,
  },
  "a bar over its content": {
    rule: "bar-room",
    want: "none",
    html: `${BASE}${CARD}<section class="card" aria-label="Task"><header class="float" data-slot="side-head"><h2>Run budget</h2></header><div class="list under">${ROWS}</div></section>`,
  },
  "a bar over a page": {
    rule: "bar-room",
    want: "none",
    html: `${BASE}${CARD}<section class="card" aria-label="Preview"><header class="float" data-slot="side-head"><h2>Onboarding</h2></header><iframe title="Onboarding" srcdoc="<p>Step one</p>"></iframe></section>`,
  },
  "a page under a bar's room": {
    rule: "bar-room",
    want: "none",
    html: `${BASE}${CARD}<section class="card" aria-label="Preview"><header data-slot="side-head"><h2>Onboarding</h2></header><iframe title="Onboarding" srcdoc="<p>Step one</p>"></iframe></section>`,
  },
  "his edit marks": {
    rule: "coral",
    want: "none",
    html: `${BASE}${CORAL}${EDIT_MARKS}${editMark("Corner radius")}${editMark("Field height")}${editMark("Field colour")}<button class="act" type="button">Create routine</button>`,
  },
  "an edit mark that says words": {
    rule: "coral",
    want: "finding",
    html: `${BASE}${CORAL}${EDIT_MARKS}${editMark("Corner radius", "Reset")}<button class="act" type="button">Create routine</button>`,
  },
  "a card not chosen": {
    rule: "coral",
    want: "finding",
    html: `${BASE}${CORAL}<div class="card chosen"><button type="button">Hub didn't answer</button></div><button class="act" type="button">Create routine</button>`,
  },
};

const spec: Spec = {
  group: "The probe kit's own rig",
  name: "rendered-checks-reads",
  run: async (kit) => {
    const page = await kit.page("phone");
    const checks = new RenderedChecks(kit, "rendered-checks-reads", {
      noImpeccable: "planted pages, read by the house's own code",
    });
    for (const [label, { html, rule, want }] of Object.entries(CASES)) {
      await page.setContent(html);
      const read = await checks.at(page, label);
      const named = read.findings.filter((one) => one.rule === rule);
      kit.check(
        want === "finding"
          ? `rendered-checks-reads: ${label}, ${rule} names it`
          : `rendered-checks-reads: ${label}, ${rule} finds nothing`,
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
