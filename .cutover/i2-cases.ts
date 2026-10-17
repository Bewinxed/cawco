/**
 * The cases i2-exact.ts renders twice, at their source of record and now.
 * `t` is the element as the source's markup wrote it (ac7b79de8; for a
 * change main made after T, a7e27322c, the case's `at`), with `{S0}` …
 * where its component's own scoped class went; `now` as the converted tree
 * writes it. A kit part's class is its own `cn(…)` over its recipe, called
 * from that tree, and a component's element is read from its own source
 * (`element`) with the ancestors and custom properties it renders under, so
 * every computed property compares.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { M, M_DIR, T, T_DIR } from "./i2-tree";

export interface State {
  attrs?: { sel: string; name: string; value: string | null }[];
  dark?: boolean;
  force?: { sel: string; pseudo: string[] }[];
  motion?: "reduce" | "no-preference";
  name: string;
  width?: number;
}
export interface Case {
  /** The sha `t` is written at: T unless main changed it after T (M). */
  at?: string;
  files?: string[];
  name: string;
  now: string;
  show?: string[];
  states?: State[];
  t: string;
}

const MAX_BUFFER = 64 * 1024 * 1024;
const CLASS_TEXT = /\sclass="([^"]*)"/;
const CLASS_ARRAY = /\sclass=\{\[\s*"([^"]*)"/;
const STYLE_VAR = /style:(--[\w-]+)=(?:"([^"{]*)"|\{"([^"]*)"\})/g;
const STYLE_TEXT = /\sstyle="([^"{}]*)"/;
const SPACES = /\s+/g;
const CN_BASE = /class=\{cn\(\s*"([^"]*)"/;

const app = resolve(import.meta.dir, "../apps/dashboard/src");
const tApp = join(T_DIR, "apps/dashboard/src");
const mApp = join(M_DIR, "apps/dashboard/src");
const ui = (root: string, part: string) =>
  join(root, "lib/components/ui", part);

const { cn } = await import(join(app, "lib/utils.ts"));
const { cn: tcn } = await import(join(tApp, "lib/utils.ts"));
const { tableHeadVariants } = await import(ui(app, "table/table-head.svelte"));
const { tableRowVariants } = await import(ui(app, "table/table-row.svelte"));
const { tableVariants } = await import(ui(app, "table/table.svelte"));
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
const { inputVariants } = await import(ui(app, "input/input.svelte"));
const { sidebarMenuBadgeVariants } = await import(
  ui(app, "sidebar/sidebar-menu-badge.svelte")
);
const { alertVariants } = await import(ui(app, "alert/alert.svelte"));
const { alertVariants: mAlertVariants } = await import(
  ui(mApp, "alert/alert.svelte")
);

/** Where a source is read: at T, at M (`git show`), or as it stands. */
type At = "t" | "m" | "now";
const SHAS = { t: T, m: M } as const;

const repo = resolve(import.meta.dir, "..");
const sources = new Map<string, string>();
/** A component's text: at T or M (`git show`), or as it stands. */
function source(file: string, at: At): string {
  const key = `${at}:${file}`;
  if (!sources.has(key)) {
    sources.set(
      key,
      at === "now"
        ? readFileSync(join(repo, "apps/dashboard", file), "utf8")
        : execFileSync(
            "git",
            ["-C", repo, "show", `${SHAS[at]}:apps/dashboard/${file}`],
            {
              encoding: "utf8",
              maxBuffer: MAX_BUFFER,
            }
          )
    );
  }
  return sources.get(key) as string;
}

/** The start tag that holds `anchor`: from its `<` to its own `>`. */
function startTag(text: string, anchor: string): string {
  const at = text.indexOf(anchor);
  if (at === -1) {
    throw new Error(`no ${anchor}`);
  }
  const open = text.lastIndexOf("<", at);
  let depth = 0;
  let quote = "";
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      quote = ch === quote ? "" : quote;
    } else if (ch === '"' || ch === "`") {
      quote = ch;
    } else if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
    } else if (ch === ">" && depth === 0) {
      return text.slice(open, i + 1);
    }
  }
  throw new Error(`no end for ${anchor}`);
}

/**
 * An element as its source writes it: the static part of its class (the
 * attribute's text, or the first string of a `class={[…]}`) and its
 * literal custom properties as an inline style.
 */
export function element(file: string, at: At, anchor: string) {
  const tag = startTag(source(file, at), anchor);
  const cls = tag.match(CLASS_TEXT)?.[1] ?? tag.match(CLASS_ARRAY)?.[1] ?? "";
  const vars = [...tag.matchAll(STYLE_VAR)]
    .map((m) => `${m[1]}:${m[2] ?? m[3]}`)
    .concat(tag.match(STYLE_TEXT)?.[1] ?? [])
    .join(";");
  return { cls: cls.replace(SPACES, " ").trim(), style: vars };
}

/** `class="…" style="…"` for an element, with extra classes before it. */
function attrs(file: string, at: At, anchor: string, extra = ""): string {
  const e = element(file, at, anchor);
  return `class="${`${extra} ${e.cls}`.trim()}" style="${e.style}"`;
}

const REST: State = { name: "rest" };
const focus = (sel = "[data-check]"): State => ({
  name: "focus-visible",
  force: [{ sel, pseudo: ["focus", "focus-visible"] }],
});

/** T's kit table parts, as their own `cn(…)` wrote them. */
const T_ROW = "border-b transition-colors data-[state=selected]:bg-muted";
const T_HEAD =
  "h-12 whitespace-nowrap px-3 text-left align-middle text-foreground text-label [&:has([role=checkbox])]:pr-0";
const T_CELL =
  "whitespace-nowrap p-3 align-middle [&:has([role=checkbox])]:pr-0";
const FIND_ROW = "src/lib/cawco/find/FindRow.svelte";
const FINDER = "src/lib/cawco/find/Finder.svelte";
const HOME_RECENT = "src/lib/cawco/home/HomeRecent.svelte";
const LOCATION = "src/lib/cawco/spawn/LocationSection.svelte";
const SESSION_DIALOG = "src/lib/cawco/spawn/NewSessionDialog.svelte";
const PROJECT_CHIP = "src/lib/cawco/spawn/ProjectChip.svelte";
const PROMPT_EDITOR = "src/lib/cawco/spawn/PromptEditor.svelte";
const COMPOSER = "src/lib/cawco/transcript/Composer.svelte";
const SHOT = "src/lib/cawco/transcript/Shot.svelte";
const DIVIDER = "src/lib/cawco/transcript/CompactionDivider.svelte";
/** The chevron's Solar icon as unplugin-icons renders it, on both trees. */
const CHEVRON_SVG = `aria-hidden="true" width="1.2em" height="1.2em" viewBox="0 0 24 24"`;
const BADGE = "sidebar/sidebar-menu-badge.svelte";
/** The rail's menu button a badge follows: the peer its states read. */
const MENU_BUTTON = `<a href="#x" class="peer/menu-button" data-sidebar="menu-button" data-size="default">Fleet</a>`;
const TOOL_MATRIX = "src/lib/cawco/ToolMatrix.svelte";
const AT_LIMIT = "src/lib/cawco/accounts/AtLimitBlock.svelte";
const WORK_TABS = "src/lib/cawco/home/WorkTabs.svelte";
const PROJECT_HEAD = "src/lib/cawco/project/ProjectHead.svelte";
const PANE_TABS = "src/lib/cawco/workspace/PaneTabs.svelte";
const TAB_ITEM = "lib/components/ui/fluid-tabs/TabItem.svelte";
const THREAD_PANE = "src/lib/cawco/ThreadPane.svelte";
/** What the fluid-tabs kit sets round a pane tab's cast, on both trees. */
const TAB_KIT =
  "--flare:8px;--slope-start:1px;--slope-end:1px;--radius:8px;--choose-dur:160ms;--choose-ease:ease";
/** The folder root and its list, round a folder tab, with the choice's clock the list sets (TabsList). */
const folder = (tab: string) =>
  `<div data-variant="folder"><div data-slot="ff-tabs-list" data-list style="--choose-dur:var(--dur-settle);--choose-ease:var(--ease-crossfade)">${tab}</div></div>`;

const CN_CALL = /class=\{cn\(([\s\S]*?)className/;
const STRING = /"([^"]*)"/g;
/** Every string a kit part's `class={cn(…)}` lists before the caller's class. */
function cnStrings(path: string): string {
  const call = readFileSync(path, "utf8").match(CN_CALL)?.[1];
  if (!call) {
    throw new Error(`no cn call in ${path}`);
  }
  return [...call.matchAll(STRING)].map((m) => m[1]).join(" ");
}

/** A kit part's own classes: the first string of its `class={cn(…)}`. */
function cnBase(path: string): string {
  const text = readFileSync(path, "utf8");
  const found = text.match(CN_BASE)?.[1];
  if (!found) {
    throw new Error(`no cn base in ${path}`);
  }
  return found;
}

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
});

export const CASES: Case[] = [
  // ---------------------------------------------------------- the fixes
  {
    name: "ViewTable.svelte:66 band head, variant caps",
    files: ["src/lib/cawco/views/openui/ViewTable.svelte"],
    t: `<div class="{S0} ledger"><table class="w-full caption-bottom text-body"><thead><tr class="${tcn(T_ROW, "band border-0")}"><th data-check="head" class="${tcn(T_HEAD)}" scope="col">When</th></tr></thead></table></div>`,
    now: `<div class="overflow-hidden rounded-lg bg-surface-raised shadow-tile"><table class="w-full caption-bottom text-body"><thead><tr class="${cn(tableRowVariants({ variant: "band" }))}"><th data-check="head" class="${cn(tableHeadVariants({ variant: "caps" }), "h-c-toolbar-ctl")}" scope="col">When</th></tr></thead></table></div>`,
  },
  {
    name: "TaskTable.svelte:307/:317 a picked row and its pick, title and created cells",
    files: ["src/lib/cawco/tasks/TaskTable.svelte"],
    t: `<div data-slot="ledger" class="{S0} ledger" data-pickable><div class="relative w-full overflow-x-auto"><table data-tasks class="${tcn("w-full caption-bottom text-body", "tasks table-fixed")}"><tbody class="[&_tr:last-child]:border-0"><tr data-check="row" class="${tcn(T_ROW, "row")}" data-picked data-state="selected">${[
      ["pick", "x"],
      ["title", "A task"],
      ["created", "1d"],
    ]
      .map(
        ([id, text]) =>
          `<td data-check="${id}" class="${tcn(T_CELL, `col-${id}`)}">${text}</td>`
      )
      .join("")}</tr></tbody></table></div></div>`,
    now: `<div data-slot="ledger" ${attrs("src/lib/cawco/tasks/TaskTable.svelte", "now", 'data-slot="ledger"')} data-pickable><div class="${tableVariants({ spacing: "gap" }).container()}"><table data-tasks class="${cn(tableVariants({ spacing: "gap" }).table(), "table-fixed border-separate max-phone:block")}"><tbody class="${cn("[&_tr:last-child]:border-0", "max-phone:block")}"><tr data-check="row" class="${cn(tableRowVariants({ variant: "picks-stacks" }), "group/row relative max-phone:grid max-phone:grid-cols-(--row-cols) max-phone:items-center group-data-pickable/ledger:max-phone:grid-cols-(--row-cols-pick)")}" data-picked data-state="selected">${[
      [
        "pick",
        "x",
        "calc(1rem + 2 * var(--space-3))",
        "w-(--col-w) h-c-btn-h-lg max-phone:block max-phone:w-auto max-phone:h-auto max-phone:row-(--pick-row) max-phone:col-start-1",
      ],
      [
        "title",
        "A task",
        "",
        "w-(--col-w) h-c-btn-h-lg max-phone:block max-phone:w-auto max-phone:h-auto max-phone:row-start-1 max-phone:col-span-full group-data-pickable/ledger:max-phone:col-start-2 group-data-pickable/ledger:max-phone:-col-end-1",
      ],
      [
        "created",
        "1d",
        "7rem",
        "w-(--col-w) h-c-btn-h-lg text-end @max-decisions-900px:hidden max-phone:@max-decisions-900px:hidden max-phone:w-auto max-phone:h-auto",
      ],
    ]
      .map(
        ([id, text, w, cls]) =>
          `<td data-check="${id}" class="${cn(tableCellVariants({ variant: "ledger-picks-stacks" }), cls)}" style="--col-w: ${w}">${text}</td>`
      )
      .join("")}</tr></tbody></table></div></div>`,
    states: [
      { name: "phone", width: 400 },
      { name: "tablet", width: 800 },
      { name: "desk", width: 1280 },
    ],
  },
  {
    name: "Spinner glyph-busy (RolloutChip's cell)",
    files: ["src/lib/cawco/config/RolloutChip.svelte"],
    t: ["busy", "done"]
      .map(
        (g) =>
          `<span class="group"><button class="rollout-chip mark-line"><span class="{S0} glyph" data-glyph="${g}"><svg data-check="${g === "busy" ? "spin" : "spin-idle"}" data-for="busy" class="size-4 animate-spin"></svg></span></button></span>`
      )
      .join(""),
    now: ["busy", "done"]
      .map(
        (g) =>
          `<span class="group"><button ${attrs("src/lib/cawco/config/RolloutChip.svelte", "now", "<Popover.Trigger")}><span ${attrs("src/lib/cawco/config/RolloutChip.svelte", "now", 'data-slot="glyph"')} data-glyph="${g}"><svg data-check="${g === "busy" ? "spin" : "spin-idle"}" data-for="busy" class="${cn("size-icon-md animate-spin", spinnerVariants({ reveal: "glyph-busy" }), "col-start-1 row-start-1 size-icon-sm flex-none")}"></svg></span></button></span>`
      )
      .join(""),
    show: ["animation-play-state"],
  },
  {
    name: "TableCell between (ActionsTable's rows)",
    files: ["src/lib/cawco/routines/ActionsTable.svelte"],
    t: `<div class="{S0} actions-ledger"><table><tbody><tr class="${tcn(T_ROW, "action")}"><td data-check="first" class="${tcn(T_CELL)}">a</td></tr><tr class="${tcn(T_ROW, "action")}"><td data-check="second" class="${tcn(T_CELL)}">b</td></tr></tbody></table></div>`,
    now: `<div><table><tbody><tr class="${cn(tableRowVariants({}), "group/row")}"><td data-check="first" class="${cn(tableCellVariants({ variant: "list", rule: "between" }), "num h-c-btn-h-lg align-middle")}">a</td></tr><tr class="${cn(tableRowVariants({}), "group/row")}"><td data-check="second" class="${cn(tableCellVariants({ variant: "list", rule: "between" }), "num h-c-btn-h-lg align-middle")}">b</td></tr></tbody></table></div>`,
    show: ["border-top-width", "border-top-style"],
  },
  {
    name: "NeedsYouChip.svelte:44 count",
    files: ["src/lib/cawco/project/NeedsYouChip.svelte"],
    t: `<button aria-pressed="false" ${attrs("src/lib/cawco/project/NeedsYouChip.svelte", "t", 'data-slot="needs"', "{S0}")}><svg class="{S0}"></svg><span class="{S0}">Needs you</span><span data-check="num" data-slot="num" class="{S0} num">12</span></button>`,
    now: `<button aria-pressed="false" ${attrs("src/lib/cawco/project/NeedsYouChip.svelte", "now", 'data-slot="needs"')}><svg class="size-icon-md text-status-attn-glyph"></svg><span>Needs you</span><span data-check="num" data-slot="num" class="num text-status-attn-ink">12</span></button>`,
  },
  {
    name: "ProjectHead.svelte:372 title, no tracking of its own",
    files: ["src/lib/cawco/project/ProjectHead.svelte"],
    t: `<div style="letter-spacing:0.3px"><h1 data-check="title" class="{S0} title">Cockpit</h1></div>`,
    now: `<div style="letter-spacing:0.3px"><h1 data-check="title" data-slot="title" class="type-title wrap-anywhere text-ink-strong">Cockpit</h1></div>`,
  },
  {
    name: "PlacePick.svelte:79 title, no tracking of its own",
    files: ["src/lib/cawco/preview/PlacePick.svelte"],
    t: `<div style="letter-spacing:0.3px"><h2 data-check="title" class="{S0} pick-title">Pick a machine and folder</h2></div>`,
    now: `<div style="letter-spacing:0.3px"><h2 data-check="title" class="type-title text-ink-strong">Pick a machine and folder</h2></div>`,
  },
  {
    name: "UsageMeter.svelte:547 the +N slot (type-roles on set 7)",
    files: ["src/lib/cawco/UsageMeter.svelte"],
    t: `<div style="font-style:italic;font-variant-ligatures:none"><span class="{S0} cell" data-cell="claude"><span class="{S0} l1"><span class="{S0} marks" data-strip-marks style="flex-basis:60px"><span data-check="more" data-slot="slot" data-more class="{S0} slot more" style="inset-inline-start:32px">+2</span></span></span></span></div>`,
    now: `<div style="font-style:italic;font-variant-ligatures:none"><span ${attrs("src/lib/cawco/UsageMeter.svelte", "now", 'data-cell="claude"')} data-cell="claude"><span ${attrs("src/lib/cawco/UsageMeter.svelte", "now", "gap-(--l1-gap) whitespace-nowrap")}><span class="${element("src/lib/cawco/UsageMeter.svelte", "now", "data-strip-marks").cls}" data-strip-marks style="--mark-min:16px;--marks-basis:60px"><span data-check="more" data-slot="slot" data-more class="${element("src/lib/cawco/UsageMeter.svelte", "now", "data-strip-more").cls}" style="--more-lh:16px;--slot-at:32px">+2</span></span></span></span></div>`,
  },
  {
    name: "MentionField.svelte:711 editor and :766 tip handle (type-roles on set 9)",
    files: ["src/lib/cawco/find/MentionField.svelte"],
    t: `<div style="font-style:italic;font-variant-numeric:tabular-nums"><div data-check="editor" data-slot="editor" class="{S0} editor" contenteditable="true">hi</div><div class="{S0} tip" style="left:40px;top:80px"><span class="{S0} tip-facts">Ada</span><span class="{S0} tip-handle" data-check="handle">@a</span></div></div>`,
    now: `<div style="font-style:italic;font-variant-numeric:tabular-nums"><div data-check="editor" data-slot="editor" ${attrs("src/lib/cawco/find/MentionField.svelte", "now", "data-editor")} contenteditable="true">hi</div><div data-slot="tip" class="${element("src/lib/cawco/find/MentionField.svelte", "now", 'data-slot="tip"').cls}" style="--tip-x:40px;--tip-y:80px;--tip-max-w:320px;--tip-pad-y:6px;--tip-pad-x:10px;--tip-shift-x:-50%;--tip-shift-y:calc(-100% - 8px)"><span>Ada</span><span class="type-code opacity-80" data-check="handle">@a</span></div></div>`,
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
    FIND_ROW,
    `<div ${attrs(FIND_ROW, "t", 'class={["slot"', "{S0}")}><button data-check="row" ${attrs(FIND_ROW, "t", '"row mark-line"', "{S0}")}>r</button></div>`,
    `<div ${attrs(FIND_ROW, "now", 'data-slot="slot"')}><button data-check="row" ${attrs(FIND_ROW, "now", 'data-slot="row"')}>r</button></div>`
  ),
  outline(
    "Finder.svelte:469 .field input",
    FINDER,
    `<div class="{S0} finder"><div data-slot="finder-field" ${attrs(FINDER, "t", 'data-slot="finder-field"', "{S0}")}><input data-check="in" class="{S0}"></div></div>`,
    `<div data-slot="finder" ${attrs(FINDER, "now", 'data-slot="finder"')}><div data-slot="finder-field" ${attrs(FINDER, "now", 'data-slot="finder-field"')}><input data-check="in" ${attrs(FINDER, "now", "bind:this={field}")}></div></div>`
  ),
  outline(
    "MentionField.svelte:711 .editor",
    "src/lib/cawco/find/MentionField.svelte",
    `<div data-check="editor" data-slot="editor" contenteditable="true" class="{S0} editor">x</div>`,
    `<div data-check="editor" data-slot="editor" contenteditable="true" ${attrs("src/lib/cawco/find/MentionField.svelte", "now", "data-editor")}>x</div>`
  ),
  outline(
    "CawPanel.svelte:335 .empty",
    "src/lib/cawco/home/CawPanel.svelte",
    `<div data-check="empty" tabindex="-1" class="{S0} empty">e</div>`,
    `<div data-check="empty" tabindex="-1" class="grid justify-items-center gap-space-2 px-space-4 pt-space-6 pb-space-5 type-label text-ink-muted outline-off">e</div>`
  ),
  outline(
    "HomeRecent.svelte:147 .search input",
    HOME_RECENT,
    `<label data-slot="search" ${attrs(HOME_RECENT, "t", 'data-slot="search"', "{S0}")}><input data-check="in" class="{S0}"></label>`,
    `<label data-slot="search" ${attrs(HOME_RECENT, "now", 'data-slot="search"')}><input data-check="in" ${attrs(HOME_RECENT, "now", 'aria-label="Search recent sessions"')}></label>`
  ),
  outline(
    "Lightbox.svelte:223 .doc-view",
    "src/lib/cawco/lightbox/Lightbox.svelte",
    `<div data-check="doc" tabindex="-1" class="doc-view">d</div>`,
    `<div data-check="doc" tabindex="-1" class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-space-4 outline-off">d</div>`
  ),
  outline(
    "LocationSection.svelte:234/:500 input",
    LOCATION,
    `<div data-slot="location-section-field" class="{S0} field field-shell"><div data-slot="row" class="{S0} row"><input data-check="in" id="session-dir" class="{S0}"></div></div>`,
    `<div data-slot="location-section-field" ${attrs(LOCATION, "now", 'data-slot="location-section-field"')}><div data-slot="row" ${attrs(LOCATION, "now", 'data-slot="row"')}><input data-check="in" id="session-dir" ${attrs(LOCATION, "now", 'id="session-dir"')}></div></div>`
  ),
  outline(
    "NewSessionDialog.svelte:1808 .session-card (dialog)",
    SESSION_DIALOG,
    `<div data-check="card" tabindex="-1" data-session-card data-ns-dialog data-state="open" class="session-card ns-theme">c</div>`,
    `<div data-check="card" tabindex="-1" data-session-card data-ns-dialog data-state="open" ${attrs(SESSION_DIALOG, "now", 'class="ns-theme fixed z-81')}>c</div>`
  ),
  outline(
    "NewSessionDialog.svelte:1758 .session-card (drawer, DrawerContent look new-session)",
    SESSION_DIALOG,
    `<div data-check="card" tabindex="-1" data-session-card data-ns-dialog data-state="open" data-vaul-drawer data-vaul-drawer-direction="bottom" data-slot="drawer-content" class="${tcn(cnBase(ui(tApp, "drawer/drawer-content.svelte")), "session-card ns-theme")}">c</div>`,
    `<div data-check="card" tabindex="-1" data-session-card data-ns-dialog data-state="open" data-vaul-drawer data-vaul-drawer-direction="bottom" data-slot="drawer-content" class="${cn(cnBase(ui(app, "drawer/drawer-content.svelte")), drawerContentVariants({ look: "new-session" }), "fixed z-81 flex origin-center flex-col")}">c</div>`
  ),
  outline(
    "ProjectChip.svelte:143/:166 .field input",
    PROJECT_CHIP,
    `<div class="ns-theme"><div class="{S0} ns-panel form"><label data-slot="project-chip-field" class="{S0} field field-shell"><input data-check="in" class="{S0}"></label></div></div>`,
    `<div class="ns-theme"><div ${attrs(PROJECT_CHIP, "now", 'class="ns-panel grid')}><label data-slot="project-chip-field" ${attrs(PROJECT_CHIP, "now", 'data-slot="project-chip-field"')}><input data-check="in" ${attrs(PROJECT_CHIP, "now", 'aria-label="Project name"')}></label></div></div>`
  ),
  outline(
    "PromptEditor.svelte:325 .editor",
    PROMPT_EDITOR,
    `<div class="ns-theme"><div class="{S0} editor-wrap" data-keeps-draft><div data-check="editor" data-slot="editor" contenteditable="true" ${attrs(PROMPT_EDITOR, "t", 'aria-label="First prompt"', "{S0}")}>p</div></div></div>`,
    `<div class="ns-theme"><div data-keeps-draft ${attrs(PROMPT_EDITOR, "now", "data-keeps-draft")}><div data-check="editor" data-slot="editor" contenteditable="true" ${attrs(PROMPT_EDITOR, "now", 'aria-label="First prompt"')}>p</div></div></div>`
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
    `<p data-slot="peer-label" class="{S0} label rail-line"><button data-check="toggle" data-slot="collapsible-trigger" class="peer-toggle press-tint" data-box>t</button></p>`,
    `<p data-slot="peer-label" ${attrs("src/lib/cawco/transcript/Peer.svelte", "now", 'data-slot="peer-label"', "{S0}")}><button data-check="toggle" data-slot="collapsible-trigger" ${attrs("src/lib/cawco/transcript/Peer.svelte", "now", 'class="group/toggle ms-auto')} data-box>t</button></p>`
  ),
  {
    name: "Composer.svelte:3365 the pill, recalling and grown",
    files: ["src/lib/cawco/transcript/Composer.svelte"],
    t: ["recalling", "grown", "plain"]
      .map(
        (s) =>
          `<form data-check="${s}" data-slot="cin" ${attrs(COMPOSER, "t", 'class="cin kit-dock-shell field-shell"', `{S0} ${s === "plain" ? "" : s}`)}><textarea class="{S0}"></textarea></form>`
      )
      .join(""),
    now: ["recalling", "grown", "plain"]
      .map(
        (s) =>
          `<form data-check="${s}" data-slot="cin" ${s === "plain" ? "" : `data-${s}`} ${attrs(COMPOSER, "now", "aria-label={FIELD_LABEL}", "{S0}")}><textarea></textarea></form>`
      )
      .join(""),
    states: [REST, focus("textarea")],
  },

  // ------------- the sweep: global classes the conversion dropped from markup
  ...[
    [
      "DecisionNode.svelte:41 the dot",
      "src/lib/cawco/decisions/graph/DecisionNode.svelte",
      `<div ${attrs("src/lib/cawco/decisions/graph/DecisionNode.svelte", "t", 'data-slot="decision-node"', "{S0}")}><span class="{S0} name">Ship it</span><span aria-hidden="true" data-check="ring" class="{S0} ring"></span></div>`,
      `<div ${attrs("src/lib/cawco/decisions/graph/DecisionNode.svelte", "now", 'data-slot="decision-node"')}><span class="type-label line-clamp-2 min-w-0 flex-auto wrap-anywhere text-ink-strong">Ship it</span><span aria-hidden="true" data-check="ring" ${attrs("src/lib/cawco/decisions/graph/DecisionNode.svelte", "now", 'class="ring size-icon-sm')}></span></div>`,
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
  })),
  {
    name: "thinking-indicator.svelte:120 the word",
    files: [
      "src/lib/components/ui/thinking-indicator/thinking-indicator.svelte",
    ],
    t: `<span data-check="word" class="{S0} shimmer">Thinking</span>`,
    now: `<span data-check="word" class="{S0} shimmer motion-safe:relative motion-safe:inline-block">Thinking</span>`,
    states: [REST, { name: "reduced motion", motion: "reduce" }],
  },
  {
    name: "thinking-step.svelte:139 an active step's label",
    files: ["src/lib/components/ui/thinking-steps/thinking-step.svelte"],
    t: `<div class="{S0} copy"><span data-check="label" data-slot="thinking-step-label" class="{S0} label shimmer">Reading</span></div>`,
    now: `<div class="flex min-w-0 flex-1 flex-col gap-space-1 pb-space-2"><span data-check="label" data-slot="thinking-step-label" class="{S0} font-normal text-ink-strong transition-[color] dur-control ease-out status-ahead:text-ink-muted motion-safe:not-status-ahead:data-shimmer:text-transparent motion-safe:data-shimmer:bg-(image:--step-shimmer) motion-safe:data-shimmer:bg-size-(--step-shimmer-size) motion-safe:data-shimmer:bg-repeat motion-safe:data-shimmer:bg-clip-text shimmer" data-shimmer data-status="active" style="--step-shimmer:linear-gradient(90deg, var(--ink-muted) 0% 35%, var(--ink-strong) 50%, var(--ink-muted) 65% 100%);--step-shimmer-size:300% 100%">Reading</span></div>`,
    states: [REST, { name: "reduced motion", motion: "reduce" }],
  },
  {
    name: "History.svelte:306/:421/:437 the figures",
    files: ["src/lib/cawco/usage/History.svelte"],
    t: `<div class="{S0} pair"><figure class="{S0} chart"><figcaption class="{S0} caption"><span class="{S0} name">Claude</span><span data-check="total" class="{S0} num total">$12</span></figcaption><table class="{S0} figures"><thead><tr class="{S0}"><th class="{S0}" scope="col">Day</th><th data-check="th" class="{S0} num" scope="col">Spend</th></tr></thead><tbody><tr class="{S0}"><td class="{S0}">Mon</td><td data-check="td" class="{S0} num">$1</td></tr></tbody></table></figure></div>`,
    now: `<div class="grid grid-cols-2 gap-space-6 max-phone:grid-cols-1"><figure class="flex min-w-0 flex-col gap-space-2"><figcaption class="flex items-baseline justify-between gap-space-2"><span class="type-label text-ink-strong">Claude</span><span data-check="total" data-slot="num" class="type-label num text-ink-strong">$12</span></figcaption><table class="type-meta w-full border-collapse"><thead><tr><th class="type-label border-b border-b-border-hairline px-0 py-space-1 text-start text-ink-muted" scope="col">Day</th><th data-check="th" data-slot="num" class="type-label num border-b border-b-border-hairline px-0 py-space-1 text-end text-ink-muted" scope="col">Spend</th></tr></thead><tbody><tr><td class="border-b border-b-border-hairline px-0 py-space-1 text-ink-strong">Mon</td><td data-check="td" data-slot="num" class="num border-b border-b-border-hairline px-0 py-space-1 text-end text-ink-strong">$1</td></tr></tbody></table></figure></div>`,
  },
  {
    name: "ProjectDetails.svelte:307 the place count",
    files: ["src/lib/cawco/project/ProjectDetails.svelte"],
    t: `<button class="{S0} disclose press-tint mark-line" type="button"><span data-check="num" data-slot="num" class="{S0} num">2 places</span></button>`,
    now: `<button class="group press-tint mark-line type-label -mx-space-1 inline-flex cursor-pointer items-center gap-space-1 rounded-xs border-none border-current bg-transparent px-space-1 py-space-row text-ink-strong transition-[background-color] dur-control ease-out hover:bg-surface-hover" type="button"><span data-check="num" data-slot="num" class="num">2 places</span></button>`,
  },
  {
    name: "MoveWait.svelte:477/:511 the share",
    files: ["src/lib/cawco/move/MoveWait.svelte"],
    t: `<span data-check="meta" data-num data-slot="meta" class="{S0} meta num">40% · 2 of 5</span>`,
    now: `<span data-check="meta" data-num data-slot="meta" class="type-meta text-ink-muted num">40% · 2 of 5</span>`,
  },
  {
    name: "PlanRing.svelte:36 the count",
    files: ["src/lib/cawco/plan/PlanRing.svelte"],
    t: `<span data-check="num" data-slot="num" class="{S0} num">2/5</span>`,
    now: `<span data-check="num" data-slot="num" class="num">2/5</span>`,
  },
  {
    name: "TextSection.svelte:50 the Edit button in its section head",
    files: ["src/lib/cawco/tasks/TextSection.svelte"],
    t: `<section class="{S0} part"><h3 class="kit-section-head"><span>Notes</span><button data-check="edit" class="${tcn(tButtonVariants({ variant: "ghost", size: "xs" }), "count")}">Edit</button></h3></section>`,
    now: `<section class="flex flex-col gap-space-2"><h3 class="kit-section-head min-h-c-btn-h-xs m-0 px-0"><span>Notes</span><button data-check="edit" class="${cn(buttonVariants({ variant: "ghost", size: "xs", head: "count" }))}">Edit</button></h3></section>`,
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
      `<div data-check="m" class="{S0} preview relative grid max-h-40 overflow-y-auto rounded-[var(--radius-sm)] bg-background font-mono text-label leading-relaxed">x</div>`,
      `<div data-check="m" class="relative grid max-h-40 overflow-y-auto rounded-sm bg-surface-page font-mono text-label leading-relaxed">x</div>`,
    ],
    [
      "TaskPanel.svelte:100",
      "src/lib/cawco/TaskPanel.svelte",
      `<span data-check="m" class="{S0} shrink-0 font-mono text-meta text-muted-foreground tabular-nums">x</span>`,
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
      `<span data-check="m" class="{S0} ml-auto shrink-0 font-mono text-label text-muted-foreground">x</span>`,
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
  })),

  // ------------- lane rewrites whose value is read through their context
  {
    name: "Shot.svelte:241 the skeleton's radius, inherited at T through .frame from .box",
    files: [SHOT],
    t: `<figure class="{S0}"><button aria-label="Open x" class="{S0} box" type="button"><span class="{S0} frame"><span data-check="skeleton" aria-hidden="true" class="kit-skeleton absolute inset-0 rounded-[inherit]"></span></span></button></figure>`,
    now: `<figure ${attrs(SHOT, "now", "group/shot m-0")}><button data-slot="shot-box" aria-label="Open x" ${attrs(SHOT, "now", "onclick={open}")} type="button"><span ${attrs(SHOT, "now", "data-sized={intrinsic")}><span data-check="skeleton" aria-hidden="true" ${attrs(SHOT, "now", '"kit-skeleton absolute')}></span></span></button></figure>`,
    show: ["border-top-left-radius", "border-bottom-right-radius"],
  },
  {
    name: "Sidebar.svelte:907 the fleet count's badge, blocked and live",
    files: ["src/lib/cawco/Sidebar.svelte"],
    t: [
      ["attn", "bg-[var(--status-attn-bg)] text-[var(--status-attn-ink)]!"],
      ["live", "bg-[var(--status-live-bg)] text-[var(--status-live-ink)]!"],
    ]
      .map(
        ([tone, cls]) =>
          `<li class="relative">${MENU_BUTTON}<div data-check="${tone}" data-num data-flip="pop box" data-sidebar="menu-badge" data-slot="sidebar-menu-badge" class="${tcn(cnStrings(ui(tApp, BADGE)), cls)}">3</div></li>`
      )
      .join(""),
    now: ["attn", "live"]
      .map(
        (tone) =>
          `<li class="relative">${MENU_BUTTON}<div data-check="${tone}" ${tone === "attn" ? "data-blocked" : ""} data-num data-flip="pop box" data-sidebar="menu-badge" data-slot="sidebar-menu-badge" class="${cn(cnStrings(ui(app, BADGE)), sidebarMenuBadgeVariants({ tone: "live" }))}">3</div></li>`
      )
      .join(""),
    show: ["background-color", "color"],
    states: [
      REST,
      {
        name: "row hovered",
        force: [{ sel: '[data-sidebar="menu-button"]', pseudo: ["hover"] }],
      },
      {
        name: "row active",
        attrs: [
          {
            sel: '[data-sidebar="menu-button"]',
            name: "data-active",
            value: "",
          },
        ],
      },
      { name: "dark", dark: true },
    ],
  },

  {
    name: "CompactionDivider.svelte:283 the chevron's turn (divider-chevron-turn)",
    files: [DIVIDER],
    t: `<button data-slot="divider" aria-expanded="false" class="{S0} divider focus-inset touch-hit" type="button"><span class="{S0} mid"><span data-slot="chev" class="{S0} chev"><svg data-check="mark" ${CHEVRON_SVG}></svg></span></span></button>`,
    now: `<button data-slot="divider" aria-expanded="false" ${attrs(DIVIDER, "now", 'data-slot="divider"')} type="button"><span ${attrs(DIVIDER, "now", "style:--mid-durs")}><span data-slot="chev" ${attrs(DIVIDER, "now", 'data-slot="chev"')}><svg data-check="mark" ${CHEVRON_SVG} class="${element(DIVIDER, "now", "<IconChevron").cls}"></svg></span></span></button>`,
    show: [
      "transition-property",
      "transition-duration",
      "transition-timing-function",
      "rotate",
      "filter",
    ],
    states: [
      REST,
      focus('[data-slot="divider"]'),
      {
        name: "open",
        attrs: [
          {
            sel: '[data-slot="divider"]',
            name: "aria-expanded",
            value: "true",
          },
        ],
      },
      {
        name: "hovered",
        force: [{ sel: '[data-slot="divider"]', pseudo: ["hover"] }],
      },
      { name: "reduced motion", motion: "reduce" },
    ],
  },

  // ------- main's changes after T, carried onto the converted form (at M)
  {
    name: "ToolMatrix.svelte:121 a cell's actions, shown under a resting pointer",
    at: M,
    files: [TOOL_MATRIX],
    t: `<div data-cell class="group/cell"><span data-check="actions" class="${element(TOOL_MATRIX, "m", "[@media(hover:hover)]:opacity-0").cls}">x</span></div>`,
    now: `<div data-cell class="group/cell"><span data-check="actions" class="${element(TOOL_MATRIX, "now", "hover-hover:opacity-0").cls}">x</span></div>`,
    show: ["opacity"],
    states: [
      REST,
      {
        name: "cell hovered",
        force: [{ sel: "[data-cell]", pseudo: ["hover"] }],
      },
      {
        name: "focus within the cell",
        force: [{ sel: "[data-cell]", pseudo: ["focus-within"] }],
      },
    ],
  },
  {
    name: "AtLimitBlock.svelte:130 what a delegate's work does at its limit",
    at: M,
    files: [AT_LIMIT],
    t: `<div class="{S0} lim"><div class="{S0} switch-line"><label data-check="move" class="{S0}" for="m">Move</label></div><div data-check="work" class="{S0} work"><p data-check="label" class="{S0}">What a delegate's work does</p></div></div>`,
    now: `<div class="@container flex flex-col"><div ${attrs(AT_LIMIT, "now", "justify-between gap-space-4")}><label data-check="move" class="cursor-pointer" for="m">Move</label></div><div data-check="work" ${attrs(AT_LIMIT, "now", "pt-space-3 pb-space-2 text-pretty")}><p data-check="label">What a delegate's work does</p></div></div>`,
    show: ["padding-top", "padding-bottom", "row-gap", "color"],
  },
  {
    name: "WorkTabs.svelte:812 the count pill, live, finished and failed",
    at: M,
    files: [WORK_TABS],
    t: `<div style="--tight:20">${[
      ["live", "working", ""],
      ["done", "finished", ""],
      ["fail", "finished", "data-failed"],
    ]
      .map(
        ([check, tab, failed]) =>
          `<span data-check="${check}" data-num data-slot="count" class="{S0} num count" ${failed} data-flip="pop" data-tab="${tab}">3</span>`
      )
      .join("")}</div>`,
    now: `<div style="--tight:20">${[
      ["live", "working", ""],
      ["done", "finished", ""],
      ["fail", "finished", "data-failed"],
    ]
      .map(
        ([check, tab, failed]) =>
          `<span data-check="${check}" data-num data-slot="count" ${attrs(WORK_TABS, "now", 'data-slot="count"')} ${failed} data-flip="pop" data-tab="${tab}">3</span>`
      )
      .join("")}</div>`,
    show: ["background-color", "color"],
    states: [REST, { name: "dark", dark: true }],
  },
  {
    name: "ProjectHead.svelte:476 · N places keeps the mark line's block padding",
    at: M,
    files: [PROJECT_HEAD],
    t: `<p class="{S0} line mark-line"><button data-check="places" class="{S0} places" data-places-line type="button">· 2 places</button></p>`,
    now: `<p ${attrs(PROJECT_HEAD, "now", "mark-line type-label flex min-w-0")}><button data-check="places" ${attrs(PROJECT_HEAD, "now", "data-places-line")} data-places-line type="button">· 2 places</button></p>`,
    show: ["padding-top", "padding-bottom", "padding-left"],
    states: [
      REST,
      {
        name: "hovered",
        force: [{ sel: "[data-check]", pseudo: ["hover"] }],
      },
    ],
  },
  {
    name: "PaneTabs.svelte:1517 a lifted tab casts both its edges, the strip's first too",
    at: M,
    files: [PANE_TABS],
    t: `<div style="${TAB_KIT}"><div data-tab class="{S0} tab" style="--lone-start:1;--lone-end:0"><span data-slot="shade" aria-hidden="true" class="{S0} shade"><span data-check="start" class="{S0} s"></span><span data-check="end" class="{S0} e"></span></span></div></div>`,
    now: `<div style="${TAB_KIT}"><div data-tab data-slot="tab" ${attrs(PANE_TABS, "now", "group/tab pane-tab-pads", "{S0}").replace('style="', 'style="--lone-start:1;--lone-end:0;')}><span data-slot="shade" aria-hidden="true" ${attrs(PANE_TABS, "now", 'data-slot="shade"', "{S0}")}><span data-check="start" ${attrs(PANE_TABS, "now", "shadow-tab-start group-data-chosen", "{S0}")}></span><span data-check="end" ${attrs(PANE_TABS, "now", "shadow-tab-end group-data-chosen", "{S0}")}></span></span></div></div>`,
    show: ["opacity", "box-shadow"],
    states: [
      { name: "first in the strip, at rest" },
      {
        name: "lifted",
        attrs: [{ sel: "[data-tab]", name: "data-lifted", value: "" }],
      },
      {
        name: "lifted and chosen",
        attrs: [{ sel: "[data-tab]", name: "data-chosen", value: "" }],
      },
      { name: "lifted and chosen, dark", dark: true },
    ],
  },
  {
    name: "TabItem.svelte:290 a folder tab under a swipe takes no transition",
    at: M,
    files: [`src/${TAB_ITEM}`],
    t: folder(
      `<span data-check="tab" data-slot="ff-tab" class="{S0} ff-tab">Fleet</span>`
    ),
    now: folder(
      `<span data-check="tab" data-slot="ff-tab" class="{S0} ${cn(cnStrings(join(app, TAB_ITEM)))}">Fleet</span>`
    ),
    show: ["transition-property", "transition-duration"],
    states: [
      REST,
      {
        name: "riding",
        attrs: [{ sel: "[data-list]", name: "data-ride", value: "" }],
      },
      { name: "riding, reduced motion", motion: "reduce" },
    ],
  },
  {
    name: "ThreadPane.svelte:1084 the can't-start card's action in its own column",
    at: M,
    files: [THREAD_PANE],
    t: `<div class="{S0} off"><div data-check="alert" data-slot="alert" role="status" class="${tcn(mAlertVariants({ variant: "default" }), "off-line")}"><div data-check="description" data-slot="alert-description" class="${tcn(cnStrings(ui(mApp, "alert/alert-description.svelte")))}">No machine can start Caw here.</div><div data-check="action" data-slot="alert-action" class="col-start-[-1] row-start-1 self-center"><button>Check machines</button></div></div></div>`,
    now: `<div ${attrs(THREAD_PANE, "now", "inset-x-0 bottom-(--off-bottom)")}><div data-check="alert" data-slot="alert" role="status" class="${cn(alertVariants({ variant: "default", surface: "card" }), "items-center")}"><div data-check="description" data-slot="alert-description" class="${cn(cnStrings(ui(app, "alert/alert-description.svelte")))}">No machine can start Caw here.</div><div data-check="action" data-slot="alert-action" class="col-start-[-1] row-start-1 self-center"><button>Check machines</button></div></div></div>`,
    show: ["grid-template-columns", "grid-column-start", "column-gap"],
    states: [
      { name: "desk", width: 1280 },
      { name: "phone", width: 390 },
    ],
  },

  // ----- the codemod's dropped `md:` twins, as the kit fields stand now
  ...[
    [
      "HookTester.svelte:81 the sample field (md:text-label dropped)",
      "src/lib/cawco/HookTester.svelte",
      `<input data-check="m" class="${tcn(cnStrings(ui(tApp, "input/input.svelte")), "font-mono text-label md:text-label")}" placeholder="a sample value">`,
      `<input data-check="m" class="${cn(cnStrings(ui(app, "input/input.svelte")), inputVariants({ face: "mono", text: "label" }))}" placeholder="a sample value">`,
    ],
    [
      "KeyValueRows.svelte:40 the name field (md:text-meta dropped)",
      "src/lib/cawco/KeyValueRows.svelte",
      `<div class="flex"><input data-check="m" class="${tcn(cnStrings(ui(tApp, "input/input.svelte")), "h-8 flex-1 font-mono text-meta md:text-meta")}" placeholder="NAME"></div>`,
      `<div class="flex"><input data-check="m" class="${cn(cnStrings(ui(app, "input/input.svelte")), inputVariants({ face: "mono", text: "meta" }), "h-space-8 flex-1")}" placeholder="NAME"></div>`,
    ],
    [
      "KeyValueRows.svelte:51 the value field (md:text-meta dropped)",
      "src/lib/cawco/KeyValueRows.svelte",
      `<div class="flex"><input data-check="m" class="${tcn(cnStrings(ui(tApp, "input/input.svelte")), "h-8 flex-[2] font-mono text-meta md:text-meta")}" placeholder="value"></div>`,
      `<div class="flex"><input data-check="m" class="${cn(cnStrings(ui(app, "input/input.svelte")), inputVariants({ face: "mono", text: "meta" }), "h-space-8 grow-(--value-grow) basis-(--value-basis)")}" style="--value-basis: 0%; --value-grow: 2" placeholder="value"></div>`,
    ],
    [
      "RuleTester.svelte:78 the sample (md:text-label dropped)",
      "src/lib/cawco/RuleTester.svelte",
      `<textarea data-check="m" class="${tcn(cnStrings(ui(tApp, "textarea/textarea.svelte")), "resize-y bg-background font-mono text-label md:text-label")}"></textarea>`,
      `<textarea data-check="m" class="${cn(cnStrings(ui(app, "textarea/textarea.svelte")), textareaVariants({ face: "mono", fill: "page", text: "label" }), "resize-y")}"></textarea>`,
    ],
  ].map(([name, file, t, now]) => ({
    name,
    files: [file],
    t,
    now,
    states: [
      { name: "under md", width: 700 },
      { name: "over md", width: 900 },
      focus("[data-check]"),
    ],
  })),
];
