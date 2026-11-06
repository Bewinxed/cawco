/**
 * The rendered checks' glyph-place rule (rendered-checks.ts) fires on the
 * counted bar items the owner caught on the artifact panel's head, and
 * stays quiet on the item drawn right.
 *
 * Drawn wrong, each names its control:
 *
 *  1. count beside: a Comments item that keeps room after its bubble for
 *     its count, so its fill is flush on its leading side and wide on its
 *     trailing one, the glyph off its centre (his pin: "the hover highlight
 *     has no padding from the left, and has lots of space on the right").
 *  2. badge on the glyph: the count drawn as a dark oval laid over the
 *     bubble's middle, on more than a fifth of its ink.
 *
 * Drawn right, the rule finds nothing:
 *
 *  3. corner badge: the counted item its neighbours' size, the glyph at
 *     its centre, the count a 16px badge on the item's top edge, its
 *     trailing end fixed half a badge past the glyph's trailing edge,
 *     covering that corner of a bubble and of a folder; at 3, 12 and 150,
 *     beside a plain neighbour.
 *  4. wide count over its own glyph: 1500 grows toward its own bubble, as
 *     an app icon's badge grows over its icon, and leaves Reload's alone.
 *
 * Drawn wrong again:
 *
 *  5. badge over a neighbour: a count that grows toward the trailing side,
 *     standing lower, lies on the next item's folder (a neighbour's ink at
 *     all is a finding).
 *  6. words: a control with its name beside its glyph is not read.
 *  7. off a bar: a lone glyph button on the page is not read.
 *  8. bare on the bar: a glyph standing off its 44px box's centre on a
 *     bar's ground, in no glass (the phone's sidebar toggle on the tabs'
 *     line), is not read.
 *
 *   bun scripts/probe-kit/run.ts web glyph-place
 */
import type { Spec } from "../../kit";
import { type CheckName, RenderedChecks, RULES } from "../../rendered-checks";

const READ: CheckName = "glyph-place";

const BASE = `<!doctype html>
<meta name="viewport" content="width=device-width">
<style>
  *, ::before, ::after { box-sizing: border-box; }
  body { margin: 0; padding: 40px; font: 13px/20px sans-serif; background: #f6f3ee; color: #2b2622; }
  button { font: inherit; color: inherit; border: 0; background: none; padding: 0; }
  header { display: flex; align-items: center; block-size: 44px; }
  .glass { display: inline-flex; align-items: center; gap: 4px; block-size: 36px; padding: 4px; border-radius: 999px; background: #fff; }
  .glass button { position: relative; display: inline-flex; align-items: center; justify-content: center; block-size: 28px; min-inline-size: 28px; border-radius: 5px; background: #e6e0d6; }
  .glass svg { inline-size: 20px; block-size: 20px; flex: none; }
  .badge { position: absolute; top: -8px; inset-inline-end: -4px; display: grid; place-items: center; block-size: 16px; min-inline-size: 16px; padding-inline: 4px; border-radius: 999px; background: #2b2622; color: #fff; font: 500 13px/1 sans-serif; }
</style>`;

const GLYPH = `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="currentColor"/></svg>`;
/** A folder's shape: a rounded box filling its grid, ink in every corner but the round. */
const FOLDER = `<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2" y="3" width="16" height="14" rx="3" fill="currentColor"/></svg>`;

interface Fixture {
  html: string;
  /** The control the rule must name (its selector holds this); none for a page drawn right. */
  want: string | null;
}

const FIXTURES: Record<string, Fixture> = {
  "count beside": {
    html: `${BASE}<header><div class="glass">
  <button class="comments" type="button" aria-label="Comments, 5" style="padding-inline: 0 14px; gap: 2px">${GLYPH}<span>5</span></button>
  <button type="button" aria-label="Reload">${GLYPH}</button>
</div></header>`,
    want: "button.comments",
  },
  "badge on the glyph": {
    html: `${BASE}<header><div class="glass">
  <button class="comments" type="button" aria-label="Comments, 5">${GLYPH}<span class="badge" style="top: 6px; inset-inline-start: 6px">5</span></button>
  <button type="button" aria-label="Reload">${GLYPH}</button>
</div></header>`,
    want: "button.comments",
  },
  "corner badge": {
    html: `${BASE}<header><div class="glass">
  <button type="button" aria-label="Comments, 3">${GLYPH}<span class="badge">3</span></button>
  <button type="button" aria-label="Machines, 12">${FOLDER}<span class="badge">12</span></button>
  <button type="button" aria-label="Reload">${GLYPH}</button>
  <button type="button" aria-label="Files, 150">${FOLDER}<span class="badge">150</span></button>
</div></header>`,
    want: null,
  },
  "wide count over its own glyph": {
    html: `${BASE}<header><div class="glass">
  <button type="button" aria-label="Comments, 1500">${GLYPH}<span class="badge">1500</span></button>
  <button type="button" aria-label="Reload">${GLYPH}</button>
</div></header>`,
    want: null,
  },
  "badge over a neighbour": {
    html: `${BASE}<header><div class="glass">
  <button class="files" type="button" aria-label="Files, 150">${FOLDER}<span class="badge" style="top: -4px; inset-inline: 16px auto">150</span></button>
  <button type="button" aria-label="Machines">${FOLDER}</button>
</div></header>`,
    want: "button.files",
  },
  words: {
    html: `${BASE}<header><div class="glass">
  <button type="button" style="padding-inline: 6px 10px; gap: 6px">${GLYPH}<span>Comments</span></button>
</div></header>`,
    want: null,
  },
  "bare on the bar": {
    html: `${BASE}<header><button type="button" aria-label="Open navigation" style="display: inline-flex; block-size: 44px; inline-size: 44px; padding: 17px 14px 9px 12px">${GLYPH}</button></header>`,
    want: null,
  },
  "off a bar": {
    html: `${BASE}<main><button type="button" aria-label="Reload" style="display: inline-flex; padding: 2px 8px 2px 2px">${GLYPH}</button></main>`,
    want: null,
  },
};

const spec: Spec = {
  group: "The probe kit's own rig",
  name: "glyph-place",
  run: async (kit) => {
    const page = await kit.page("desk");
    const why = "glyph-place proves its own rule alone";
    const checks = new RenderedChecks(kit, "glyph-place", {
      exempt: Object.fromEntries(
        RULES.filter((rule) => rule !== READ).map((rule) => [rule, why])
      ),
      noImpeccable: why,
    });
    for (const [label, fixture] of Object.entries(FIXTURES)) {
      await page.setContent(fixture.html);
      const read = await checks.at(page, label);
      const found = read.findings.filter((one) => one.rule === READ);
      const said =
        found.length > 0
          ? found.map((one) => `${one.element}: ${one.measured}`).join(" | ")
          : "0 findings";
      const { want } = fixture;
      if (want) {
        kit.check(
          `glyph-place: ${label}, names ${want}`,
          found.some((one) => one.element.includes(want)),
          said
        );
      } else {
        kit.check(
          `glyph-place: ${label}, finds nothing`,
          found.length === 0,
          said
        );
      }
    }
    await page.close();
  },
};
export default spec;
