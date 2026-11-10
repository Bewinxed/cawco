/**
 * The overflow sweep (journeys/scan.ts) names a control whose box runs out
 * of its row, card or panel, whether or not the page scrolls sideways.
 *
 * Its first rules read the page's width and the text: a control pushed past
 * its row inside a panel that clips (or inside a card, with the screen still
 * wide enough) widens nothing, and its words stay inside its own box, so a
 * Needs-you row's Approve at 261..421 in a 69..372 row, and a task card's at
 * 225..385 in a 33..357 row, read 0 findings at 390px.
 *
 * Here on pages of its own at 390×844, each a 390px panel:
 *
 *  1. clipped: the panel clips (`overflow: hidden`); its row (60..360)
 *     holds Deny and Approve, Approve 50px past the row's right edge, cut
 *     by the panel at the screen's 390.
 *  2. in a card: nothing clips; the row is a card with an edge, Approve
 *     50px past it and still inside the screen.
 *  3. mended: the same two rows with each button free to shrink
 *     (`flex: 1; min-width: 0`): no finding.
 *  4. meant: what a box may hang past its row by its own words: a ghost
 *     button pulled out by a negative margin, a scroller's strip of chips
 *     past its edge, a carousel's slide wholly cut away: no finding.
 *
 * And a control hidden whole draws nothing over the words under it: the
 * shell's skip link (Shell.svelte) is Tailwind's `sr-only` (`clip-path:
 * inset(50%)`) with its own padding kept, a 28×14 box at the screen's
 * corner over a transcript's first line (the delegate-tray bench, 1440):
 *
 *  5. skip link, hidden: no finding.
 *  6. skip link, shown (its focus drops `sr-only`): its words and edge run
 *     over the line, a finding.
 *
 *   bun scripts/probe-kit/run.ts web scan-control-box
 */
import { scan } from "../../journeys/scan";
import type { Spec } from "../../spec";

const BASE = `<!doctype html>
<meta name="viewport" content="width=device-width">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font: 16px/1.4 sans-serif; }
  .panel { inline-size: 390px; padding: 16px 20px; background: #fff; }
  .clips { overflow: hidden; padding-inline: 60px; }
  .row { display: flex; gap: 8px; inline-size: 300px; padding: 0; }
  .card { border: 1px solid #ccc; border-radius: 8px; background: #fafafa; }
  button { flex: none; block-size: 44px; border: 1px solid #888; background: #eee; font: inherit; }
  .deny { inline-size: 120px; }
  .approve { inline-size: 222px; }
  .mended button { flex: 1; min-inline-size: 0; inline-size: auto; }
</style>`;

/** Deny 120 + gap 8 + Approve 222 = 350 in a 300px row: Approve 50px past it. */
const ROW = `<button class="deny" type="button">Deny</button><button class="approve" type="button">Approve</button>`;

const PAGES: Record<string, { html: string; want: "finding" | "none" }> = {
  clipped: {
    html: `${BASE}<section class="panel clips"><div class="row">${ROW}</div></section>`,
    want: "finding",
  },
  "in a card": {
    html: `${BASE}<section class="panel"><div class="row card">${ROW}</div></section>`,
    want: "finding",
  },
  mended: {
    html: `${BASE}<section class="panel clips"><div class="row mended">${ROW}</div></section><section class="panel"><div class="row card mended">${ROW}</div></section>`,
    want: "none",
  },
  meant: {
    html: `${BASE}<style>
  .ghost { border: 0; background: none; margin-inline: -12px; inline-size: auto; }
  .strip { display: flex; gap: 8px; overflow-x: auto; inline-size: 300px; }
  .strip button { inline-size: 120px; }
  .track { display: flex; inline-size: 300px; overflow: hidden; }
  .slide { flex: none; inline-size: 300px; }
  .slide button { inline-size: 100%; }
</style>
<section class="panel"><div class="row card"><button class="ghost" type="button">Edit</button></div></section>
<section class="panel"><div class="strip">${'<button type="button">Chip</button>'.repeat(5)}</div></section>
<section class="panel"><div class="track"><div class="slide"><button type="button">One</button></div><div class="slide"><button type="button">Two</button></div></div></section>`,
    want: "none",
  },
};

/** The skip link over a transcript's first line, hidden by `sr-only` or shown. */
const SKIP = (shown: boolean) => `${BASE}<style>
  .sr-only { position: absolute; inline-size: 1px; block-size: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border-width: 0; }
  .skip { inset-block-start: 0; inset-inline-start: 0; padding: 7px 14px; border-radius: 8px; background: #fff; box-shadow: 0 1px 2px #0003; }
  .shown { position: absolute; inline-size: auto; block-size: auto; margin: 0; overflow: visible; clip-path: none; }
  .line { margin: 0; padding-inline: 25px; line-height: 11px; }
</style>
<a class="sr-only skip${shown ? " shown" : ""}" href="#main">Skip to content</a><p class="line">Twelve are out. Three wait for the Mac's build slot.</p>`;

const spec: Spec = {
  group: "The probe kit's own rig",
  name: "scan-control-box",
  run: async (kit) => {
    const page = await kit.page("phone");
    for (const [label, { html, want }] of Object.entries(PAGES)) {
      await page.setContent(html);
      const found = await page.evaluate(scan);
      const named = found.filter((line) => line.includes("“Approve”"));
      kit.check(
        want === "finding"
          ? `scan-control-box: ${label}, the sweep names Approve running out of its row`
          : `scan-control-box: ${label}, the sweep finds nothing`,
        want === "finding"
          ? named.length > 0 &&
              named.every((line) => line.includes("runs out of"))
          : found.length === 0,
        found.length > 0 ? found.join(" | ") : "0 findings"
      );
    }
    for (const shown of [false, true]) {
      await page.setContent(SKIP(shown));
      const found = await page.evaluate(scan);
      const named = found.filter((line) => line.includes("“Skip to content”"));
      kit.check(
        shown
          ? "scan-control-box: skip link, shown, the sweep names it over the words"
          : "scan-control-box: skip link, hidden by sr-only, the sweep finds nothing",
        shown ? named.length > 0 : found.length === 0,
        found.length > 0 ? found.join(" | ") : "0 findings"
      );
    }
    await page.close();
  },
};
export default spec;
