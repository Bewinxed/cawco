/**
 * Each rendered check reads a page drawn right as right, and still names the
 * mistake it is for. A sweep of the dev benches at 1440 and 390 (2026-11-04,
 * the bench-sweep) failed on pages that broke no DESIGN.md rule; each misread
 * is drawn here as the bench drew it, beside the mistake the rule is for.
 *
 * Drawn right, the rule finds nothing:
 *
 *  - coral: comment pins (PinMark: `data-mark`, `aria-hidden`, a figure on
 *    `action-solid`), the reader's own marks (DESIGN.md, Coral Action: "the
 *    reader's own row mark"), and a record of what was picked (ui/chip
 *    `data-chosen`, the chosen option) beside the one act; a bench's sheet
 *    of specimens, each `data-specimen` (a panel, or a button itself) with
 *    its one act; the vermillion rule parting Caw's panel's sections, over
 *    the ask's act (DESIGN.md: "the vermillion rule that parts two regions
 *    of a glass card").
 *  - mixed-icons: a task ring (two circles on one centre, stroked; its
 *    check waiting at opacity 0) beside filled glyphs in a bar (DESIGN.md,
 *    Task ring).
 *  - hidden-cue: a transcript scrolled under its edge effect, which takes no
 *    press (HeadFade, `pointer-events: none`); a collapse button whose 44px
 *    `touch-hit` area overflows its scroller; the usage strip, a popover
 *    trigger whose clip drops a whole wrapped cell; a tab strip whose end
 *    fade is cut short by its chosen tab, a tab peeking past it.
 *  - loose-list: tool rows between taller turns, no air between them.
 *  - fat-row: tool rows whose group's room above sits in a child's margin
 *    inside a `flow-root` row; a bench's column of pane groups.
 *  - uneven-inset: a tab strip with room after its last tab; a bar's ghost
 *    button at its end, read by its words, not its padding, and the same
 *    ghost in a wrapper that paints nothing; a timeline's lanes and ruler,
 *    whose bars and figures stand where their times put them (a plot).
 *  - contrast: an unchosen tab's label on its tab's own sheet, one SVG path
 *    (fluid-tabs TabItem), lighter than the shelf behind it.
 *  - empty-pane: an empty editor (`contenteditable`, its placeholder a
 *    pseudo's).
 *  - head: a sheet's relay head, a `<header>` under the sheet's own title
 *    and Close.
 *  - bar-ground: a popover's foot, its top hairline parting it from the
 *    content (DESIGN.md, Borders are graded).
 *
 *  - overflow (impeccable's `text-occlusion`, read where its launcher is):
 *    a popover over the page's words, as the new-session bench opens one.
 *
 * The mistake each rule is for, still named: two coral acts, two in one
 * specimen, a worded chip edged in coral, a worded chip
 * on coral beside the act; an outlined mark beside filled ones; a scroller
 * cut with no cue, the usage strip's clip outside any control, a masked
 * strip with nothing peeking; a list stretched apart; one-line rows grown
 * tall; a bar's padding uneven under a filled button; a label on the shelf
 * itself; a pane with nothing in it; a bar's title over a second line; a
 * bar's hairline under its head, a foot's fill; an opaque box laid over a
 * button.
 *
 *   bun scripts/probe-kit/run.ts web rendered-reads
 */
import type { Page } from "playwright-core";
import { type CheckName, RenderedChecks, RULES } from "../../rendered-checks";
import type { Spec } from "../../spec";

const BASE = `<!doctype html>
<meta name="viewport" content="width=device-width">
<style>
  *, ::before, ::after { box-sizing: border-box; }
  body { margin: 0; padding: 40px; font: 13px/20px sans-serif; background: #f6f3ee; color: #2b2622; }
  button { font: inherit; color: inherit; }
  .act { block-size: 36px; padding-inline: 14px; border: 0; border-radius: 10px; background: oklch(0.555 0.17 33); color: #fff; }
  .filled { block-size: 32px; padding-inline: 11px; border: 1px solid #c9c1b5; border-radius: 10px; background: #ece7df; }
</style>`;

interface Fixture {
  /** What the spec does to the page before it reads. */
  act?: (page: Page) => Promise<void>;
  html: string;
  /** Drawn right: what the rule names, not failed, to show it read the page (a substring). */
  named?: string;
  rule: CheckName;
  /** The mistake: an element the rule names (a substring of its selector or words); none for a page drawn right. */
  want: string | null;
}

/** A scroller of twenty 60px rows, scrolled to its foot. */
const scrolledToFoot = (selector: string) => async (page: Page) => {
  await page.evaluate((one) => {
    const el = document.querySelector(one);
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, selector);
};

const TRANSCRIPT = (fade: string) => `${BASE}<style>
  .pane { position: relative; inline-size: 400px; block-size: 300px; }
  .tr { block-size: 100%; overflow-y: auto; }
  .tr p { margin: 0; padding: 11px; block-size: 60px; }
  .fade { position: absolute; inset-inline: 0; inset-block-start: 0; block-size: 40px; pointer-events: none; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
</style>
<section class="pane" aria-label="Session"><div class="tr" aria-label="Turns">${Array.from(
  { length: 20 },
  (_, i) => `<p>Turn ${i + 1}: the chip is capped at its pane.</p>`
).join("")}</div>${fade}</section>`;

const STRIP = (open: string, close: string, height: number) => `${BASE}<style>
  .strip { display: flex; flex-wrap: wrap; column-gap: 7px; inline-size: 200px; block-size: ${height}px; overflow: clip; }
  .cell { flex: none; display: flex; flex-direction: column; justify-content: center; inline-size: 150px; block-size: 36px; }
  .trigger { padding: 4px 7px; border: 0; background: #ece7df; border-radius: 8px; text-align: start; }
</style>
${open}<span class="strip"><span class="cell"><span>5h+</span><span>then bewinxed</span></span><span class="cell"><span>1h 12m</span><span>36%</span></span></span>${close}`;

const TABS = (tab: number) => `${BASE}<style>
  .track { display: flex; inline-size: 300px; overflow-x: auto; scrollbar-width: none; mask-image: linear-gradient(to right, #000 calc(100% - 3px), transparent); }
  .tab { flex: none; display: flex; align-items: center; inline-size: ${tab}px; block-size: 32px; padding-inline: 11px; border-radius: 8px 8px 0 0; background: #d9d2c6; }
</style>
<div class="track" role="tablist" aria-label="Open sessions">${["Approve the deploy key", "Fix tray chip", "Audit the probe", "Rebuild the sheet"].map((name) => `<span class="tab" role="tab" aria-selected="false">${name}</span>`).join("")}</div>`;

const LIST = (rows: string, style = "") =>
  `${BASE}<div class="list" style="display: flex; flex-direction: column; inline-size: 400px; ${style}">${rows}</div>`;

const TAB_LABEL = (sheet: boolean) => `${BASE}<style>
  .shelf { display: flex; align-items: end; block-size: 40px; padding-inline: 25px; background: oklch(0.89 0.013 82); }
  .tab { position: relative; display: flex; align-items: center; block-size: 32px; padding-inline: 14px; }
  .tab svg { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; pointer-events: none; }
  .tab .sheet { fill: oklch(0.92 0.011 83); }
  .tab span { position: relative; z-index: 1; color: oklch(0.495 0.014 74); }
</style>
<div class="shelf"><span class="tab">${
  sheet
    ? `<svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true"><defs><path id="tab-1" d="M0 32 C 6 32 6 0 12 0 H 88 C 94 0 94 32 100 32 Z"/></defs><use class="sheet" href="#tab-1"/></svg>`
    : ""
}<span>Audit the push probe</span></span></div>`;

const SHEET = (
  head: string
) => `${BASE}<div role="dialog" aria-label="Usage limits" style="position: fixed; inset: auto 0 0 0; block-size: 500px; background: #fdfbf7">
  ${head}
  <header style="display: flex; flex-direction: column; gap: 7px; padding: 4px 18px 11px"><div style="display: flex; justify-content: space-between"><h3 style="margin: 0; font-size: 13px">Claude</h3><span>5h+</span></div><div style="display: flex; justify-content: space-between"><span>now</span><span>+1h</span><span>+2h</span></div></header>
  <div style="overflow: auto; block-size: 300px"><p>bewinxed 5h+ 46%</p></div>
</div>`;

const HEAD = `<div data-slot="drawer-header" style="display: flex; align-items: center; justify-content: space-between; block-size: 44px; padding-inline: 16px"><h2 style="margin: 0; font-size: 18px">Usage limits</h2><button aria-label="Close" type="button" style="border: 0; background: none">×</button></div>`;

const POPOVER = (
  foot: string
) => `${BASE}<div data-slot="popover-content" style="position: absolute; inset-block-start: 40px; inset-inline-start: 40px; inline-size: 360px; border: 1px solid #ddd5c8; border-radius: 12px; background: #fdfbf7">
  <div style="padding: 11px">Claude 5h+</div>
  <div data-slot="foot" style="${foot}; padding: 11px 18px"><a href="/usage">Open usage</a></div>
</div>`;

const HAIRLINE = "oklab(0.93584 0.00114568 0.010276)";

const FIXTURES: Record<string, Fixture> = {
  "coral, pins and a chosen record beside the act": {
    rule: "coral",
    html: `${BASE}<style>
  .pin { display: inline-flex; align-items: center; justify-content: center; block-size: 28px; min-inline-size: 28px; border-radius: 999px 999px 999px 2px; background: oklch(0.555 0.17 33); color: #fff; }
  .chosen { display: inline-flex; align-items: center; block-size: 30px; padding-inline: 11px; border: 1px solid oklch(0.645 0.175 33); border-radius: 8px; background: #ece7df; }
</style>
<main><p>Hero headline <span class="pin" aria-hidden="true" data-mark data-state="sent"><span>12</span></span> <span class="pin" aria-hidden="true" data-mark data-state="sent"><span>13</span></span></p>
<p><span class="chosen" data-chosen><span>Stable</span></span></p>
<button class="act" type="button">Reply</button></main>`,
    named: "a mark, not the act",
    want: null,
  },
  "coral, two acts": {
    rule: "coral",
    html: `${BASE}<main><button class="act" type="button">Save</button> <button class="act" type="button">Install now</button></main>`,
    want: "Install now",
  },
  "coral, a sheet of specimens, each a view of its own": {
    rule: "coral",
    html: `${BASE}<main><div class="panel" data-specimen><p>The install failed on studio.</p><button class="act" type="button">Retry</button></div> <div class="panel" data-specimen><p>3 machines run an older build.</p><button class="act" type="button">Install now</button></div> <button class="act" data-specimen type="button">Save</button> <button class="act" data-specimen type="button">Add task</button></main>`,
    want: null,
  },
  "coral, two acts in one specimen": {
    rule: "coral",
    html: `${BASE}<main><div class="panel" data-specimen><button class="act" type="button">Retry</button> <button class="act" type="button">Install now</button></div> <button class="act" data-specimen type="button">Save</button></main>`,
    want: "Install now",
  },
  "coral, a vermillion section rule over the act": {
    rule: "coral",
    html: `${BASE}<main style="inline-size: 360px"><section aria-label="Needs you"><p>Stream relay: use this name</p><button class="act" type="button">Use this name</button></section><section aria-label="Notices" style="margin-block-start: 7px; padding-block-start: 7px; border-block-start: 1px solid oklch(0.645 0.175 33)"><p>A new build is ready on 2 machines.</p><button class="filled" type="button">Install now</button></section></main>`,
    named: "a vermillion section rule",
    want: null,
  },
  "coral, a worded chip edged in coral beside the act": {
    rule: "coral",
    html: `${BASE}<main><span class="tag" style="display: inline-flex; padding-inline: 7px; border: 1px solid oklch(0.645 0.175 33); border-radius: 5px">New</span> <button class="act" type="button">Reply</button></main>`,
    want: "Reply",
  },
  "coral, a worded chip on coral beside the act": {
    rule: "coral",
    html: `${BASE}<main><span style="display: inline-flex; padding-inline: 7px; border-radius: 5px; background: oklch(0.555 0.17 33); color: #fff">New</span> <button class="act" type="button">Reply</button></main>`,
    want: "Reply",
  },
  "mixed-icons, a task ring beside filled glyphs": {
    rule: "mixed-icons",
    html: `${BASE}<header style="display: flex; align-items: center; gap: 7px; inline-size: 400px"><span>Plan</span><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="7.25" fill="none" stroke="#c9c1b5" stroke-width="1.5"/><circle cx="8" cy="8" r="7.25" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="11 45"/><g opacity="0"><polyline points="4,8 7,11 12,5" fill="none" stroke="currentColor" stroke-width="1.8"/></g></svg><span>3/12</span><button type="button" aria-label="Copy" style="border: 0; background: none"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 4h11v16H5z" fill="currentColor"/></svg></button><button type="button" aria-label="Expand" style="border: 0; background: none"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M4 4h7v3H7v4H4zM20 20h-7v-3h4v-4h3z" fill="currentColor"/></svg></button></header>`,
    want: null,
  },
  "mixed-icons, an outlined mark beside filled glyphs": {
    rule: "mixed-icons",
    html: `${BASE}<header style="display: flex; align-items: center; gap: 7px; inline-size: 400px"><span>Plan</span><svg class="outlined" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg><button type="button" aria-label="Copy" style="border: 0; background: none"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 4h11v16H5z" fill="currentColor"/></svg></button></header>`,
    want: "svg.outlined",
  },
  "hidden-cue, a transcript under an edge effect that takes no press": {
    rule: "hidden-cue",
    html: TRANSCRIPT('<div class="fade" aria-hidden="true"></div>'),
    act: scrolledToFoot(".tr"),
    named: "its edge effect",
    want: null,
  },
  "hidden-cue, a transcript cut with no cue": {
    rule: "hidden-cue",
    html: TRANSCRIPT(""),
    act: scrolledToFoot(".tr"),
    want: "Turns",
  },
  "hidden-cue, a hit area past a scroller's edge": {
    rule: "hidden-cue",
    html: `${BASE}<style>
  .body { inline-size: 300px; max-block-size: 200px; overflow-y: auto; }
  .row { display: flex; justify-content: space-between; align-items: center; }
  .row button { position: relative; inline-size: 24px; block-size: 24px; border: 0; background: none; }
  .row button::after { content: ""; position: absolute; inset: -10px; }
</style>
<div class="body"><div class="row"><span>Lint the files this change touched</span><button aria-label="Collapse" type="button">^</button></div></div>`,
    want: null,
  },
  "hidden-cue, a popover trigger's strip dropping a whole cell": {
    rule: "hidden-cue",
    html: STRIP(
      '<button type="button" class="trigger" aria-haspopup="dialog" aria-expanded="false" aria-label="Claude 5h+ then bewinxed. opencode Go back in 1h 12m, 36% left. Show every limit.">',
      "</button>",
      36
    ),
    named: "drops whole items past its edge",
    want: null,
  },
  "hidden-cue, the same strip outside any control": {
    rule: "hidden-cue",
    html: STRIP('<div class="trigger">', "</div>", 36),
    want: "span.strip",
  },
  "hidden-cue, a strip whose fade is cut short, a tab peeking": {
    rule: "hidden-cue",
    html: TABS(128),
    named: "an item peeks",
    want: null,
  },
  "hidden-cue, a masked strip with nothing peeking": {
    rule: "hidden-cue",
    html: TABS(100),
    want: "Open sessions",
  },
  "loose-list, tool rows between taller turns": {
    rule: "loose-list",
    html: LIST(
      [
        "Read app.css",
        "Edited TrayChip.svelte",
        null,
        "Read Shell.svelte",
        "Searched /c-bar-phone-gap/",
        null,
        "git commit -am 'Tray chip'",
      ]
        .map((name) =>
          name
            ? `<div style="display: flex; align-items: center; block-size: 44px">${name}</div>`
            : '<div style="block-size: 120px">The phone row hosts the same chip; the bar already clears the toggle and Caw, so the cap there is the bar less both. It truncates the same way, and the chip keeps its 44px hit area.</div>'
        )
        .join("")
    ),
    want: null,
  },
  "loose-list, rows stretched apart": {
    rule: "loose-list",
    html: LIST(
      ["Plan view build", "Tray chip", "Push probe", "Token sheet", "Bench"]
        .map(
          (name) =>
            `<div style="display: flex; align-items: center; block-size: 44px">${name}</div>`
        )
        .join(""),
      "justify-content: space-between; block-size: 600px"
    ),
    want: "div.list",
  },
  "fat-row, spacing a child's margin holds in its row": {
    rule: "fat-row",
    html: LIST(
      [
        "Read app.css",
        "Edited TrayChip.svelte",
        "Read Shell.svelte",
        "Searched",
      ]
        .map(
          (name) =>
            `<div><div style="display: flow-root"><div style="display: flex; align-items: center; margin-block-start: 14px; block-size: 44px">${name}</div></div></div>`
        )
        .join("")
    ),
    want: null,
  },
  "fat-row, a column of pane groups": {
    rule: "fat-row",
    html: LIST(
      `${'<div data-slot="group" style="block-size: 150px; background: #e3ddd3"><div>Approve the deploy key · Fix tray chip overflow</div></div>'.repeat(2)}<div data-slot="dials" style="block-size: 40px">Taper 32px</div><aside style="block-size: 200px"><p>bench</p><p>bench</p><p>bench</p></aside>`,
      "inline-size: 600px"
    ),
    want: null,
  },
  "fat-row, one-line rows grown tall": {
    rule: "fat-row",
    html: LIST(
      ["Plan view build", "Tray chip", "Push probe", "Token sheet"]
        .map((name) => `<div style="padding-block: 30px">${name}</div>`)
        .join("")
    ),
    want: "Plan view build",
  },
  "uneven-inset, a tab strip with room after its last tab": {
    rule: "uneven-inset",
    html: `${BASE}<div style="display: flex; align-items: end; inline-size: 1000px; block-size: 40px; padding: 4px 14px 0 25px; background: #e3ddd3"><div style="display: flex; gap: 4px">${'<span style="display: flex; align-items: center; inline-size: 190px; block-size: 32px; padding-inline: 11px; background: #f6f3ee">Approve the deploy key</span>'.repeat(4)}</div><button type="button" aria-label="New session" class="filled" style="margin-inline-start: 3px; inline-size: 24px; block-size: 24px; padding: 0">+</button></div>`,
    want: null,
  },
  "uneven-inset, a bar's ghost at its end": {
    rule: "uneven-inset",
    html: `${BASE}<header style="display: flex; justify-content: space-between; align-items: center; inline-size: 1000px; block-size: 44px; padding: 0 4px 0 21px; background: #fdfbf7"><span>Finder bench</span><button type="button" style="block-size: 32px; padding-inline: 11px; border: 1px solid transparent; background: none">Jump ⌘K</button></header>`,
    want: null,
  },
  "uneven-inset, a bar's ghost in a wrapper that paints nothing": {
    rule: "uneven-inset",
    html: `${BASE}<header style="display: flex; justify-content: space-between; align-items: center; inline-size: 1000px; block-size: 44px; padding: 0 0 0 21px; background: #fdfbf7"><span>Finder bench</span><div style="display: flex; padding-inline-end: 4px"><button type="button" style="block-size: 32px; padding-inline: 11px; border: 1px solid transparent; background: none">Jump ⌘K</button></div></header>`,
    want: null,
  },
  "uneven-inset, a timeline's lane and ruler": {
    rule: "uneven-inset",
    html: `${BASE}<div style="inline-size: 1000px; background: #fdfbf7">${[
      "Fill run 1",
      "Fade in",
    ]
      .map(
        (name, at) =>
          `<div style="display: grid; grid-template-columns: 380px 1fr; gap: 12px; block-size: 44px; border-block-start: 1px solid #e3ddd3"><div style="display: flex; align-items: center; padding-inline-start: 30px">${name}</div><div style="position: relative"><span style="position: absolute; inset-block: 12px; inset-inline-start: ${20 + at * 30}%; inline-size: 25%; border-radius: 4px; background: #c9c1b5"></span></div></div>`
      )
      .join(
        ""
      )}<div style="display: grid; grid-template-columns: 380px 1fr; gap: 12px; block-size: 36px; background: #fdfbf7"><div style="display: flex; align-items: center; padding-inline-start: 7px"><button type="button" class="filled">Play</button></div><div style="position: relative">${[
      0, 200, 400,
    ]
      .map(
        (ms, at) =>
          `<span style="position: absolute; inset-block-start: 4px; inset-inline-start: ${at * 30}%">${ms}</span>`
      )
      .join("")}</div></div></div>`,
    want: null,
  },
  "uneven-inset, a bar's padding uneven under a filled button": {
    rule: "uneven-inset",
    html: `${BASE}<header style="display: flex; justify-content: space-between; align-items: center; inline-size: 1000px; block-size: 44px; padding: 0 4px 0 21px; background: #fdfbf7"><span>Finder bench</span><button type="button" class="filled">Jump ⌘K</button></header>`,
    want: "Finder bench",
  },
  "contrast, a label on its tab's own sheet": {
    rule: "contrast",
    html: TAB_LABEL(true),
    want: null,
  },
  "contrast, a label on the shelf itself": {
    rule: "contrast",
    html: TAB_LABEL(false),
    want: "Audit the push probe",
  },
  "empty-pane, an empty editor": {
    rule: "empty-pane",
    html: `${BASE}<style>[data-placeholder]:empty::before { content: attr(data-placeholder); color: #8a8178; }</style><section aria-label="Notes" style="inline-size: 400px; block-size: 240px"><div contenteditable="true" data-placeholder="Please enter…" style="min-block-size: 200px; outline: none"></div></section>`,
    want: null,
  },
  "empty-pane, a pane with nothing in it": {
    rule: "empty-pane",
    html: `${BASE}<section aria-label="Notes" style="inline-size: 400px; block-size: 240px"></section>`,
    want: "Notes",
  },
  "head, a sheet's relay head under its title and Close": {
    rule: "head",
    html: SHEET(HEAD),
    want: null,
  },
  "head, a second line in the sheet's head": {
    rule: "head",
    html: SHEET(
      `<div data-slot="drawer-header" style="display: flex; align-items: center; justify-content: space-between; padding: 7px 16px"><div style="display: flex; flex-direction: column"><h2 style="margin: 0; font-size: 18px">Usage limits</h2><span class="sub">tsk-2026-10-19-plan</span></div><button aria-label="Close" type="button" style="border: 0; background: none">×</button></div>`
    ),
    want: "span.sub",
  },
  "bar-ground, a popover foot's hairline": {
    rule: "bar-ground",
    html: POPOVER(`border-block-start: 1px solid ${HAIRLINE}`),
    named: "a foot's hairline",
    want: null,
  },
  "bar-ground, a foot's fill": {
    rule: "bar-ground",
    html: POPOVER("background: #ece7df"),
    want: "Open usage",
  },
  "bar-ground, a hairline under a head": {
    rule: "bar-ground",
    html: `${BASE}<section style="inline-size: 400px; background: #fdfbf7"><div data-slot="sheet-header" style="display: flex; align-items: center; block-size: 44px; padding-inline: 16px; border-block-end: 1px solid ${HAIRLINE}"><h2 style="margin: 0; font-size: 18px">Usage</h2></div><p style="padding: 11px">Claude 5h+</p></section>`,
    want: "Usage",
  },
};

/**
 * The pair read through impeccable's `text-occlusion`, the overflow rule's
 * other reader, so read where its launcher is: words under an open layer
 * (a popover over the page, as the new-session bench opens one over its own
 * button) are named; words under an opaque box laid over them still fail.
 */
const LAYER_FIXTURES: Record<string, Fixture> = {
  "overflow, a popover over the page's words": {
    rule: "overflow",
    html: `${BASE}<main><button class="filled" type="button">New session</button></main><div data-slot="popover-content" role="dialog" aria-label="New session" style="position: absolute; inset: 24px auto auto 24px; z-index: 50"><div class="sheet" style="inline-size: 400px; block-size: 300px; overflow: auto; border-radius: 12px; background: #fdfbf7"><p style="margin: 0; padding: 21px">Start a session on obelisk</p></div></div>`,
    named: "words under an open layer",
    want: null,
  },
  "overflow, an opaque box laid over a button": {
    rule: "overflow",
    html: `${BASE}<main style="position: relative"><button class="filled" type="button">New session</button><div class="cover" style="position: absolute; inset: 0 auto auto 0; inline-size: 400px; block-size: 300px; background: #fdfbf7"></div></main>`,
    want: "button",
  },
};

/** One fixture read for its rule alone, and checked: the mistake named, or the page drawn right found clean (and named where it says). */
async function readFixture(
  kit: Parameters<Spec["run"]>[0],
  page: Page,
  checks: RenderedChecks,
  label: string,
  fixture: Fixture
): Promise<void> {
  await page.setContent(fixture.html);
  await fixture.act?.(page);
  const why = `rendered-reads: ${label} reads ${fixture.rule} alone`;
  const read = await checks.at(page, label, {
    exempt: Object.fromEntries(
      RULES.filter((rule) => rule !== fixture.rule).map((rule) => [rule, why])
    ),
  });
  const found = read.findings.filter((one) => one.rule === fixture.rule);
  const said =
    found.length > 0
      ? found.map((one) => `${one.element}: ${one.measured}`).join(" | ")
      : `0 findings${fixture.named ? `; named: ${read.named.filter((one) => one.includes(fixture.named ?? "")).join(" | ") || "none"}` : ""}`;
  const { want, named } = fixture;
  if (want) {
    kit.check(
      `rendered-reads: ${label}, ${fixture.rule} names ${want}`,
      found.some((one) => one.element.includes(want)),
      said
    );
  } else {
    kit.check(
      `rendered-reads: ${label}, ${fixture.rule} finds nothing${named ? ` and names it (${named})` : ""}`,
      found.length === 0 &&
        (!named || read.named.some((one) => one.includes(named))),
      said
    );
  }
}

const spec: Spec = {
  group: "The probe kit's own rig",
  name: "rendered-reads",
  run: async (kit) => {
    const page = await kit.page("desk");
    const checks = new RenderedChecks(kit, "rendered-reads", {
      noImpeccable: "rendered-reads proves the kit's own reads",
    });
    for (const [label, fixture] of Object.entries(FIXTURES)) {
      await readFixture(kit, page, checks, label, fixture);
    }
    // impeccable's pair, where its launcher is; said, not failed, where not.
    const withImpeccable = new RenderedChecks(kit, "rendered-reads impeccable");
    await page.setContent(BASE);
    const probe = await withImpeccable.at(page, "impeccable's launcher", {
      exempt: Object.fromEntries(
        RULES.map((rule) => [
          rule,
          "rendered-reads asks only whether impeccable runs",
        ])
      ),
    });
    if (probe.impeccable.ran) {
      for (const [label, fixture] of Object.entries(LAYER_FIXTURES)) {
        await readFixture(kit, page, withImpeccable, label, fixture);
      }
    } else {
      kit.note(
        `rendered-reads: the open-layer pair not read here: ${probe.impeccable.said}`
      );
    }
    await page.close();
  },
};
export default spec;
