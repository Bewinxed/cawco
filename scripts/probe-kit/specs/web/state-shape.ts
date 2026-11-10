/**
 * The rendered checks' state-shape rule (rendered-checks.ts) fires on the
 * state fills the owner caught on the artifact panel's head, each drawn
 * only while hovered, pressed or chosen, and stays quiet on the drawing done
 * right. The rule forces hover, active and focus-visible on every control
 * itself (CSS.forcePseudoState): no fixture is hovered or pressed here but
 * the twelfth, whose pointer the read moves off it.
 *
 * Drawn wrong, each names its control:
 *
 *  1. square in round: a round Close (a 30px circle) whose hover fill is a
 *     child laid over its whole box, square.
 *  2. rounded square in glass: a capsule glass 36px tall, 3px of pad,
 *     holding 30px icon buttons at 10px, each filled under the pointer (the
 *     kit Button in BarGlass: Close, Expand, +).
 *  3. pressed in glass: the same glass, its item's fill only while pressed.
 *  4. selected in glass: an item drawn pressed at rest (`aria-pressed`),
 *     its fill a rounded rectangle at 8px (the Comments toggle).
 *  5. capsules in a group: three items in one glass, each a whole capsule
 *     under the pointer, the middle one's corners and the ends' inner
 *     corners round toward their neighbours (the group before position
 *     decided the corners).
 *  5b. a face that darkens alone: Caw's head whose hover darkens only his
 *     face, nothing drawn on its box (The Glass Contour Rule: hover is drawn
 *     on the item's one box; a glyph's or a face's change is the drawing).
 *
 * Drawn right, the rule finds nothing:
 *
 *  6. joined items: a group of three, the leading item round on its
 *     leading corners and 5px toward its neighbour, the middle 5px all
 *     round, the trailing (counted) round on its trailing corners; hovered,
 *     pressed and chosen alike, a chosen one hovered or pressed a step
 *     darker over its wash (as BarItem `open` shows hover and press).
 *  7. the only item: one capsule alone in its glass, round at both ends.
 *  8. a face that darkens: a glass's only item holding a face (Caw's
 *     head), a 20px disc drawn at rest that darkens under the press, the
 *     item's box filled under hover and press as BarItem fills Caw's head;
 *     the disc is the drawing, no state's fill, and its own fill is
 *     concentric.
 *  9. a counted item on: its badge, a child standing on its corner
 *     past its box, is drawn over it, no fill of it.
 * 10. round with its own fill: the round Close filling itself, and one
 *     whose child fill takes its radius (`border-radius: inherit`).
 * 11. a button alone: a 10px button on the page, and one in the middle of
 *     a 12px card, clear of its corners.
 * 12. an item left under the pointer: a glass's only item, filled under
 *     hover, clicked as a spec clicks Expand and left there. The read parks
 *     the pointer off every control first (parkPointer), so its rest is
 *     unhovered and its forced hover draws on its box.
 * 13. a glass clipped away: a glass of items drawn right, in a head that
 *     stands in a box of no height that clips (the design graph's stage at
 *     its drawer's whole stop): on no part of the screen, their fills are
 *     said unread, never "paints nothing".
 *
 *   bun scripts/probe-kit/run.ts web state-shape
 */
import type { Page } from "playwright-core";
import { type CheckName, RenderedChecks, RULES } from "../../rendered-checks";
import type { Spec } from "../../spec";

const READ: CheckName = "state-shape";

const BASE = `<!doctype html>
<meta name="viewport" content="width=device-width">
<style>
  *, ::before, ::after { box-sizing: border-box; }
  body { margin: 0; padding: 40px; font: 13px/20px sans-serif; background: #f6f3ee; color: #2b2622; }
  button { font: inherit; color: inherit; border: 0; background: none; padding: 0; }
  .glass { display: inline-flex; align-items: center; gap: 4px; block-size: 36px; padding: 3px; border-radius: 999px; background: #fff; box-shadow: 0 1px 2px #0002; }
  .glass button { display: inline-grid; place-items: center; block-size: 30px; min-inline-size: 30px; transition: background-color 150ms; }
  .glyph { inline-size: 16px; block-size: 16px; border: 2px solid currentColor; border-radius: 3px; }
</style>`;

interface Fixture {
  /** What the spec does before it reads, as a person would. */
  act?: (page: Page) => Promise<void>;
  html: string;
  /** Words the read's unread lines must hold (what the rule said it could not read). */
  unread?: string;
  /** The control the rule must name (its selector holds this); none for a page drawn right. */
  want: string | null;
}

const ITEMS = (radius: string, state: string) => `${BASE}<style>
  .glass button { border-radius: ${radius}; }
  .glass button${state} { background: #e6e0d6; }
</style>
<div class="glass" role="toolbar" aria-label="Canvas">
  <button class="new" type="button" aria-label="New canvas"><span class="glyph"></span></button>
  <button class="expand" type="button" aria-label="Expand"><span class="glyph"></span></button>
  <button class="close" type="button" aria-label="Close"><span class="glyph"></span></button>
</div>`;

const FIXTURES: Record<string, Fixture> = {
  "square in round": {
    html: `${BASE}<style>
  .round { position: relative; display: inline-grid; place-items: center; inline-size: 30px; block-size: 30px; border-radius: 999px; }
  .round .fill { position: absolute; inset: 0; }
  .round:hover .fill { background: #e6e0d6; }
</style>
<button class="round" type="button" aria-label="Close"><span class="fill"></span><span class="glyph"></span></button>`,
    want: "button.round",
  },
  "rounded square in glass": {
    html: ITEMS("10px", ":hover"),
    want: "button.new",
  },
  "pressed in glass": {
    html: ITEMS("10px", ":active"),
    want: "button.expand",
  },
  "selected in glass": {
    html: `${BASE}<style>
  .glass button { border-radius: 999px; }
  .glass button[aria-pressed="true"] { border-radius: 8px; background: #e6e0d6; }
</style>
<div class="glass" role="toolbar" aria-label="Canvas">
  <button type="button" aria-label="Reload"><span class="glyph"></span></button>
  <button class="comments" type="button" aria-pressed="true" aria-label="Comments"><span class="glyph"></span></button>
</div>`,
    want: "button.comments",
  },
  "capsules in a group": {
    html: `${BASE}<style>
  .glass button { border-radius: 999px; }
  .glass button:hover { background: #e6e0d6; }
</style>
<div class="glass" role="toolbar" aria-label="Canvas">
  <button type="button" aria-label="New canvas"><span class="glyph"></span></button>
  <button class="middle" type="button" aria-label="Expand"><span class="glyph"></span></button>
  <button type="button" aria-label="Close"><span class="glyph"></span></button>
</div>`,
    want: "button.middle",
  },
  "joined items": {
    html: `${BASE}<style>
  .glass button { border-radius: 5px; }
  .glass button:first-child { border-start-start-radius: 15px; border-end-start-radius: 15px; }
  .glass button:last-child { border-start-end-radius: 15px; border-end-end-radius: 15px; }
  .glass button:is(:hover, :active, :focus-visible, [aria-pressed="true"]) { background: #e6e0d6; }
  .glass button[aria-pressed="true"]:is(:hover, :active) { background: #d9d1c4; }
  .glass .counted { gap: 4px; display: inline-flex; align-items: center; padding-inline: 7px; }
</style>
<div class="glass" role="toolbar" aria-label="Canvas">
  <button type="button" aria-label="New canvas"><span class="glyph"></span></button>
  <button type="button" aria-pressed="true" aria-label="Comments"><span class="glyph"></span></button>
  <button class="counted" type="button" aria-label="Files, 12"><span class="glyph"></span><span>12</span></button>
</div>`,
    want: null,
  },
  "the only item": {
    html: `${BASE}<style>
  .glass button { border-radius: 15px; }
  .glass button:is(:hover, :active, [aria-pressed="true"]) { background: #e6e0d6; }
  .glass button[aria-pressed="true"]:is(:hover, :active) { background: #d9d1c4; }
</style>
<div class="glass" role="toolbar" aria-label="Canvas">
  <button type="button" aria-pressed="true" aria-label="Comments"><span class="glyph"></span></button>
</div>`,
    want: null,
  },
  "a face that darkens": {
    html: `${BASE}<style>
  .glass button { border-radius: 15px; }
  .glass button:is(:hover, :active) { background: #e6e0d6; }
  .face { inline-size: 20px; block-size: 20px; border-radius: 999px; background: #8a8178; }
  .glass button:active .face { background: #2b2622; }
</style>
<div class="glass" role="toolbar" aria-label="Bar">
  <button type="button" aria-label="Caw"><span class="face"></span></button>
</div>`,
    want: null,
  },
  "a face that darkens alone": {
    html: `${BASE}<style>
  .glass button { border-radius: 15px; }
  .glass button:active { background: #e6e0d6; }
  .face { inline-size: 20px; block-size: 20px; border-radius: 999px; background: #8a8178; }
  .glass button:is(:hover, :active) .face { background: #2b2622; }
</style>
<div class="glass" role="toolbar" aria-label="Bar">
  <button class="caw" type="button" aria-label="Caw"><span class="face"></span></button>
</div>`,
    want: "button.caw",
  },
  "a counted item on": {
    html: `${BASE}<style>
  .glass button { position: relative; border-radius: 15px; }
  .glass button[aria-pressed="true"] { background: #e6e0d6; }
  .glass button[aria-pressed="true"]:is(:hover, :active) { background: #d9d1c4; }
  .badge { position: absolute; top: -8px; inset-inline-start: 15px; display: grid; place-items: center; block-size: 16px; min-inline-size: 16px; border-radius: 999px; background: #2b2622; color: #fff; font: 500 13px/1 sans-serif; }
</style>
<div class="glass" role="toolbar" aria-label="Bar">
  <button type="button" aria-pressed="true" aria-label="Comments, 3"><span class="glyph"></span><span class="badge">3</span></button>
</div>`,
    want: null,
  },
  "round with its own fill": {
    html: `${BASE}<style>
  .round { position: relative; display: inline-grid; place-items: center; inline-size: 30px; block-size: 30px; margin-inline-end: 12px; border-radius: 999px; }
  .own:hover, .own:active { background: #e6e0d6; }
  .inherits .fill { position: absolute; inset: 0; border-radius: inherit; }
  .inherits:hover .fill { background: #e6e0d6; }
</style>
<button class="round own" type="button" aria-label="Close"><span class="glyph"></span></button>
<button class="round inherits" type="button" aria-label="Close"><span class="fill"></span><span class="glyph"></span></button>`,
    want: null,
  },
  "an item left under the pointer": {
    act: async (page) => {
      await page.click('[aria-label="Expand"]');
      // Its hover fill eased in whole, as a spec's wait after a click lets it.
      await page.waitForTimeout(400);
    },
    html: `${BASE}<style>
  .glass button { border-radius: 15px; }
  .glass button:is(:hover, :active) { background: #e6e0d6; }
</style>
<div class="glass" role="toolbar" aria-label="Canvas">
  <button type="button" aria-label="Expand"><span class="glyph"></span></button>
</div>`,
    want: null,
  },
  "a glass clipped away": {
    html: `${BASE}<style>
  .stage { position: relative; block-size: 0; overflow: clip; border-radius: 12px; }
  .head { position: absolute; inset-inline: 0; top: 0; display: flex; justify-content: end; }
  .glass button { border-radius: 5px; }
  .glass button:first-child { border-start-start-radius: 15px; border-end-start-radius: 15px; }
  .glass button:last-child { border-start-end-radius: 15px; border-end-end-radius: 15px; }
  .glass button:is(:hover, :active, [aria-pressed="true"]) { background: #e6e0d6; }
  .glass button[aria-pressed="true"]:is(:hover, :active) { background: #d9d1c4; }
</style>
<div class="stage"><header class="head"><div class="glass" role="toolbar" aria-label="Stage">
  <button type="button" aria-pressed="true" aria-label="Compare"><span class="glyph"></span></button>
  <button type="button" aria-label="View options"><span class="glyph"></span></button>
</div></header></div>`,
    unread:
      "2 control(s) of a bar's glass or a groove stand on no part of the screen",
    want: null,
  },
  "a button alone": {
    html: `${BASE}<style>
  .act { block-size: 30px; padding-inline: 11px; border-radius: 10px; background: #fff; }
  .act:hover { background: #e6e0d6; }
  .card { display: grid; place-items: center; inline-size: 360px; margin-block-start: 24px; padding: 24px; border-radius: 12px; background: #fff; }
  .card .act { background: #ece7df; }
</style>
<button class="act" type="button">Play</button>
<section class="card"><button class="act" type="button">Keep</button></section>`,
    want: null,
  },
};

const spec: Spec = {
  group: "The probe kit's own rig",
  name: "state-shape",
  run: async (kit) => {
    const page = await kit.page("desk");
    const why = "state-shape proves its own rule alone";
    const checks = new RenderedChecks(kit, "state-shape", {
      exempt: Object.fromEntries(
        RULES.filter((rule) => rule !== READ).map((rule) => [rule, why])
      ),
      noImpeccable: why,
    });
    for (const [label, fixture] of Object.entries(FIXTURES)) {
      await page.setContent(fixture.html);
      await fixture.act?.(page);
      const read = await checks.at(page, label);
      const found = read.findings.filter((one) => one.rule === READ);
      const said =
        found.length > 0
          ? found.map((one) => `${one.element}: ${one.measured}`).join(" | ")
          : "0 findings";
      const { unread, want } = fixture;
      if (unread) {
        kit.check(
          `state-shape: ${label}, said unread`,
          read.unread.some((line) => line.includes(unread)),
          read.unread.join(" | ") || "nothing said unread"
        );
      }
      if (want) {
        kit.check(
          `state-shape: ${label}, names ${want}`,
          found.some((one) => one.element.includes(want)),
          said
        );
      } else {
        kit.check(
          `state-shape: ${label}, finds nothing`,
          found.length === 0,
          said
        );
      }
    }
    await page.close();
  },
};
export default spec;
