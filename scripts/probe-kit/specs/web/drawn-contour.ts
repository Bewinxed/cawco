/**
 * The rendered checks' two contour rules (rendered-checks.ts, section 12)
 * fire on the two drawn mistakes the owner caught on the design graph's clip
 * editor (1a98ddfac: graph/ClipEditor.svelte, graph/MoveFace.svelte,
 * graph/ClipBar.svelte), and stay quiet on the drawing done right.
 *
 * `decoration-spill`, planted four ways:
 *
 *  1. reset press: the editor's changed-value name, a press that hugs its
 *     words on a 5px `selected-bg` wash under the pointer, its dashed line 4px
 *     under the words (`underline-offset-4`), drawn here as the `::after` a
 *     dashed underline is: the line runs out under its wash.
 *  2. was outline: a tuned run's dashed outline of its timing as the engine
 *     ran it (ClipBar `data-slot="was"`, `rounded-xs border-dashed`), longer
 *     than the rounded lane that clips it: cut at the lane's end.
 *  3. cut ring: the row's focus ring 2px outside a row flush in a rounded
 *     list that clips: cut along the list's top.
 *  4. chosen ring: a chosen run's ring (Tailwind's `ring-2`, a box-shadow
 *     `0 0 0 2px`) on a bar at the start of the lane that clips it.
 *
 * `nested-radius`, planted once:
 *
 *  5. square ghost: the editor's 10px recess card holding its rows 4px in,
 *     each row's hover wash square: under the pointer, the first row's two
 *     top corners stand square inside the card's rounded ones.
 *
 * Drawn right, neither rule finds anything:
 *
 *  6. concentric: the same card's rows at 6px (10 less 4); a segmented
 *     groove of 10px holding its thumb 3px in at 7px; a 12px card that clips
 *     holding a square header flush (its clip rounds the header).
 *  7. ring kept inside: the cut ring's list with the ring inset
 *     (`outline-offset: -2px`, design.css `focus-inset`).
 *  8. ring with room: a button 12px inside its card, its ring 2px outside.
 *  9. chip in a card: a 5px chip in the middle of a 12px card; MoveFace's
 *     dashed length chip (`h-c-badge-h rounded-xs border-dashed
 *     bg-selected-bg`) with room in its cell; a press whose dashed line
 *     stands inside its wash; a round pin mark near a row's 8px corner
 *     (comments' pin row), which fills no part of the row.
 * 10. carried on: thread cards joined by a line each card's `::before`
 *     draws up from its top edge (tasks' PostCard), and a sticky foot's edge
 *     fade standing on its top (StickyFoot): flush outside their own box,
 *     they carry it on and mark no wash of it.
 *
 *   bun scripts/probe-kit/run.ts web drawn-contour
 */
import type { Page } from "playwright-core";
import { type CheckName, RenderedChecks, RULES } from "../../rendered-checks";
import type { Spec } from "../../spec";

/** The two rules this spec proves; every other is not read here. */
const READ: CheckName[] = ["decoration-spill", "nested-radius"];

/** The dashboard's values the clip editor drew with (tokens.css), as literals: a fixture of its own. */
const BASE = `<!doctype html>
<meta name="viewport" content="width=device-width">
<style>
  *, ::before, ::after { box-sizing: border-box; }
  body { margin: 0; padding: 40px; font: 13px/20px sans-serif; background: #f6f3ee; color: #2b2622; }
  button { font: inherit; color: inherit; border: 0; background: none; padding: 0; text-align: start; }
  .card { inline-size: 360px; border-radius: 10px; background: #ece7df; }
</style>`;

interface Fixture {
  /** What the spec does to the page before it reads: hover or focus, as the person would. */
  act?: (page: Page) => Promise<void>;
  html: string;
  /** The rule that must name an element whose selector holds `element`; none for a page drawn right. */
  want: { element: string; rule: CheckName } | null;
}

const hover = (selector: string) => async (page: Page) => {
  await page.hover(selector);
};
const focus = (selector: string) => async (page: Page) => {
  await page.evaluate((one) => {
    document
      .querySelector<HTMLElement>(one)
      ?.focus({ focusVisible: true } as FocusOptions);
  }, selector);
};

/** A rounded list that clips, its rows flush against its edges. */
const LIST = (ring: string) => `${BASE}<style>
  .rows { inline-size: 320px; margin: 0; padding: 0; list-style: none; overflow: hidden; border-radius: 10px; background: #fff; }
  .row { display: block; inline-size: 100%; block-size: 36px; padding-inline: 11px; }
  .row:focus-visible { outline: 2px solid #c2552f; ${ring} }
</style>
<ul class="rows"><li><button class="row" type="button">Form failure</button></li><li><button class="row" type="button">Unfolds</button></li></ul>`;

/** The editor's recess card, its rows 4px in, each row's hover wash at `radius`. */
const GHOST = (radius: string) => `${BASE}<style>
  .card { padding: 4px; }
  .row { display: flex; align-items: center; inline-size: 100%; block-size: 30px; padding-inline: 7px; border-radius: ${radius}; }
  .row:hover { background: #dcd5ca; }
</style>
<section class="card"><button class="row" type="button">Duration</button><button class="row" type="button">Delay</button><button class="row" type="button">Curve</button></section>`;

const FIXTURES: Record<string, Fixture> = {
  "reset press": {
    html: `${BASE}<style>
  .reset { position: relative; padding-inline: 4px; border-radius: 5px; color: #b3462a; }
  .reset:hover { background: #f7ddd3; }
  .reset::after { content: ""; position: absolute; inset-inline: 0; bottom: -4px; border-bottom: 1px dashed #b3462a; }
</style>
<section class="card" style="padding: 11px"><button class="reset" type="button">Duration</button></section>`,
    act: hover(".reset"),
    want: { rule: "decoration-spill", element: "button.reset" },
  },
  "was outline": {
    html: `${BASE}<style>
  .lane { position: relative; inline-size: 320px; block-size: 20px; overflow: hidden; border-radius: 8px; background: #fff; }
  .was { position: absolute; inset-block: 0; inset-inline-start: 60%; inline-size: 55%; border: 1px dashed #8a8178; border-radius: 5px; }
  .bar { position: absolute; inset-block: 0; inset-inline-start: 60%; inline-size: 30%; border: 1px solid #5a7fb0; border-radius: 5px; background: #dbe5f2; }
</style>
<section class="card" style="padding: 11px"><div class="lane"><span class="was" aria-hidden="true"></span><div class="bar" role="slider" aria-label="Move the run" aria-valuenow="0" tabindex="0"></div></div></section>`,
    want: { rule: "decoration-spill", element: "span.was" },
  },
  "cut ring": {
    html: LIST("outline-offset: 2px;"),
    act: focus(".row"),
    want: { rule: "decoration-spill", element: "button.row" },
  },
  "chosen ring": {
    html: `${BASE}<style>
  .lane { position: relative; inline-size: 320px; block-size: 20px; overflow: hidden; border-radius: 8px; background: #fff; }
  .bar { position: absolute; inset-block: 0; inset-inline-start: 0; inline-size: 30%; border-radius: 5px; background: #dbe5f2; box-shadow: 0 0 0 2px #5a7fb0; }
</style>
<section class="card" style="padding: 11px"><div class="lane"><div class="bar" role="slider" aria-label="Move the run" aria-valuenow="0" tabindex="0"></div></div></section>`,
    want: { rule: "decoration-spill", element: "div.bar" },
  },
  "square ghost": {
    html: GHOST("0"),
    act: hover(".row"),
    want: { rule: "nested-radius", element: "button.row" },
  },
  concentric: {
    html: `${GHOST("6px")}<style>
  .groove { display: flex; inline-size: 240px; margin-block: 24px; padding: 3px; border-radius: 10px; background: #e3ddd3; }
  .groove > * { flex: 1; block-size: 30px; border-radius: 7px; text-align: center; }
  .thumb { background: #fff; }
  .clips { inline-size: 360px; overflow: hidden; border: 1px solid #d8d1c6; border-radius: 12px; background: #fff; }
  .clips header { block-size: 36px; padding: 8px 11px; background: #ece7df; }
  .clips p { margin: 11px; }
</style>
<div class="groove" role="radiogroup" aria-label="Scheme"><span class="thumb" role="radio" aria-checked="true">Light</span><span role="radio" aria-checked="false">Dark</span></div>
<section class="clips"><header>Changes</header><p>Two values changed.</p></section>`,
    act: hover(".row"),
    want: null,
  },
  "ring kept inside": {
    html: LIST("outline-offset: -2px;"),
    act: focus(".row"),
    want: null,
  },
  "ring with room": {
    html: `${BASE}<style>
  .card { padding: 12px; }
  .act { block-size: 30px; padding-inline: 11px; border-radius: 10px; background: #fff; }
  .act:focus-visible { outline: 2px solid #c2552f; outline-offset: 2px; }
</style>
<section class="card"><button class="act" type="button">Play</button></section>`,
    act: focus(".act"),
    want: null,
  },
  "chip in a card": {
    html: `${BASE}<style>
  .card { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 11px; padding: 16px; border-radius: 12px; background: #fff; }
  .chip { justify-self: start; padding-inline: 7px; border-radius: 5px; background: #ece7df; }
  .length { display: inline-flex; align-items: center; block-size: 20px; padding-inline: 4px; border: 1px dashed #b3462a; border-radius: 5px; background: #f7ddd3; line-height: 1; color: #b3462a; }
  .kept { position: relative; padding: 0 4px 6px; border-radius: 5px; background: #f7ddd3; color: #b3462a; }
  .kept::after { content: ""; position: absolute; inset-inline: 4px; bottom: 3px; border-bottom: 1px dashed #b3462a; }
</style>
<section class="card"><span class="chip">Size</span><button class="length" type="button">240 ms</button><button class="kept" type="button">Delay</button></section>
<style>
  .pin-row { display: flex; align-items: flex-start; gap: 11px; inline-size: 306px; margin-block: 16px; padding: 3px 7px 7px; border-radius: 8px; background: #fff; }
  .pin { display: inline-flex; align-items: center; justify-content: center; flex: none; block-size: 28px; min-inline-size: 28px; border-radius: 999px 999px 999px 2px; background: #ece7df; }
</style>
<button class="pin-row" type="button"><span class="pin">1</span><span>Make the ring follow the row's radius, and the line under the words stay inside its wash.</span></button>`,
    want: null,
  },
  "carried on": {
    html: `${BASE}<style>
  .thread { display: flex; flex-direction: column; gap: 16px; inline-size: 360px; }
  .post { position: relative; padding: 11px 16px; border-radius: 10px; background: #fff; }
  .post + .post::before { content: ""; position: absolute; inset-inline-start: 24px; bottom: 100%; block-size: 16px; inline-size: 2px; background: #d8d1c6; }
  .pane { inline-size: 360px; block-size: 200px; overflow: auto; border-radius: 12px; background: #fff; }
  .pane p { margin: 11px; block-size: 300px; }
  .foot { position: sticky; bottom: 0; padding: 11px; background: #fff; }
  .foot::before { content: ""; position: absolute; inset-inline: 0; bottom: 100%; block-size: 24px; background: linear-gradient(to bottom, transparent, #fff); pointer-events: none; }
</style>
<div class="thread"><article class="post">Asked for the ring inset.</article><article class="post">Answered: inset on rows.</article></div>
<section class="pane" style="margin-block-start: 24px"><p>Two values changed.</p><footer class="foot"><button type="button">Keep</button></footer></section>`,
    want: null,
  },
};

const spec: Spec = {
  group: "The probe kit's own rig",
  name: "drawn-contour",
  run: async (kit) => {
    const page = await kit.page("desk");
    const why = "drawn-contour proves decoration-spill and nested-radius alone";
    const checks = new RenderedChecks(kit, "drawn-contour", {
      exempt: Object.fromEntries(
        RULES.filter((rule) => !READ.includes(rule)).map((rule) => [rule, why])
      ),
      noImpeccable: why,
    });
    for (const [label, fixture] of Object.entries(FIXTURES)) {
      await page.setContent(fixture.html);
      await fixture.act?.(page);
      // A fixture's hover is what the read finds: the pointer stays on it.
      const read = await checks.at(
        page,
        label,
        fixture.act ? { pointer: "kept" } : {}
      );
      const found = read.findings.filter((one) => READ.includes(one.rule));
      const said =
        found.length > 0
          ? found
              .map((one) => `${one.rule}: ${one.element}: ${one.measured}`)
              .join(" | ")
          : "0 findings";
      const { want } = fixture;
      if (want) {
        kit.check(
          `drawn-contour: ${label}, ${want.rule} names ${want.element} and nothing else is found`,
          found.length > 0 &&
            found.every(
              (one) =>
                one.rule === want.rule && one.element.includes(want.element)
            ),
          said
        );
      } else {
        kit.check(
          `drawn-contour: ${label}, neither rule finds anything`,
          found.length === 0,
          said
        );
      }
    }
    await page.close();
  },
};
export default spec;
