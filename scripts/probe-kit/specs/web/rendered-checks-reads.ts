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
 * 12. mixed-icons, a bar hosting tabs: a header holding a tab list whose
 *     tab leads with a filled tile, and a glass of two outlined symbols.
 *     The tabs are read in their own list: no finding.
 * 13. mixed-icons, a filled symbol in a bar's glass: the same header, a
 *     filled symbol beside the outlined ones in its glass: named.
 * 14. bar-room, a sheet head claiming a row: a kit bottom sheet (the
 *     drawer's dialog) whose grabber and header stand in flow, its list's
 *     scroller starting at the header's foot: the rule names it.
 * 15. bar-room, a sheet head over its content: the same sheet, its
 *     grabber and header one stack floating over the sheet's top, the
 *     list's scroller running to that top under it and clearing it by the
 *     sheet's room (`--sheet-room`): no finding.
 * 16. overflow, a clamped tail squeezed: a flex column that scrolls,
 *     holding more clamped paragraphs than it has room for, each hiding
 *     its overflow so its minimum height is 0: the column shrinks them
 *     below their lines, and the rule names them.
 * 17. overflow, a clamped tail kept: the same column, its rows held at
 *     their height (`*:shrink-0`, PeekPane's tail): no finding.
 * 18. overflow, rounded cards squeezed: the same column of cards that
 *     round their corners with `overflow: hidden`, words inside them: the
 *     rule names them.
 * 19. overflow, a pane over its scroller: a page's column whose middle
 *     pane hides its overflow and holds the scroller its words run in,
 *     shrunk to the room left on purpose: no finding.
 * 20. coral, his edit marks: three bare undo glyphs in coral ink, each
 *     after a value he changed (`data-edited`), and the view's coral act:
 *     his own marks, as checked controls are (the owner's pick on
 *     graph-dials-questions `coral`), no finding.
 * 21. coral, an edit mark that says words: the same mark with "Reset" in
 *     it beside the act: a second act, named.
 * 22. text-overlap, a tooltip left open over its trigger: a button its
 *     focus left holding its tooltip open, drawn over its words (a dialog's
 *     Close its autofocus took, title-bars' kit sheet): the park before the
 *     read puts it away, the focus kept, and nothing is named.
 * 23. text-overlap, the same tooltip read where the spec left it (`pointer:
 *     kept`, no park): its words over the button's, named.
 * 24. bar-room, panels under a bar: the head floating over a card whose
 *     panel (a `section` with its own heading) holds the list's scroller
 *     under that heading, as the design graph's stage stands under the
 *     artifact panel's head: the panel's head heads it, no finding.
 * 25. bar-room, a bare section under a bar: the head in flow over a
 *     `section` with no head of its own, its list starting at the head's
 *     foot: the bar claims a row, named.
 * 26. bar-room, a panel's floating head under a bar: the same card, its
 *     panel's own head a bar floating over the panel's list (the design
 *     graph's stage head over its page): that head heads it, no finding.
 *
 *   bun scripts/probe-kit/run.ts web rendered-checks-reads
 */

import {
  type CheckName,
  type CheckOptions,
  RenderedChecks,
} from "../../rendered-checks";
import type { Spec } from "../../spec";

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
/** A bar's glass of outlined symbols (a lens, a box), and `extra` in it. */
const GLASS = (extra: string) =>
  `<div class="glass">${[
    "M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14Z",
    "M4 6h16v12H4Z",
  ]
    .map(
      (d) =>
        `<button type="button" aria-label="Symbol"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="${d}"/></svg></button>`
    )
    .join("")}${extra}</div>`;
/** A filled mark, Solar's bold cut drawn as one shape. */
const FILLED = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M2 6h8l2 2h10v12H2Z"/></svg>`;
const TABS_BAR = `<style>
  header { display: flex; align-items: center; gap: 12px; inline-size: 360px; padding: 8px; }
  [role="tab"] { display: inline-flex; align-items: center; gap: 4px; }
  .glass { display: flex; margin-inline-start: auto; border-radius: 18px; padding: 4px; background: #eee; }
  .glass button { all: unset; display: grid; place-items: center; inline-size: 32px; block-size: 32px; }
</style>`;

/** A kit bottom sheet (ui/drawer): its grabber, its header with Close and the title, and a list that scrolls. */
const SHEET = `<style>
  .sheet { position: fixed; inset-inline: 0; inset-block-end: 0; display: flex; flex-direction: column; block-size: 420px; padding: 9px 16px 16px; --sheet-room: 92px; }
  .grab { margin: 7px auto 12px; inline-size: 100px; block-size: 6px; border-radius: 3px; background: #ddd; flex: none; }
  .sheet [data-slot="drawer-header"] { display: flex; align-items: center; gap: 8px; padding-block-end: 12px; flex: none; }
  .sheet [data-slot="drawer-header"] h2 { margin: 0; font-size: 20px; }
  .sheet [data-slot="tools"] button { inline-size: 36px; block-size: 36px; border: 0; background: none; }
  .float { position: absolute; inset-inline: 0; inset-block-start: 9px; z-index: 2; padding-inline: 16px; }
  .sheet .list { flex: 1; min-block-size: 0; overflow-y: auto; }
  .sheet .under { padding-block-start: var(--sheet-room); }
  .list p { margin: 0; padding: 12px; }
</style>`;
const SHEET_HEAD = `<div class="grab"></div><div data-slot="drawer-header"><div data-slot="tools"><button type="button" aria-label="Close">×</button></div><h2>Usage limits</h2></div>`;
/** A peek's tail: a flex column that scrolls, its turns clamped at three lines. */
const TAIL = (keep: string) => `<style>
  .tail { display: flex; flex-direction: column; gap: 12px; inline-size: 320px; block-size: 240px; margin: 16px; padding: 12px 16px; overflow-y: auto; }
  .tail p { margin: 0; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
  ${keep}
</style><div class="tail">${[
  "The hub rebased the branch onto main and ran the merge checks; the dashboard's build passed, and the probe kit's rendered checks named nothing.",
  "Two delegates are still waiting on a heavy-work slot: the composer canvas has held three of eight for eleven minutes while it renders its stories.",
  "The routine's last run reported the nightly release as shipped, its notes written from the three work items that landed since Tuesday.",
  "A permission ask came in from the phone: the session wants to write outside its workspace, under the shared package cache, and waits on your answer.",
  "The peek now opens at the end of the tail, so the last thing said is the first thing read, and each session keeps its own place.",
]
  .map((turn) => `<p>${turn}</p>`)
  .join("")}</div>`;

interface Case {
  /** What the plant must draw before the read, or the case reads nothing. */
  drawn?: string;
  html: string;
  /** What the read takes beyond the spec's options. */
  more?: CheckOptions;
  rule: CheckName;
  want: "finding" | "none";
}

/** A button its focus left holding its tooltip open over its words (bits-ui marks the trigger `aria-describedby` while open; a blur shuts it). */
const LEFT_OPEN = `<style>
  .tipped { position: relative; margin: 16px; }
  .tip { position: absolute; inset-inline-start: 0; inset-block-start: 4px; padding: 2px 6px; border-radius: 4px; background: #222; color: #fff; font-size: 12px; white-space: nowrap; }
</style><div class="tipped"><button id="press" type="button">Press</button><div class="tip" id="press-tip" role="tooltip" data-slot="tooltip-content" hidden>Press to close</div></div>
<script>
  // In a block: setContent writes into the same window, whose earlier case declared these.
  {
    const press = document.getElementById("press");
    const tip = document.getElementById("press-tip");
    press.addEventListener("focus", () => { tip.hidden = false; press.setAttribute("aria-describedby", "press-tip"); });
    press.addEventListener("blur", () => { tip.hidden = true; press.removeAttribute("aria-describedby"); });
    press.focus();
  }
</script>`;

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
  "panels under a bar": {
    rule: "bar-room",
    want: "none",
    html: `${BASE}${CARD}<section class="card" aria-label="Preview"><header class="float" data-slot="side-head"><h2>Routine form</h2></header><div class="list under" style="display: flex; overflow: clip"><section aria-label="Stage" style="display: flex; flex-direction: column; flex: 1"><h3>Just opened</h3><div class="list">${ROWS}</div></section></div></section>`,
  },
  "a panel's floating head under a bar": {
    rule: "bar-room",
    want: "none",
    html: `${BASE}${CARD}<section class="card" aria-label="Preview"><header class="float" data-slot="side-head"><h2>Routine form</h2></header><div class="list under" style="display: flex; overflow: clip"><section aria-label="Stage" style="position: relative; display: flex; flex-direction: column; flex: 1"><header class="float"><h3>Just opened</h3></header><div class="list under">${ROWS}</div></section></div></section>`,
  },
  "a bare section under a bar": {
    rule: "bar-room",
    want: "finding",
    html: `${BASE}${CARD}<section class="card" aria-label="Task"><header data-slot="side-head"><h2>Run budget</h2></header><section aria-label="Runs" style="display: flex; flex-direction: column; flex: 1; min-block-size: 0"><div class="list">${ROWS}</div></section></section>`,
  },
  "a sheet head claiming a row": {
    rule: "bar-room",
    want: "finding",
    html: `${BASE}${SHEET}<div class="sheet" role="dialog" aria-label="Usage limits" data-slot="drawer-content">${SHEET_HEAD}<div class="list">${ROWS}${ROWS}</div></div>`,
  },
  "a sheet head over its content": {
    rule: "bar-room",
    want: "none",
    html: `${BASE}${SHEET}<div class="sheet" role="dialog" aria-label="Usage limits" data-slot="drawer-content"><div class="float" data-slot="drawer-head">${SHEET_HEAD}</div><div class="list under">${ROWS}${ROWS}</div></div>`,
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
  "a tooltip left open over its trigger": {
    drawn: "#press-tip",
    rule: "text-overlap",
    want: "none",
    html: `${BASE}${LEFT_OPEN}`,
  },
  "a tooltip left open, read unparked": {
    rule: "text-overlap",
    want: "finding",
    drawn: "#press-tip",
    more: { pointer: "kept" },
    html: `${BASE}${LEFT_OPEN}`,
  },
  "a card not chosen": {
    rule: "coral",
    want: "finding",
    html: `${BASE}${CORAL}<div class="card chosen"><button type="button">Hub didn't answer</button></div><button class="act" type="button">Create routine</button>`,
  },
  "a bar hosting tabs": {
    rule: "mixed-icons",
    want: "none",
    html: `${BASE}${TABS_BAR}<header><div role="tablist"><div role="tab" aria-selected="true">${FILLED}<span>Glass bars</span></div></div>${GLASS("")}</header>`,
  },
  "a filled symbol in a bar's glass": {
    rule: "mixed-icons",
    want: "finding",
    html: `${BASE}${TABS_BAR}<header><span>Glass bars</span>${GLASS(`<button type="button" aria-label="Place">${FILLED}</button>`)}</header>`,
  },
  "a clamped tail squeezed": {
    rule: "overflow",
    want: "finding",
    html: `${BASE}${TAIL("")}`,
  },
  "a clamped tail kept": {
    rule: "overflow",
    want: "none",
    html: `${BASE}${TAIL(".tail > * { flex-shrink: 0; }")}`,
  },
  "rounded cards squeezed": {
    rule: "overflow",
    want: "finding",
    html: `${BASE}${TAIL(".tail p { display: block; -webkit-line-clamp: none; } .tail > p { border-radius: 8px; padding: 8px; background: #f3f3f3; }")}`,
  },
  "a pane over its scroller": {
    rule: "overflow",
    want: "none",
    html: `${BASE}<style>
  .page { display: flex; flex-direction: column; block-size: 240px; inline-size: 320px; }
  .bar { block-size: 44px; padding: 12px; flex: none; }
  .pane { min-block-size: 0; overflow: hidden; display: flex; flex-direction: column; }
  .scroll { overflow-y: auto; min-block-size: 0; padding: 12px; }
</style><div class="page"><div class="bar">Run budget</div><div class="pane"><div class="scroll">${ROWS}</div></div></div>`,
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
    for (const [label, { html, drawn, more, rule, want }] of Object.entries(
      CASES
    )) {
      await page.setContent(html);
      if (drawn) {
        kit.check(
          `rendered-checks-reads: ${label}, ${drawn} stands drawn before the read`,
          await page.locator(drawn).isVisible()
        );
      }
      const read = await checks.at(page, label, more);
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
