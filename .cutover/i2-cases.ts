/**
 * The cases i2-exact.ts renders twice, at ac7b79de8 and now. `t` is the
 * element as T's markup wrote it (with `{S0}` … where its component's own
 * scoped class went), `now` as the converted tree writes it. A kit part's
 * class is its own `cn(…)` over its recipe, called from that tree.
 * `only` limits the comparison to the properties a rule governs, where the
 * case does not reproduce the element's whole context.
 */
import { join, resolve } from "node:path";
import { T_DIR } from "./i2-tree";

export type State = {
  name: string;
  width?: number;
  dark?: boolean;
  motion?: "reduce" | "no-preference";
  attrs?: { sel: string; name: string; value: string | null }[];
  force?: { sel: string; pseudo: string[] }[];
};
export type Case = {
  name: string;
  files?: string[];
  t: string;
  now: string;
  states?: State[];
  only?: string[];
  show?: string[];
};

const app = resolve(import.meta.dir, "../apps/dashboard/src");
const tApp = join(T_DIR, "apps/dashboard/src");
const ui = (root: string, part: string) =>
  join(root, "lib/components/ui", part);

const { cn } = await import(join(app, "lib/utils.ts"));
const { cn: tcn } = await import(join(tApp, "lib/utils.ts"));
const { tableHeadVariants } = await import(ui(app, "table/table-head.svelte"));
const { tableRowVariants } = await import(ui(app, "table/table-row.svelte"));
const { tableCellVariants } = await import(ui(app, "table/table-cell.svelte"));
const { spinnerVariants } = await import(ui(app, "spinner/spinner.svelte"));
const { drawerContentVariants } = await import(
  ui(app, "drawer/drawer-content.svelte")
);
const { buttonVariants } = await import(ui(app, "button/button.svelte"));
const { buttonVariants: tButtonVariants } = await import(
  ui(tApp, "button/button.svelte")
);
const { textareaVariants } = await import(ui(app, "textarea/textarea.svelte"));

const REST: State = { name: "rest" };
const focus = (sel = "[data-check]"): State => ({
  name: "focus-visible",
  force: [{ sel, pseudo: ["focus", "focus-visible"] }],
});
const OUTLINE = ["outline"];

/** T's kit table parts, as their own `cn(…)` wrote them. */
const T_ROW = "border-b transition-colors data-[state=selected]:bg-muted";
const T_HEAD =
  "h-12 whitespace-nowrap px-3 text-left align-middle text-foreground text-label [&:has([role=checkbox])]:pr-0";
const T_CELL =
  "whitespace-nowrap p-3 align-middle [&:has([role=checkbox])]:pr-0";
/** The current drawer's own classes, before its recipe. */
const DRAWER_BASE =
  "group/drawer-content fixed z-50 flex h-auto flex-col bg-transparent p-4 text-ink-strong text-label";

const outline = (
  name: string,
  file: string,
  t: string,
  now: string,
  sel = "[data-check]"
): Case => ({
  name,
  files: [file],
  t,
  now,
  states: [REST, focus(sel)],
  only: OUTLINE,
});

export const CASES: Case[] = [
  // ---------------------------------------------------------- the fixes
  {
    name: "ViewTable.svelte:66 band head, variant caps",
    files: ["src/lib/cawco/views/openui/ViewTable.svelte"],
    t: `<div class="{S0} ledger"><table class="w-full caption-bottom text-body"><thead><tr class="${tcn(T_ROW, "band border-0")}"><th data-check="head" class="${tcn(T_HEAD)}" scope="col">When</th></tr></thead></table></div>`,
    now: `<div class="overflow-hidden rounded-lg bg-surface-raised shadow-tile"><table class="w-full caption-bottom text-body"><thead><tr class="${cn(tableRowVariants({ variant: "band" }))}"><th data-check="head" class="${cn(tableHeadVariants({ variant: "caps" }), "h-c-toolbar-ctl")}" scope="col">When</th></tr></thead></table></div>`,
    only: [
      "font",
      "letter-spacing",
      "text-transform",
      "color",
      "padding",
      "height",
    ],
  },
  {
    name: "table-row picks-stacks: picked over selected",
    files: ["src/lib/cawco/tasks/TaskTable.svelte"],
    t: `<div class="{S0} ledger" data-pickable><table class="tasks"><tbody><tr data-check="row" class="${tcn(T_ROW, "row")}" data-picked data-state="selected"><td>a</td></tr></tbody></table></div>`,
    now: `<div><table><tbody><tr data-check="row" class="${cn(tableRowVariants({ variant: "picks-stacks" }), "group/row relative")}" data-picked data-state="selected"><td>a</td></tr></tbody></table></div>`,
    states: [
      { name: "phone", width: 400 },
      { name: "desk", width: 1280 },
    ],
    only: ["background-color"],
  },
  {
    name: "TaskTable.svelte:317 created cell on a phone",
    files: ["src/lib/cawco/tasks/TaskTable.svelte"],
    t: `<div style="container-type:inline-size" class="{S0} ledger"><table class="tasks"><tbody><tr class="${tcn(T_ROW, "row")}"><td data-check="created" class="${tcn(T_CELL, "col-created")}">1d</td></tr></tbody></table></div>`,
    now: `<div style="container-type:inline-size"><table><tbody><tr class="${cn(tableRowVariants({ variant: "picks-stacks" }), "group/row")}"><td data-check="created" class="${cn(tableCellVariants({ variant: "ledger-picks-stacks" }), "w-(--col-w) h-c-btn-h-lg text-end @max-decisions-900px:hidden max-phone:@max-decisions-900px:hidden max-phone:w-auto max-phone:h-auto")}">1d</td></tr></tbody></table></div>`,
    states: [
      { name: "phone", width: 400 },
      { name: "tablet", width: 800 },
      { name: "desk", width: 1280 },
    ],
    only: ["display"],
  },
  {
    name: "Spinner glyph-busy (RolloutChip's cell)",
    files: ["src/lib/cawco/config/RolloutChip.svelte"],
    t: `<span class="{S0} glyph" data-glyph="busy"><svg data-check="spin" data-for="busy" class="size-4 animate-spin"></svg></span><span class="group"><span class="{S0} glyph" data-glyph="done"><svg data-check="spin-idle" data-for="busy" class="size-4 animate-spin"></svg></span></span>`,
    now: `<span class="group inline-grid" data-slot="glyph" data-glyph="busy"><svg data-check="spin" data-for="busy" class="${cn("size-icon-md animate-spin", spinnerVariants({ reveal: "glyph-busy" }), "col-start-1 row-start-1 size-icon-sm flex-none")}"></svg></span><span class="group"><span class="group inline-grid" data-slot="glyph" data-glyph="done"><svg data-check="spin-idle" data-for="busy" class="${cn("size-icon-md animate-spin", spinnerVariants({ reveal: "glyph-busy" }), "col-start-1 row-start-1 size-icon-sm flex-none")}"></svg></span></span>`,
    only: ["animation-play-state"],
    show: ["animation-play-state"],
  },
  {
    name: "TableCell between (ActionsTable's rows)",
    files: ["src/lib/cawco/routines/ActionsTable.svelte"],
    t: `<div class="{S0} actions-ledger"><table><tbody><tr class="${tcn(T_ROW, "action")}"><td data-check="first" class="${tcn(T_CELL)}">a</td></tr><tr class="${tcn(T_ROW, "action")}"><td data-check="second" class="${tcn(T_CELL)}">b</td></tr></tbody></table></div>`,
    now: `<div><table><tbody><tr class="${cn(tableRowVariants({}), "group/row")}"><td data-check="first" class="${cn(tableCellVariants({ variant: "list", rule: "between" }), "h-c-btn-h-lg num align-middle")}">a</td></tr><tr class="${cn(tableRowVariants({}), "group/row")}"><td data-check="second" class="${cn(tableCellVariants({ variant: "list", rule: "between" }), "h-c-btn-h-lg num align-middle")}">b</td></tr></tbody></table></div>`,
    only: ["border-top"],
    show: ["border-top-width", "border-top-style"],
  },
  {
    name: "NeedsYouChip.svelte:44 count",
    files: ["src/lib/cawco/project/NeedsYouChip.svelte"],
    t: `<button class="{S0} needs" aria-pressed="false"><span data-check="num" data-slot="num" class="{S0} num">12</span></button>`,
    now: `<button aria-pressed="false"><span data-check="num" data-slot="num" class="num text-status-attn-ink">12</span></button>`,
    only: ["font-variant-numeric", "color"],
  },
  {
    name: "ProjectHead.svelte:372 title, no tracking of its own",
    files: ["src/lib/cawco/project/ProjectHead.svelte"],
    t: `<div style="letter-spacing:0.3px"><h1 data-check="title" class="{S0} title">Cockpit</h1></div>`,
    now: `<div style="letter-spacing:0.3px"><h1 data-check="title" data-slot="title" class="type-title wrap-anywhere text-ink-strong">Cockpit</h1></div>`,
    only: ["font", "letter-spacing", "color", "overflow-wrap"],
  },
  {
    name: "PlacePick.svelte:79 title, no tracking of its own",
    files: ["src/lib/cawco/preview/PlacePick.svelte"],
    t: `<div style="letter-spacing:0.3px"><h2 data-check="title" class="{S0} pick-title">Pick a machine and folder</h2></div>`,
    now: `<div style="letter-spacing:0.3px"><h2 data-check="title" class="type-title text-ink-strong">Pick a machine and folder</h2></div>`,
    only: ["font", "letter-spacing", "color"],
  },
  {
    name: "UsageMeter.svelte:547 the +N slot (type-roles on set 7)",
    files: ["src/lib/cawco/UsageMeter.svelte"],
    t: `<div style="font-style:italic;font-variant-ligatures:none"><span data-check="more" class="{S0} slot more" data-more>+2</span></div>`,
    now: `<div style="font-style:italic;font-variant-ligatures:none"><span data-check="more" data-slot="slot" data-more class="absolute start-(--slot-at) top-0 grid h-icon-md min-w-(--mark-min) place-items-center type-meta leading-(--more-lh) num text-ink-muted transition-[inset-inline-start] dur-reveal ease-in-out motion-reduce:transition-off" style="--more-lh:16px">+2</span></div>`,
    only: ["font", "line-height", "color"],
  },
  {
    name: "MentionField.svelte:711 editor and :766 tip handle (type-roles on set 9)",
    files: ["src/lib/cawco/find/MentionField.svelte"],
    t: `<div style="font-style:italic;font-variant-numeric:tabular-nums"><div data-check="editor" class="{S0} editor" contenteditable="true">hi</div><div class="{S0} tip"><span class="{S0} tip-handle" data-check="handle">@a</span></div></div>`,
    now: `<div style="font-style:italic;font-variant-numeric:tabular-nums"><div data-check="editor" class="relative min-h-(--editor-min-h) max-h-(--editor-max-h) overflow-y-auto py-space-2 type-body text-(length:--editor-fs) leading-ui text-ink-strong caret-brand-solid whitespace-pre-wrap wrap-anywhere no-scrollbar outline-off" style="--editor-fs:16px" contenteditable="true">hi</div><div data-slot="tip" class="type-meta"><span class="type-code opacity-80" data-check="handle">@a</span></div></div>`,
    only: ["font", "line-height"],
  },

  // ------------------------------------- outline: none → outline-off (18)
  outline(
    "CanvasStages.svelte:181 .grab",
    "src/lib/cawco/canvas/CanvasStages.svelte",
    `<div data-check="grab" tabindex="0" class="{S0} grab"></div>`,
    `<div data-check="grab" tabindex="0" class="group/grab absolute flex touch-none outline-off"></div>`
  ),
  outline(
    "SectionRow.svelte:153/:162 .link, .label",
    "src/lib/cawco/config/SectionRow.svelte",
    `<a data-check="link" href="#x" class="{S0} link">A</a><span data-check="label" tabindex="0" class="{S0} label">B</span>`,
    `<a data-check="link" href="#x" class="truncate text-inherit no-underline outline-off">A</a><span data-check="label" tabindex="0" class="truncate text-inherit no-underline outline-off">B</span>`
  ),
  outline(
    "FindRow.svelte:61 .row",
    "src/lib/cawco/find/FindRow.svelte",
    `<button data-check="row" class="{S0} row">r</button>`,
    `<button data-check="row" class="group/row mark-line relative grid grid-cols-(--row-cols) grid-rows-(--row-rows) gap-x-space-2 items-center w-full min-h-(--row-min) px-space-3 py-(--row-pad) border-none border-current rounded-sm bg-transparent text-start box-border cursor-default outline-off select-none active:bg-surface-fill">r</button>`
  ),
  outline(
    "Finder.svelte:469 .field input",
    "src/lib/cawco/find/Finder.svelte",
    `<div class="{S0} field"><input data-check="in" class="{S0}"></div>`,
    `<div><input data-check="in" class="flex-1 min-w-0 h-full border-none border-current p-0 bg-transparent type-body text-ink-strong caret-brand-solid outline-off placeholder:text-ink-subtle placeholder:text-ellipsis"></div>`
  ),
  outline(
    "MentionField.svelte:711 .editor",
    "src/lib/cawco/find/MentionField.svelte",
    `<div data-check="editor" contenteditable="true" class="{S0} editor">x</div>`,
    `<div data-check="editor" contenteditable="true" class="relative min-h-(--editor-min-h) max-h-(--editor-max-h) overflow-y-auto py-space-2 type-body text-(length:--editor-fs) leading-ui text-ink-strong caret-brand-solid whitespace-pre-wrap wrap-anywhere no-scrollbar outline-off">x</div>`
  ),
  outline(
    "CawPanel.svelte:335 .empty",
    "src/lib/cawco/home/CawPanel.svelte",
    `<div data-check="empty" tabindex="-1" class="{S0} empty">e</div>`,
    `<div data-check="empty" tabindex="-1" class="grid justify-items-center gap-space-2 px-space-4 pt-space-6 pb-space-5 type-label text-ink-muted outline-off">e</div>`
  ),
  outline(
    "HomeRecent.svelte:147 .search input",
    "src/lib/cawco/home/HomeRecent.svelte",
    `<label class="{S0} search"><input data-check="in" class="{S0}"></label>`,
    `<label><input data-check="in" class="min-w-0 flex-auto border-none border-current bg-transparent type-body text-ink-strong outline-off"></label>`
  ),
  outline(
    "Lightbox.svelte:223 .doc-view",
    "src/lib/cawco/lightbox/Lightbox.svelte",
    `<div data-check="doc" tabindex="-1" class="doc-view">d</div>`,
    `<div data-check="doc" tabindex="-1" class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-space-4 outline-off">d</div>`
  ),
  outline(
    "LocationSection.svelte:234/:500 input",
    "src/lib/cawco/spawn/LocationSection.svelte",
    `<input data-check="in" class="{S0}">`,
    `<input data-check="in" class="min-h-(--min-h) min-w-0 flex-1 border-none border-current bg-transparent p-0 font-(family-name:--font-mono) text-size-label leading-(--lh) font-normal text-ink-strong outline-off">`
  ),
  outline(
    "NewSessionDialog.svelte:1808 .session-card (dialog)",
    "src/lib/cawco/spawn/NewSessionDialog.svelte",
    `<div data-check="card" tabindex="-1" class="session-card">c</div>`,
    `<div data-check="card" tabindex="-1" class="ns-theme fixed z-81 flex origin-center flex-col outline-off inset-0 m-auto h-fit rounded-lg bg-surface-recess p-space-2 shadow-modal">c</div>`
  ),
  outline(
    "NewSessionDialog.svelte:1758 .session-card (drawer, DrawerContent look new-session)",
    "src/lib/cawco/spawn/NewSessionDialog.svelte",
    `<div data-check="card" tabindex="-1" class="session-card">c</div>`,
    `<div data-check="card" tabindex="-1" class="${cn(DRAWER_BASE, drawerContentVariants({ look: "new-session" }), "fixed z-81 flex origin-center flex-col")}">c</div>`
  ),
  outline(
    "ProjectChip.svelte:143/:166 .field input",
    "src/lib/cawco/spawn/ProjectChip.svelte",
    `<label class="{S0} field"><input data-check="in" class="{S0}"></label>`,
    `<label class="field-shell"><input data-check="in" class="min-w-0 flex-1 border-none border-current bg-transparent p-0 font-body text-size-body leading-(--lh) font-normal text-ink-strong outline-off"></label>`
  ),
  outline(
    "PromptEditor.svelte:325 .editor",
    "src/lib/cawco/spawn/PromptEditor.svelte",
    `<div data-check="editor" contenteditable="true" class="{S0} editor">p</div>`,
    `<div data-check="editor" contenteditable="true" class="h-(--prompt-height) w-full overflow-auto rounded-t-lg bg-transparent font-body font-normal whitespace-pre-wrap text-ink-strong outline-off">p</div>`
  ),
  outline(
    "ToolGroup.svelte:412 .artifact-open:focus-visible",
    "src/lib/cawco/transcript/ToolGroup.svelte",
    `<button data-check="open" class="{S0} artifact-open">o</button>`,
    `<button data-check="open" class="flex items-center gap-space-2 flex-1 min-w-0 border-none border-current p-space-2 bg-transparent text-ink-strong text-size-label font-medium text-start cursor-pointer focus-visible:outline-off">o</button>`
  ),
  outline(
    "Peer.svelte:227 the trigger (residual, unchanged)",
    "src/lib/cawco/transcript/Peer.svelte",
    `<p class="{S0} label"><button data-check="toggle" class="peer-toggle">t</button></p>`,
    `<p data-slot="peer-label" class="{S0} relative min-h-(--label-min) m-0 type-label leading-ui text-ink-muted rail-line"><button data-check="toggle" data-slot="collapsible-trigger">t</button></p>`
  ),
  {
    name: "Composer.svelte:3365 the pill, recalling and grown",
    files: ["src/lib/cawco/transcript/Composer.svelte"],
    t: `<form data-check="recalling" class="{S0} cin kit-dock-shell field-shell recalling"><textarea class="{S0}"></textarea></form><form data-check="grown" class="{S0} cin kit-dock-shell field-shell grown"><textarea class="{S0}"></textarea></form><form data-check="plain" class="{S0} cin kit-dock-shell field-shell"><textarea class="{S0}"></textarea></form>`,
    now: ["recalling", "grown", "plain"]
      .map(
        (s) =>
          `<form data-check="${s}" ${s === "plain" ? "" : `data-${s}`} class="group/cin kit-dock-shell field-shell relative z-2 flex items-end gap-space-2 data-recalling:bg-transparent data-recalling:border-transparent data-recalling:shadow-none data-grown:bg-transparent data-grown:border-transparent data-grown:shadow-none data-recalling:outline-off data-grown:outline-off [&:is([data-recalling],[data-grown]):has(:is(input,textarea,select,[contenteditable]):focus-visible)]:outline-off"><textarea></textarea></form>`
      )
      .join(""),
    states: [REST, focus("textarea")],
    only: OUTLINE,
  },

  // ------------- the sweep: global classes the conversion dropped from markup
  ...[
    [
      "DecisionNode.svelte:41 the dot",
      "src/lib/cawco/decisions/graph/DecisionNode.svelte",
      `<div class="{S0} decision-node"><span aria-hidden="true" data-check="ring" class="{S0} ring"></span></div>`,
      `<div class="group"><span aria-hidden="true" data-check="ring" class="ring size-icon-sm flex-none rounded-(--ring-r) border-(length:--ring-border) border-ink-muted group-data-picked:border-status-done-glyph group-data-picked:bg-status-done-glyph" style="--ring-border:1.5px;--ring-r:50%"></span></div>`,
    ],
    [
      "DocThumb.svelte:92 the progress ring",
      "src/lib/cawco/transcript/DocThumb.svelte",
      `<span class="{S0} glyph"><svg data-check="ring" class="{S0} ring" viewBox="0 0 24 24"></svg></span>`,
      `<span data-slot="glyph" class="grid place-items-center flex-none text-ink-muted"><svg data-check="ring" data-slot="ring" class="ring size-icon-md m-space-1 -rotate-90" viewBox="0 0 24 24"></svg></span>`,
    ],
    [
      "TabsList.svelte:1154 the focus ring",
      "src/lib/components/ui/fluid-tabs/TabsList.svelte",
      `<div class="{S0} tabs-list"><div data-check="ring" aria-hidden="true" class="{S0} ring"></div></div>`,
      `<div><div data-check="ring" aria-hidden="true" class="ring pointer-events-none absolute start-0 top-0 z-4 h-(--box-h) w-(--box-w) transform-(--box-at) rounded-(--shape) border-(length:--focus-ring-width) border-focus-ring motion-safe:transition-[transform,width,height] motion-safe:dur-ghost motion-safe:ease-out"></div></div>`,
    ],
  ].map(([name, file, t, now]) => ({
    name,
    files: [file],
    t,
    now,
    only: ["box-shadow"],
  })),
  {
    name: "thinking-indicator.svelte:120 the word",
    files: [
      "src/lib/components/ui/thinking-indicator/thinking-indicator.svelte",
    ],
    t: `<span data-check="word" class="{S0} shimmer">Thinking</span>`,
    now: `<span data-check="word" class="{S0} shimmer motion-safe:relative motion-safe:inline-block">Thinking</span>`,
    states: [REST, { name: "reduced motion", motion: "reduce" }],
    only: [
      "background",
      "-webkit-text-fill-color",
      "animation",
      "position",
      "display",
      "color",
    ],
  },
  {
    name: "thinking-step.svelte:139 an active step's label",
    files: ["src/lib/components/ui/thinking-steps/thinking-step.svelte"],
    t: `<div class="{S0} copy"><span data-check="label" data-slot="thinking-step-label" class="{S0} label shimmer">Reading</span></div>`,
    now: `<div><span data-check="label" data-slot="thinking-step-label" class="{S0} font-normal text-ink-strong transition-[color] dur-control ease-out status-ahead:text-ink-muted motion-safe:not-status-ahead:data-shimmer:text-transparent motion-safe:data-shimmer:bg-(image:--step-shimmer) motion-safe:data-shimmer:bg-size-(--step-shimmer-size) motion-safe:data-shimmer:bg-repeat motion-safe:data-shimmer:bg-clip-text shimmer" data-shimmer data-status="active" style="--step-shimmer:linear-gradient(90deg, var(--ink-muted) 0% 35%, var(--ink-strong) 50%, var(--ink-muted) 65% 100%);--step-shimmer-size:300% 100%">Reading</span></div>`,
    states: [REST, { name: "reduced motion", motion: "reduce" }],
    only: ["background", "-webkit-text-fill-color", "animation-name", "color"],
  },
  {
    name: "History.svelte:306/:421/:437 the figures",
    files: ["src/lib/cawco/usage/History.svelte"],
    t: `<div class="{S0} pair"><span data-check="total" class="{S0} num total">$12</span></div><div class="{S0} figures"><table class="{S0}"><thead><tr class="{S0}"><th data-check="th" class="{S0} num" scope="col">Spend</th></tr></thead><tbody><tr class="{S0}"><td data-check="td" class="{S0} num">$1</td></tr></tbody></table></div>`,
    now: `<div><span data-check="total" data-slot="num" class="type-label num text-ink-strong">$12</span></div><div><table><thead><tr><th data-check="th" data-slot="num" class="type-label num border-b border-b-border-hairline px-0 py-space-1 text-end text-ink-muted" scope="col">Spend</th></tr></thead><tbody><tr><td data-check="td" data-slot="num" class="num border-b border-b-border-hairline px-0 py-space-1 text-end text-ink-strong">$1</td></tr></tbody></table></div>`,
    only: ["font-variant-numeric"],
  },
  {
    name: "MoveWait.svelte:477/:511 the share",
    files: ["src/lib/cawco/move/MoveWait.svelte"],
    t: `<span data-check="meta" data-num data-slot="meta" class="{S0} meta num">40% · 2 of 5</span>`,
    now: `<span data-check="meta" data-num data-slot="meta" class="type-meta text-ink-muted num">40% · 2 of 5</span>`,
    only: ["font", "color"],
  },
  {
    name: "PlanRing.svelte:36 the count",
    files: ["src/lib/cawco/plan/PlanRing.svelte"],
    t: `<span data-check="num" data-slot="num" class="{S0} num">2/5</span>`,
    now: `<span data-check="num" data-slot="num" class="num">2/5</span>`,
    only: ["font-variant-numeric"],
  },
  {
    name: "TextSection.svelte:50 the Edit button in its section head",
    files: ["src/lib/cawco/tasks/TextSection.svelte"],
    t: `<section class="{S0} part"><h3 class="kit-section-head"><span>Notes</span><button data-check="edit" class="${tcn(tButtonVariants({ variant: "ghost", size: "xs" }), "count")}">Edit</button></h3></section>`,
    now: `<section class="flex flex-col gap-space-2"><h3 class="kit-section-head min-h-c-btn-h-xs m-0 px-0"><span>Notes</span><button data-check="edit" class="${cn(buttonVariants({ variant: "ghost", size: "xs", head: "count" }))}">Edit</button></h3></section>`,
    only: ["margin", "font", "color", "line-height"],
  },
  {
    name: "MachinesEmpty.svelte:92 the card grid",
    files: ["src/lib/cawco/MachinesEmpty.svelte"],
    t: `<div data-check="grid" class="{S0} icon-cards"><button class="icon-card">a</button><button class="icon-card">b</button><button class="icon-card">c</button></div>`,
    now: `<div data-check="grid" class="icon-cards mt-space-4 w-full"><button class="icon-card">a</button><button class="icon-card">b</button><button class="icon-card">c</button></div>`,
    states: [
      { name: "desk", width: 1280 },
      { name: "phone", width: 500 },
      { name: "narrow", width: 380 },
    ],
    only: [
      "display",
      "grid-template-columns",
      "gap",
      "row-gap",
      "column-gap",
      "position",
      "margin-top",
      "width",
    ],
  },
  ...[
    [
      "ModelCombobox.svelte:191",
      "src/lib/cawco/ModelCombobox.svelte",
      `<span><span data-check="m" class="{S0} font-mono">x</span></span>`,
      `<span><span data-check="m" class="font-mono">x</span></span>`,
    ],
    [
      "ModelCombobox.svelte:219",
      "src/lib/cawco/ModelCombobox.svelte",
      `<span data-check="m" class="{S0} min-w-0 overflow-clip text-ellipsis whitespace-nowrap font-mono text-meta">x</span>`,
      `<span data-check="m" class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap font-mono text-meta">x</span>`,
    ],
    [
      "RuleTester.svelte:78 the textarea",
      "src/lib/cawco/RuleTester.svelte",
      `<textarea data-check="m" class="resize-y font-mono text-label"></textarea>`,
      `<textarea data-check="m" class="${cn(textareaVariants({ face: "mono", text: "label" }), "resize-y")}"></textarea>`,
    ],
    [
      "RuleTester.svelte:96 the preview",
      "src/lib/cawco/RuleTester.svelte",
      `<div data-check="m" class="{S0} preview relative grid max-h-40 overflow-y-auto font-mono text-label leading-relaxed">x</div>`,
      `<div data-check="m" class="relative grid max-h-40 overflow-y-auto rounded-sm bg-surface-page font-mono text-label leading-relaxed">x</div>`,
    ],
    [
      "TaskPanel.svelte:100",
      "src/lib/cawco/TaskPanel.svelte",
      `<span data-check="m" class="{S0} shrink-0 font-mono text-meta tabular-nums">x</span>`,
      `<span data-check="m" class="shrink-0 font-mono text-meta text-ink-muted tabular-nums">x</span>`,
    ],
    [
      "PeekPane.svelte:298",
      "src/lib/cawco/PeekPane.svelte",
      `<span data-check="m" class="{S0} min-w-0 truncate font-mono [direction:rtl]">x</span>`,
      `<span data-check="m" data-slot="cwd" class="dir-rtl min-w-0 truncate font-mono">x</span>`,
    ],
    [
      "PeekPane.svelte:369",
      "src/lib/cawco/PeekPane.svelte",
      `<span data-check="m" class="{S0} min-w-0 overflow-clip text-ellipsis whitespace-nowrap font-mono">x</span>`,
      `<span data-check="m" class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap font-mono">x</span>`,
    ],
    [
      "PeekPane.svelte:519",
      "src/lib/cawco/PeekPane.svelte",
      `<span data-check="m" class="{S0} truncate font-mono">x</span>`,
      `<span data-check="m" class="truncate font-mono">x</span>`,
    ],
    [
      "ToolMatrix.svelte:113",
      "src/lib/cawco/ToolMatrix.svelte",
      `<span data-check="m" data-slot="num" class="{S0} num font-mono">3</span>`,
      `<span data-check="m" data-slot="num" class="num font-mono">3</span>`,
    ],
    [
      "ToolMatrix.svelte:184",
      "src/lib/cawco/ToolMatrix.svelte",
      `<span data-check="m" class="{S0} ml-auto shrink-0 font-mono text-label">x</span>`,
      `<span data-check="m" class="ml-auto shrink-0 font-mono text-label text-ink-muted">x</span>`,
    ],
    [
      "ToolMatrix.svelte:237",
      "src/lib/cawco/ToolMatrix.svelte",
      `<p data-check="m" class="{S0} font-mono text-label">x</p>`,
      `<p data-check="m" class="font-mono text-label">x</p>`,
    ],
  ].map(([name, file, t, now]) => ({
    name: `${name} font-mono`,
    files: [file],
    t,
    now,
    only: ["font-family", "font-variant-ligatures"],
  })),
];
