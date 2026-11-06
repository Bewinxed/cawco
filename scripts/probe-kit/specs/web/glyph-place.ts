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
 *     bubble.
 *
 * Drawn right, the rule finds nothing:
 *
 *  3. corner badge: the counted item its neighbours' size, the glyph at
 *     its centre, the count a badge standing on its top trailing corner,
 *     its foot on the glyph's top line; at 5 and at 150, beside a plain
 *     neighbour.
 *  4. words: a control with its name beside its glyph is not read.
 *  5. off a bar: a lone glyph button on the page is not read.
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
  .badge { position: absolute; bottom: calc(100% - 4px); inset-inline-start: calc(50% + 5px); display: grid; place-items: center; block-size: 12px; min-inline-size: 12px; padding-inline: 2px; border-radius: 999px; background: #2b2622; color: #fff; font: 500 12px/1 sans-serif; }
</style>`;

const GLYPH = `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="currentColor"/></svg>`;

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
  <button class="comments" type="button" aria-label="Comments, 5">${GLYPH}<span class="badge" style="bottom: auto; top: 10px; inset-inline-start: 10px">5</span></button>
  <button type="button" aria-label="Reload">${GLYPH}</button>
</div></header>`,
    want: "button.comments",
  },
  "corner badge": {
    html: `${BASE}<header><div class="glass">
  <button type="button" aria-label="Comments, 5">${GLYPH}<span class="badge">5</span></button>
  <button type="button" aria-label="Reload">${GLYPH}</button>
  <button type="button" aria-label="Files, 150">${GLYPH}<span class="badge">150</span></button>
</div></header>`,
    want: null,
  },
  words: {
    html: `${BASE}<header><div class="glass">
  <button type="button" style="padding-inline: 6px 10px; gap: 6px">${GLYPH}<span>Comments</span></button>
</div></header>`,
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
