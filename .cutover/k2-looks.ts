/**
 * `bun .cutover/k2-looks.ts`: each K2 look that carries a variant-order
 * guard, and each element a K2 hook class named, rendered in Chromium
 * against the source of record (main at T, ac7b79de8), in every ancestor
 * case × the look's states.
 *
 * k2-exact.ts compares class strings; it cannot see the context a variant
 * reads (a guard written as `group-not-…` needs the ancestor, and silently
 * fails without it), nor what a rule's shorthand resets. This renders each
 * side alone in one page and compares what it computes:
 * - ref: the kit's classes as they stood (its markup at T, or today's base
 *   where T's consumer rule decides) plus T's rules verbatim, in an
 *   unlayered <style> as Svelte emitted them (`.sv` stands for a scoped
 *   element's hash class);
 * - new: the kit's own `cn` and recipe today (k2-kit.ts), with the caller's
 *   remaining classes, and the caller's rules as they stand today where it
 *   keeps any.
 * The CSS is the dashboard's Tailwind 4.3.3 over src/app.css, built for
 * every class the fixtures use. States are set by attribute, by CDP's
 * forced pseudo-classes, by the page's pointer (a touch context for a
 * coarse one), by reduced-motion emulation and by the viewport, each
 * media query checked to match before a side is drawn; running
 * transitions are finished before reading. A look reads its elements'
 * whole computed style (every property, and the custom properties it
 * names), or the properties its T rules set where T's element carried
 * other rules this page does not hold. The transition longhands are
 * compared as used, each list fitted to transition-property's length (see
 * `used`). Each look prints "N states, M differ"; any difference prints
 * its case, its element and both values.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { $ } from "bun";
import { classesOf, cn, DASH, PARTS, ROOT, recipeOf } from "./k2-kit";

const T = "ac7b79de8";
const UI = "apps/dashboard/src/lib/components/ui";
const CAWCO = "apps/dashboard/src/lib/cawco";
const CLASS_ATTR = /class="([^"]*)"/g;
const QUOTED = /"([^"\\]*)"/g;
const SPACES = /\s+/;

const { compile } = await import(
  join(
    ROOT,
    "node_modules/.bun/@tailwindcss+node@4.3.3/node_modules/@tailwindcss/node/dist/index.mjs"
  )
);
const { chromium } = await import(
  join(
    ROOT,
    "node_modules/.bun/playwright-core@1.64.1/node_modules/playwright-core/index.mjs"
  )
);

/** A file as it stood at T. */
const atT = async (path: string) => await $`git show ${T}:${path}`.text();
/** The string literals of the `cn(` call that holds `marker`. */
function literalsAround(source: string, marker: string): string {
  const at = source.indexOf(marker);
  if (at < 0) {
    throw new Error(`no ${marker}`);
  }
  const start = source.lastIndexOf("cn(", at);
  const end = source.indexOf(")}", at);
  return [...source.slice(start, end).matchAll(QUOTED)]
    .map((m) => m[1])
    .join(" ");
}
/** The one class string (a `class="…"` literal) that holds `marker`. */
function classWith(source: string, marker: string): string {
  for (const m of source.matchAll(CLASS_ATTR)) {
    if (m[1]?.includes(marker)) {
      return m[1];
    }
  }
  throw new Error(`no class with ${marker}`);
}
/** A class string without the named classes. */
const without = (classes: string, drop: string[]) =>
  classes
    .split(SPACES)
    .filter((c) => c && !drop.includes(c))
    .join(" ");
/** A recipe as it stood at T, built with today's `tv`. */
async function recipeAtT(path: string, name: string) {
  const file = join(tmpdir(), `k2-t-${name}.svelte`);
  writeFileSync(file, await atT(path));
  return recipeOf(file, name);
}

type Media = "fine" | "coarse";
interface Case {
  dark?: boolean;
  /** Pseudo-classes forced on the elements marked `data-m`, by mark. */
  force?: [string, string[]][];
  label: string;
  media: Media;
  next: string;
  reduced?: boolean;
  ref: string;
  /** The viewport's width, 1280 unless given. */
  width?: number;
}
interface Look {
  /** Custom properties read beside the whole computed style. */
  also?: string[];
  cases: Case[];
  /** Properties neither side is asked to agree on (the new side's inputs). */
  ignore?: string[];
  name: string;
  /** Today's caller rules, for the new side. */
  nowCss?: string;
  /** "all", or the properties T's rules set (see the header). */
  props: "all" | string[];
  tCss: string;
}

/** Every combination of the given dimensions. */
function grid<K extends string>(
  dims: Record<K, readonly unknown[]>
): Record<K, unknown>[] {
  let out: Record<string, unknown>[] = [{}];
  for (const [k, values] of Object.entries(dims) as [K, unknown[]][]) {
    out = out.flatMap((o) => values.map((v) => ({ ...o, [k]: v })));
  }
  return out as Record<K, unknown>[];
}
const attr = (on: unknown, text: string) => (on ? ` ${text}` : "");
const labelOf = (c: Record<string, unknown>) =>
  Object.entries(c)
    .map(([k, v]) => `${k} ${v}`)
    .join(", ");
const MEDIA = ["fine", "coarse"] as const;
const B = (props: Record<string, unknown>, caller = "") =>
  classesOf("Button", props, caller);

const looks: Look[] = [];

// ── Checkbox reveal="card-pick" (TaskColumn.svelte at T) ─────────────────
{
  const base = classesOf("Checkbox", {});
  const look = classesOf(
    "Checkbox",
    { reveal: "card-pick" },
    "absolute end-space-3 top-(--pick-top)"
  );
  const top =
    "--pick-top: calc(var(--space-2) + (var(--c-badge-h) - 1rem) / 2)";
  const field = (f: unknown, s: string) =>
    f === "none"
      ? s
      : `<div class="group/field" data-disabled="${f === "disabled"}">${s}</div>`;
  looks.push({
    name: 'Checkbox reveal="card-pick"',
    props: "all",
    ignore: ["--pick-top"],
    tCss: `
      li.sv > .pick { position: absolute; inset-block-start: calc(var(--space-2) + (var(--c-badge-h) - 1rem) / 2); inset-inline-end: var(--space-3); opacity: 0; transition: opacity var(--dur-control) var(--ease-out); }
      li.sv:focus-within > .pick, li.sv[data-picked] > .pick, .column.sv[data-picking] li.sv > .pick { opacity: 1; }
      @media (hover: hover) and (pointer: fine) { li.sv:hover > .pick { opacity: 1; } }
      @media (pointer: coarse) { li.sv > .pick { opacity: 1; } }`,
    cases: grid({
      field: ["none", "enabled", "disabled"],
      state: ["rest", "focus-within", "hover", "picked", "picking"],
      disabled: [false, true],
      media: MEDIA,
    }).map((c) => {
      const picking = attr(c.state === "picking", "data-picking");
      const picked = attr(c.state === "picked", "data-picked");
      const dis = attr(c.disabled, "disabled");
      return {
        label: labelOf(c),
        media: c.media as Media,
        force:
          c.state === "focus-within" || c.state === "hover"
            ? [["li", [String(c.state)]]]
            : [],
        ref: field(
          c.field,
          `<div class="column sv"${picking}><ul><li class="sv relative" data-m="li"${picked}><button data-k="pick" class="${base} pick"${dis}></button></li></ul></div>`
        ),
        next: field(
          c.field,
          `<div class="group/col"${picking}><ul><li class="group/card relative" data-m="li"${picked}><button data-k="pick" class="${look}" style="${top}"${dis}></button></li></ul></div>`
        ),
      };
    }),
  });
}

// ── DropdownMenuItem marks="current-busy" (ArtifactMenu.svelte at T) ─────
{
  const base = classesOf("DropdownMenuItem", {});
  const look = classesOf(
    "DropdownMenuItem",
    { marks: "current-busy" },
    "group/artifact min-h-c-artifact-row-h"
  );
  looks.push({
    name: 'DropdownMenuItem marks="current-busy"',
    props: "all",
    tCss: `
      .artifact-list .artifact-row { min-block-size: var(--c-artifact-row-h); }
      .artifact-list .artifact-row[aria-current="true"] { color: var(--ink-strong); }
      .artifact-list .artifact-row[aria-busy="true"] { opacity: 0.5; }`,
    cases: grid({
      variant: ["default", "destructive"],
      current: [false, true],
      busy: [false, true],
      focus: [false, true],
    }).map((c) => {
      const a = `data-variant="${c.variant}"${attr(c.current, 'aria-current="true"')}${attr(c.busy, 'aria-busy="true"')}`;
      return {
        label: labelOf(c),
        media: "fine",
        force: c.focus ? [["t", ["focus"]]] : [],
        ref: `<div class="artifact-list"><div data-k="item" data-m="t" tabindex="-1" class="${base} artifact-row" ${a}></div></div>`,
        next: `<div><div data-k="item" data-m="t" tabindex="-1" class="${look}" ${a}></div></div>`,
      };
    }),
  });
}

// ── Button looks over their callers' T rules ──────────────────────────────
interface ButtonLook {
  /** The caller's remaining classes today. */
  caller: string;
  look: Record<string, unknown>;
  name: string;
  /** The button's own props (variant, size). */
  props: Record<string, unknown>;
  /** The ancestor at T, around the button. */
  refWrap: [string, string];
  states: string[];
  tClass: string;
  tCss: string;
  /** The ancestor today. */
  wrap: [string, string];
}
const pressStates = ["hover", "expanded", "invalid"];
const buttonLooks: ButtonLook[] = [
  ...(["deny", "approve"] as const).map((a) => ({
    name: `Button answer="${a}" (NeedsCard, TaskNeeds)`,
    props: { variant: "secondary", size: "sm" },
    look: { answer: a },
    caller: "",
    tClass: `peer ${a}`,
    refWrap: ['<div class="peers sv">', "</div>"] as [string, string],
    wrap: ["<div>", "</div>"] as [string, string],
    states: pressStates,
    tCss: `
      .peers.sv > .peer { border-color: transparent; }
      .peers.sv > .deny, .peers.sv > .deny:hover { background: var(--status-fail-bg); color: var(--status-fail-ink); }
      .peers.sv > .approve, .peers.sv > .approve:hover { background: var(--status-done-bg); color: var(--status-done-ink); }`,
  })),
  ...(["deny", "approve"] as const).map((a) => ({
    name: `Button answer="${a}-edge" (PeekPane)`,
    props: { variant: "secondary", size: "sm" },
    look: { answer: `${a}-edge` },
    caller: "",
    tClass: `peer ${a}`,
    refWrap: ['<div class="choice sv">', "</div>"] as [string, string],
    wrap: ["<div>", "</div>"] as [string, string],
    states: pressStates,
    tCss: `
      .choice.sv > .peer, .choice.sv > .peer:hover { background-color: var(--surface-recess); color: var(--ink-strong); }
      .choice.sv > .approve, .choice.sv > .approve:hover { border-color: var(--status-done-ink); }
      .choice.sv > .deny, .choice.sv > .deny:hover { border-color: var(--status-fail-ink); }`,
  })),
  ...(["deny", "approve"] as const).map((a) => ({
    name: `Button answer="${a}-strong" (Prompt)`,
    props: { variant: "secondary", fit: "prompt", width: "shrink" },
    look: { answer: `${a}-strong` },
    caller: "",
    tClass: a,
    refWrap: ['<div class="choice sv">', "</div>"] as [string, string],
    wrap: ["<div>", "</div>"] as [string, string],
    states: pressStates,
    tCss: `
      .choice.sv > .approve, .choice.sv > .approve:hover { border-color: var(--status-done-ink); background-color: var(--surface-recess); }
      .choice.sv > .deny, .choice.sv > .deny:hover { border-color: var(--status-fail-ink); background-color: var(--surface-recess); }`,
  })),
  {
    name: 'Button reveal="value-hover" (TaskFields)',
    props: { variant: "ghost", size: "icon-xs" },
    look: { reveal: "value-hover" },
    caller: "",
    tClass: "drop",
    refWrap: ['<div class="value sv" data-m="g">', "</div>"],
    wrap: ['<div class="group/value" data-m="g">', "</div>"],
    states: ["group-hover", "focus-visible", "disabled"],
    tCss: `
      .value.sv .drop { opacity: 0; }
      .value.sv:hover .drop, .value.sv .drop:focus-visible { opacity: 1; }
      @media (pointer: coarse) { .value.sv .drop { opacity: 1; } }`,
  },
  {
    name: 'Button reveal="row-hover" (TodoList)',
    props: { variant: "ghost", size: "icon-xs" },
    look: { reveal: "row-hover", tone: "muted" },
    caller: "flex-none",
    tClass: "under",
    refWrap: ['<div class="todo sv" data-m="g">', "</div>"],
    wrap: ['<div class="group" data-m="g">', "</div>"],
    states: ["group-hover", "focus-visible", "disabled"],
    tCss: `
      .todo.sv .under { flex: none; color: var(--ink-muted); }
      @media (hover: hover) and (pointer: fine) {
        .todo.sv .under { opacity: 0; transition: opacity var(--dur-control) var(--ease-out); }
        .todo.sv:hover .under, .todo.sv .under:focus-visible { opacity: 1; }
      }`,
  },
  {
    name: 'Button expanded="unfilled" (MovedLogins, RecordCard, UpdateCard)',
    props: { variant: "ghost", size: "xs" },
    look: { expanded: "unfilled" },
    caller: "",
    tClass: "toggle",
    refWrap: ['<div class="more sv">', "</div>"],
    wrap: ["<div>", "</div>"],
    states: ["hover", "expanded"],
    tCss: `
      .more.sv > .toggle[aria-expanded="true"]:not(:hover) { background-color: transparent; }`,
  },
];
for (const b of buttonLooks) {
  const base = `${B(b.props)} ${b.tClass}`;
  const look = B({ ...b.props, ...b.look }, b.caller);
  const dims: Record<string, readonly unknown[]> = { media: MEDIA };
  for (const s of b.states) {
    dims[s] = [false, true];
  }
  looks.push({
    name: b.name,
    props: "all",
    tCss: b.tCss,
    cases: grid(dims).map((c) => {
      const a = `${attr(c.expanded, 'aria-expanded="true"')}${attr(c.invalid, 'aria-invalid="true"')}${attr(c.disabled, "disabled")}`;
      const force: [string, string[]][] = [];
      if (c.hover) {
        force.push(["t", ["hover"]]);
      }
      if (c["focus-visible"]) {
        force.push(["t", ["focus", "focus-visible"]]);
      }
      if (c["group-hover"]) {
        force.push(["g", ["hover"]]);
      }
      return {
        label: labelOf(c),
        media: c.media as Media,
        force,
        ref: `${b.refWrap[0]}<button data-k="button" data-m="t" class="${base}"${a}>Deny</button>${b.refWrap[1]}`,
        next: `${b.wrap[0]}<button data-k="button" data-m="t" class="${look}"${a}>Deny</button>${b.wrap[1]}`,
      };
    }),
  });
}

// ── Button toggle="last" (UpdateCard.svelte at T) ─────────────────────────
{
  const base = `${B({ variant: "ghost", size: "sm" })} toggle`;
  const look = B(
    { variant: "ghost", size: "sm", toggle: "last" },
    "last:-me-space-3"
  );
  const end = "calc(var(--space-3) - 1px - 16px * 4.25 / 24)";
  const icon = (i: unknown) =>
    i === "none" ? "" : `<svg data-icon="${i}" width="16" height="16"></svg>`;
  looks.push({
    name: 'Button toggle="last" (UpdateCard)',
    props: "all",
    ignore: ["--end", "--toggle-start"],
    tCss: `
      .actions.sv > .toggle:last-child { --end: ${end}; padding-inline: calc(11px + 8px - var(--end)) var(--end); margin-inline-end: calc(-1 * var(--space-3)); }`,
    cases: grid({
      last: [false, true],
      icon: ["none", "inline-start", "inline-end"],
    }).map((c) => {
      const after = c.last ? "" : "<span></span>";
      return {
        label: labelOf(c),
        media: "fine",
        ref: `<div class="actions sv"><button data-k="button" class="${base}">${icon(c.icon)}x</button>${after}</div>`,
        next: `<div><button data-k="button" class="${look}" style="--end: ${end}; --toggle-start: calc(11px + 8px - var(--end))">${icon(c.icon)}x</button>${after}</div>`,
      };
    }),
  });
}

// ── ResizableHandle look="grid" (PaneGrid.svelte at T) ────────────────────
{
  const base = classesOf("ResizableHandle", {});
  const look = classesOf("ResizableHandle", { look: "grid" });
  looks.push({
    name: 'ResizableHandle look="grid" (PaneGrid)',
    props: "all",
    tCss: `
      .grid-group [data-pane-resizer] { background: var(--border-hairline); transition: background-color var(--dur-control) var(--ease-out); }
      @media (hover: hover) and (pointer: fine) { .grid-group [data-pane-resizer]:hover { background: var(--border-control); } }
      .grid-group [data-pane-resizer][data-active="pointer"], .grid-group [data-pane-resizer][data-active="keyboard"] { background: var(--ink-muted); }`,
    cases: grid({
      hover: [false, true],
      active: ["none", "pointer", "keyboard"],
      media: MEDIA,
    }).map((c) => {
      const a = c.active === "none" ? "" : ` data-active="${c.active}"`;
      return {
        label: labelOf(c),
        media: c.media as Media,
        force: c.hover ? [["t", ["hover"]]] : [],
        ref: `<div class="grid-group"><div data-pane-resizer data-k="handle" data-m="t" class="${base}"${a}></div></div>`,
        next: `<div><div data-pane-resizer data-k="handle" data-m="t" class="${look}"${a}></div></div>`,
      };
    }),
  });
}

// ── The kit's own pairs: its markup at T, or its own <style> at T ─────────
{
  const now = readFileSync(join(ROOT, UI, "checkbox/checkbox.svelte"), "utf8");
  const then = await atT(`${UI}/checkbox/checkbox.svelte`);
  const cur = literalsAround(now, "dark:not-data-checked:bg-input/30");
  const old = literalsAround(then, "dark:bg-input/30");
  looks.push({
    name: "Checkbox dark fill (kit markup at T)",
    props: ["background-color"],
    tCss: "",
    cases: grid({ dark: [false, true], checked: [false, true] }).map((c) => {
      const s = c.checked ? 'data-state="checked"' : 'data-state="unchecked"';
      return {
        label: labelOf(c),
        media: "fine",
        dark: Boolean(c.dark),
        ref: `<button data-k="box" class="${old}" ${s}></button>`,
        next: `<button data-k="box" class="${cur}" ${s}></button>`,
      };
    }),
  });
}
{
  const path = `${UI}/field/field-description.svelte`;
  const cur = literalsAround(
    readFileSync(join(ROOT, path), "utf8"),
    "group-data-[orientation"
  );
  const old = literalsAround(await atT(path), "group-data-[orientation");
  looks.push({
    name: "FieldDescription margins (kit markup at T)",
    props: ["margin-top"],
    tCss: "",
    cases: grid({
      legend: [false, true],
      place: ["last", "second-last", "other"],
    }).map((c) => {
      const after = {
        last: "",
        "second-last": "<i></i>",
        other: "<i></i><i></i>",
      }[String(c.place)];
      const lead = c.legend
        ? '<div data-variant="legend"></div>'
        : "<div></div>";
      return {
        label: labelOf(c),
        media: "fine",
        ref: `<div>${lead}<p data-k="p" class="${old}"></p>${after}</div>`,
        next: `<div>${lead}<p data-k="p" class="${cur}"></p>${after}</div>`,
      };
    }),
  });
}
{
  const path = `${UI}/input-group/input-group-addon.svelte`;
  const cur = recipeOf(join(ROOT, path), "inputGroupAddonVariants");
  const old = await recipeAtT(path, "inputGroupAddonVariants");
  const kids = {
    none: "",
    button: "<button></button>",
    kbd: "<kbd></kbd>",
    both: "<button></button><kbd></kbd>",
  };
  looks.push({
    name: "InputGroupAddon margins (kit markup at T)",
    props: ["margin-left", "margin-right"],
    tCss: "",
    cases: grid({
      align: ["inline-start", "inline-end"],
      kids: Object.keys(kids),
    }).map((c) => {
      const k = kids[c.kids as keyof typeof kids];
      return {
        label: labelOf(c),
        media: "fine",
        ref: `<div data-k="addon" class="${old({ align: c.align })}">${k}</div>`,
        next: `<div data-k="addon" class="${cur({ align: c.align })}">${k}</div>`,
      };
    }),
  });
}
{
  const cur = classWith(
    readFileSync(join(ROOT, UI, "machine-row/machine-row.svelte"), "utf8"),
    "data-is-online"
  );
  looks.push({
    name: "MachineRow dot (its own <style> at T)",
    props: ["background-color"],
    tCss: `
      .dot.sv { flex: none; width: 6px; height: 6px; border-radius: var(--radius-pill); background: var(--neutral-8); }
      .dot.sv.online { background: var(--hue-green-500); }
      .dot.sv.away { background: var(--hue-orange-500); }`,
    cases: grid({ online: [false, true], away: [false, true] }).map((c) => ({
      label: labelOf(c),
      media: "fine",
      ref: `<span data-k="dot" class="dot sv${c.online ? " online" : ""}${c.away ? " away" : ""}"></span>`,
      next: `<span data-k="dot" class="${cur}"${attr(c.online, "data-is-online")}${attr(c.away, "data-is-away")}></span>`,
    })),
  });
}
{
  const path = `${UI}/switch/switch.svelte`;
  const cur = classWith(
    readFileSync(join(ROOT, path), "utf8"),
    "kit-switch-thumb"
  );
  const old = classWith(await atT(path), "kit-switch-thumb");
  looks.push({
    name: "Switch thumb (kit markup at T)",
    props: ["translate"],
    tCss: "",
    cases: grid({
      root: ["absent", "default", "sm"],
      checked: [false, true],
      dir: ["ltr", "rtl"],
    }).map((c) => {
      const s = c.checked
        ? 'data-state="checked" data-checked=""'
        : 'data-state="unchecked" data-unchecked=""';
      const wrap = (inner: string) =>
        c.root === "absent"
          ? `<div dir="${c.dir}">${inner}</div>`
          : `<div dir="${c.dir}"><span class="group/switch" data-size="${c.root}">${inner}</span></div>`;
      return {
        label: labelOf(c),
        media: "fine",
        ref: wrap(`<span data-k="thumb" class="${old}" ${s}></span>`),
        next: wrap(`<span data-k="thumb" class="${cur}" ${s}></span>`),
      };
    }),
  });
}
{
  const path = `${UI}/toggle/toggle.svelte`;
  const cur = recipeOf(join(ROOT, path), "toggleVariants")({});
  const old = (await recipeAtT(path, "toggleVariants"))({});
  looks.push({
    name: "Toggle fill (kit markup at T)",
    props: ["background-color"],
    tCss: "",
    cases: grid({
      hover: [false, true],
      pressed: [false, true],
      on: [false, true],
      media: MEDIA,
    }).map((c) => {
      const a = `${attr(c.pressed, 'aria-pressed="true"')}${attr(c.on, 'data-state="on"')}`;
      return {
        label: labelOf(c),
        media: c.media as Media,
        force: c.hover ? [["t", ["hover"]]] : [],
        ref: `<button data-k="toggle" data-m="t" class="${old}"${a}></button>`,
        next: `<button data-k="toggle" data-m="t" class="${cur}"${a}></button>`,
      };
    }),
  });
}
{
  const cur = literalsAround(
    readFileSync(join(ROOT, UI, "fluid-tabs/TabItem.svelte"), "utf8"),
    "data-tab-item-selected:text-ink-strong"
  );
  looks.push({
    name: "TabItem ink (its own <style> at T)",
    props: ["color"],
    tCss: `
      .ff-tab.sv { color: var(--ink-muted); }
      .ff-tab.sv.selected { color: var(--ink-strong); }
      @media (hover: hover) { .ff-tab.sv[data-ghosted] { color: var(--ink-strong); } }
      [data-variant="folder"] .ff-tab.sv.selected { color: var(--ink-muted); }`,
    cases: grid({
      host: ["absent", "segmented", "folder"],
      selected: [false, true],
      ghosted: [false, true],
      media: MEDIA,
    }).map((c) => {
      const wrap = (inner: string) =>
        c.host === "absent"
          ? `<div>${inner}</div>`
          : `<div data-variant="${c.host}">${inner}</div>`;
      return {
        label: labelOf(c),
        media: c.media as Media,
        ref: wrap(
          `<span data-k="tab" class="ff-tab sv${c.selected ? " selected" : ""}"${attr(c.ghosted, "data-ghosted")}></span>`
        ),
        next: wrap(
          `<span data-k="tab" class="${cur}"${attr(c.selected, "data-tab-item-selected")}${attr(c.ghosted, "data-ghosted")}></span>`
        ),
      };
    }),
  });
}
{
  const cur = classWith(
    readFileSync(join(ROOT, UI, "thinking-steps/thinking-step.svelte"), "utf8"),
    "status-ahead:text-ink-muted"
  );
  looks.push({
    name: "ThinkingStep label ink (its own <style> at T)",
    props: ["color"],
    tCss: `
      .label.sv { color: var(--ink-strong); font-weight: var(--weight-body); transition: color var(--dur-control) var(--ease-out); }
      .step.sv[data-status="ahead"] .label.sv { color: var(--ink-muted); }
      @media (prefers-reduced-motion: no-preference) {
        .shimmer-at-t.sv { color: transparent; background: linear-gradient(90deg, var(--ink-muted) 0% 35%, var(--ink-strong) 50%, var(--ink-muted) 65% 100%); background-size: 300% 100%; background-clip: text; }
      }`,
    cases: grid({
      status: ["complete", "active", "ahead"],
      shimmer: [false, true],
      reduced: [false, true],
    }).map((c) => ({
      label: labelOf(c),
      media: "fine",
      reduced: Boolean(c.reduced),
      ref: `<div class="step sv" data-status="${c.status}"><span data-k="label" class="label sv${c.shimmer ? " shimmer-at-t" : ""}">x</span></div>`,
      next: `<div><span data-k="label" class="${cur}" data-status="${c.status}"${attr(c.shimmer, "data-shimmer")}>x</span></div>`,
    })),
  });
}

// ── The hooks: each element whose class another file's rule read at T ────
// count: TextSection.svelte's Edit button, under app.css's
// `.kit-section-head > .count` (in @layer components). Its caller now
// draws the margin (set 3's `ms-auto`) and passes `figures="tabular"`.
{
  const head = "kit-section-head min-h-c-btn-h-xs m-0 px-0";
  const base = B({ variant: "ghost", size: "xs" });
  const look = B(
    { variant: "ghost", size: "xs", figures: "tabular" },
    "ms-auto"
  );
  looks.push({
    name: 'hook count: Button figures="tabular" (TextSection)',
    props: "all",
    tCss: "",
    cases: grid({
      hover: [false, true],
      focus: [false, true],
      media: MEDIA,
    }).map((c) => {
      const force: [string, string[]][] = [];
      if (c.hover) {
        force.push(["t", ["hover"]]);
      }
      if (c.focus) {
        force.push(["t", ["focus", "focus-visible"]]);
      }
      return {
        label: labelOf(c),
        media: c.media as Media,
        force,
        ref: `<h3 class="${head}"><span>Brief</span><button data-k="button" data-m="t" data-text-section-count data-box class="${base} count">Edit</button></h3>`,
        next: `<h3 class="${head}"><span>Brief</span><button data-k="button" data-m="t" data-text-section-count data-box class="${look}">Edit</button></h3>`,
      };
    }),
  });
}
// rail-configure: Sidebar.svelte's Configure link, under its own global
// rules at T.
{
  const base = `${B({ variant: "ghost", size: "icon-sm" })} rail-configure`;
  const look = B({ variant: "ghost", size: "icon-sm", current: "selected" });
  looks.push({
    name: 'hook rail-configure: Button current="selected" (Sidebar)',
    props: "all",
    tCss: `
      .rail-configure[aria-current="page"] { background: var(--selected-bg); color: var(--selected-ink); }
      .rail-configure { transition: background-color var(--dur-control) var(--ease-out), color var(--dur-control) var(--ease-out); }`,
    cases: grid({
      current: [false, true],
      hover: [false, true],
      focus: [false, true],
      active: [false, true],
      expanded: [false, true],
      media: MEDIA,
      reduced: [false, true],
    }).map((c) => {
      const pseudo = [
        ...(c.hover ? ["hover"] : []),
        ...(c.focus ? ["focus", "focus-visible"] : []),
        ...(c.active ? ["active"] : []),
      ];
      const a = `href="#"${attr(c.current, 'aria-current="page"')}${attr(c.expanded, 'aria-expanded="true"')}`;
      return {
        label: labelOf(c),
        media: c.media as Media,
        reduced: Boolean(c.reduced),
        force: pseudo.length > 0 ? [["t", pseudo]] : [],
        ref: `<div data-slot="sidebar-settings"><a data-k="link" data-m="t" aria-label="Configure" class="${base}" ${a}></a></div>`,
        next: `<div data-slot="sidebar-settings"><a data-k="link" data-m="t" aria-label="Configure" class="${look}" ${a}></a></div>`,
      };
    }),
  });
}
// strip-hit: UsageMeter.svelte's strip control (a Drawer or a Popover
// trigger), under its global rules at T. Today its caller draws the look
// in its classes; the ground it hands the dials under the pointer or open
// is set 7's `ring-ground-*` (K2's house utilities).
{
  const source = readFileSync(join(ROOT, CAWCO, "UsageMeter.svelte"), "utf8");
  const ground =
    "hover:ring-ground-surface-hover aria-expanded:ring-ground-surface-hover state-open:ring-ground-surface-hover";
  const drawer = `${without(classWith(source, "strip-hit press-tint touch-hit"), ["strip-hit"])} ${ground}`;
  const popover = cn(
    "touch-hit",
    `${without(classWith(source, "strip-hit press-tint flex"), ["strip-hit"])} ${ground}`
  );
  const strip =
    "group/strip relative w-full min-w-0 rounded-sm bg-(--ring-ground) variant-home:rounded-md";
  looks.push({
    name: "hook strip-hit: the strip's trigger (UsageMeter)",
    props: "all",
    also: ["--ring-ground", "--strip-ground"],
    ignore: ["--strip-hit-h"],
    tCss: `
      .strip.sv { --ring-ground: var(--strip-ground, var(--sidebar)); position: relative; inline-size: 100%; min-inline-size: 0; border-radius: var(--radius-sm); background: var(--ring-ground); }
      .strip.sv[data-variant="home"] { --strip-ground: var(--surface-raised); border-radius: var(--radius-md); }
      .strip-hit {
        display: flex; align-items: center; inline-size: 100%; block-size: 44px; padding: 0 var(--space-3); border: 0; border-radius: var(--radius-sm); background: transparent; text-align: start; color: var(--ink-strong); cursor: pointer; transition: background-color var(--dur-control) var(--ease-out);
        @media (hover: hover) and (pointer: fine) { &:hover { background: var(--surface-hover); --ring-ground: var(--surface-hover); } }
        &[aria-expanded="true"], &[data-state="open"] { background: var(--surface-hover); --ring-ground: var(--surface-hover); }
      }
      .strip.sv[data-variant="home"] .strip-hit { block-size: 56px; padding: 0 var(--space-4); border-radius: var(--radius-md); }`,
    cases: grid({
      trigger: ["drawer", "popover"],
      variant: ["rail", "home"],
      open: [false, true],
      hover: [false, true],
      media: MEDIA,
    }).map((c) => {
      const home = c.variant === "home";
      const state = c.open
        ? 'aria-expanded="true" data-state="open"'
        : 'aria-expanded="false" data-state="closed"';
      const tClass =
        c.trigger === "drawer"
          ? "strip-hit press-tint touch-hit"
          : "touch-hit strip-hit press-tint";
      const style = `--ring-ground: var(--strip-ground, var(--sidebar));${home ? " --strip-ground: var(--surface-raised);" : ""} --strip-hit-h: ${home ? 56 : 44}px`;
      return {
        label: labelOf(c),
        media: c.media as Media,
        force: c.hover ? [["t", ["hover"]]] : [],
        ref: `<div data-slot="strip" class="strip sv" data-variant="${c.variant}"><button data-k="trigger" data-m="t" type="button" aria-label="Usage" class="${tClass}" ${state}>x</button></div>`,
        next: `<div data-slot="strip" class="${strip}" data-variant="${c.variant}" style="${style}"><button data-k="trigger" data-m="t" type="button" aria-label="Usage" class="${c.trigger === "drawer" ? drawer : popover}" ${state}>x</button></div>`,
      };
    }),
  });
}
// rollout-chip: RolloutChip.svelte's PopoverTrigger, under its global rules
// at T. Today its caller draws the look in its classes, and its eased press
// is PopoverTrigger `motion="settle"`. Its hover at T was any `:hover`, a
// finger's too, under `[data-fail]` by order: today's `hover:` (the house
// hover, a fine pointer's) misses a finger's, so set 8 writes it as
// `[&:hover]:not-data-fail:` (K2.md, the hooks), the form drawn here.
{
  const source = readFileSync(
    join(ROOT, CAWCO, "config/RolloutChip.svelte"),
    "utf8"
  );
  const rest = `${without(classWith(source, "rollout-chip mark-line"), [
    "rollout-chip",
    "hover:bg-surface-hover",
    "data-fail:hover:bg-status-fail-bg",
  ])} [&:hover]:not-data-fail:bg-surface-hover`;
  const look = classesOf("PopoverTrigger", { motion: "settle" }, rest);
  const glyph = classWith(source, "group-glyph-fail:opacity-100");
  const style =
    "--chip-gap: 5px; --chip-h: 26px; --chip-px: 8px; --tpress: scale(var(--press-scale))";
  looks.push({
    name: 'hook rollout-chip: PopoverTrigger motion="settle" (RolloutChip)',
    props: "all",
    ignore: ["--chip-gap", "--chip-h", "--chip-px", "--tpress"],
    tCss: `
      .rollout-chip {
        display: inline-flex; flex: none; align-items: center; gap: 5px; height: 26px; padding: 0 8px; border-radius: var(--radius-sm); background: var(--surface-recess); font: var(--type-meta); color: var(--ink-muted); white-space: nowrap;
        transition: background-color var(--dur-panel) var(--ease-out), color var(--dur-panel) var(--ease-out);
        @media (prefers-reduced-motion: no-preference) { transition: background-color var(--dur-panel) var(--ease-out), color var(--dur-panel) var(--ease-out), transform var(--dur-toggle) var(--ease-out); }
      }
      @media (prefers-reduced-motion: no-preference) { .rollout-chip:active { transform: scale(var(--press-scale)); } }
      .rollout-chip:hover { background: var(--surface-hover); }
      .rollout-chip[data-fail] { background: var(--status-fail-bg); color: var(--status-fail-ink); }
      .rollout-chip svg { width: 12px; height: 12px; flex: none; }`,
    cases: grid({
      fail: [false, true],
      hover: [false, true],
      active: [false, true],
      media: MEDIA,
      reduced: [false, true],
    }).map((c) => {
      const pseudo = [
        ...(c.hover ? ["hover"] : []),
        ...(c.active ? ["active"] : []),
      ];
      const fail = attr(c.fail, 'data-fail=""');
      return {
        label: labelOf(c),
        media: c.media as Media,
        reduced: Boolean(c.reduced),
        force: pseudo.length > 0 ? [["t", pseudo]] : [],
        ref: `<button data-k="chip" data-m="t" type="button" class="touch-hit rollout-chip mark-line"${fail}>1/2</button>`,
        next: `<button data-k="chip" data-m="t" type="button" class="${look}" style="${style}"${fail}>1/2</button>`,
      };
    }),
  });
  looks.push({
    name: "hook rollout-chip: its glyphs (RolloutChip)",
    props: ["width", "height", "flex-grow", "flex-shrink", "flex-basis"],
    tCss: ".rollout-chip svg { width: 12px; height: 12px; flex: none; }",
    cases: [
      {
        label: "a glyph",
        media: "fine",
        ref: '<button type="button" class="touch-hit rollout-chip mark-line inline-flex"><svg data-k="svg"></svg></button>',
        next: `<button type="button" class="${look}" style="${style}"><svg data-k="svg" class="${glyph}"></svg></button>`,
      },
    ],
  });
}
// session-tabs, hosted: PaneTabs.svelte's Tabs root and its track, under
// its global rules; today's are its own, the literals on the root's
// custom properties (set 5 keeps them, keyed as it keys the root).
{
  const tCss = `
    .session-tabs[data-slot="tabs"] .ff-tabs-list.scrollable { @media (pointer: coarse) { padding-block: calc(var(--pad) + 10px) 10px; margin-block: -10px; } }
    .session-tabs {
      --strip-item: 32px; --strip-px: 12px; --strip-flare: var(--radius-sm);
      display: flex; align-items: flex-end; flex: 0 0 auto; min-inline-size: 0; padding-block: 4px 0; padding-inline: var(--space-7) var(--space-4); background: var(--surface-shelf);
      @media (pointer: coarse) { position: relative; z-index: 1; }
    }
    .session-tabs.hosted { flex: 1 1 0; align-self: stretch; padding: 0; background: none; }
    @container leaf (width <= 620px) { .session-tabs:not(.hosted) { padding-inline-start: var(--space-4); } }
    @media (max-width: 899px) {
      .session-tabs:not(.hosted) {
        --strip-item: var(--c-tab-row-h); --strip-flare: var(--radius-lg); min-block-size: var(--c-top-bar-h); padding-block-start: 0;
        padding-inline: calc(var(--c-bar-phone-edge) + var(--c-bar-toggle-glyph)) calc(var(--c-bar-phone-gap) + var(--c-bar-caw-glass-phone));
      }
    }
    .session-tabs[data-slot="tabs"] .ff-tabs-list {
      --px: var(--strip-px); --text: var(--text-label); --item: var(--strip-item); --sheet: var(--tab-sheet); --tab-hover: light-dark(var(--surface-recess), var(--surface-hover)); --rim-w: var(--tab-rim-width);
      @media (prefers-contrast: more), (prefers-reduced-transparency: reduce) { --rim-w: 1; }
    }
    @media (max-width: 899px) {
      .session-tabs:not(.hosted)[data-slot="tabs"] .ff-tabs-list.scrollable {
        --item: var(--strip-item); --pad: 0px; --fade-len: 16px; --edge-room-start: calc(var(--fade-len) * 1.5); --radius: var(--radius-lg); --overlap: var(--radius-sm);
        padding-block-start: calc(var(--c-top-bar-h) - var(--c-tab-row-h)); margin-block-start: 0;
        --fade-run-start: min(var(--fade-start), calc(var(--fade-cap-start, 100vw) / 1.5));
        --fade-run-end: min(var(--fade-end), var(--fade-cap-end, 100vw));
        mask-image: linear-gradient(to right, transparent, transparent calc(var(--fade-run-start) * 0.375), rgb(0 0 0 / 0.15) calc(var(--fade-run-start) * 0.75), rgb(0 0 0 / 0.6) calc(var(--fade-run-start) * 1.125), #000 calc(var(--fade-run-start) * 1.5), #000 calc(100% - var(--fade-run-end)), rgb(0 0 0 / 0.9) calc(100% - var(--fade-run-end) * 0.75), rgb(0 0 0 / 0.5) calc(100% - var(--fade-run-end) * 0.5), rgb(0 0 0 / 0.1) calc(100% - var(--fade-run-end) * 0.25), transparent);
      }
    }`;
  const nowCss = `
    .session-tabs[data-slot="tabs"] .ff-tabs-list.scrollable { @media (pointer: coarse) { padding-block: calc(var(--pad) + var(--strip-reach)) var(--strip-reach); margin-block: calc(-1 * var(--strip-reach)); } }
    .session-tabs {
      --strip-item: var(--strip-item-rest); --strip-flare: var(--radius-sm);
      display: flex; align-items: flex-end; flex: 0 0 auto; min-inline-size: 0; padding-block: var(--space-1) 0; padding-inline: var(--space-7) var(--space-4); background: var(--surface-shelf);
      @media (pointer: coarse) { position: relative; z-index: 1; }
    }
    .session-tabs.hosted { flex: 1 1 0; align-self: stretch; padding: 0; background: none; }
    @container leaf (width <= 620px) { .session-tabs:not(.hosted) { padding-inline-start: var(--space-4); } }
    @media (max-width: 899px) {
      .session-tabs:not(.hosted) {
        --strip-item: var(--c-tab-row-h); --strip-flare: var(--radius-lg); min-block-size: var(--c-top-bar-h); padding-block-start: 0;
        padding-inline: calc(var(--c-bar-phone-edge) + var(--c-bar-toggle-glyph)) calc(var(--c-bar-phone-gap) + var(--c-bar-caw-glass-phone));
      }
    }
    .session-tabs[data-slot="tabs"] .ff-tabs-list {
      --px: var(--strip-px); --text: var(--text-label); --item: var(--strip-item); --sheet: var(--tab-sheet); --tab-hover: light-dark(var(--surface-recess), var(--surface-hover)); --rim-w: var(--tab-rim-width);
      @media (prefers-contrast: more), (prefers-reduced-transparency: reduce) { --rim-w: 1; }
    }
    @media (max-width: 899px) {
      .session-tabs:not(.hosted)[data-slot="tabs"] .ff-tabs-list.scrollable {
        --item: var(--strip-item); --pad: 0px; --fade-len: var(--strip-fade); --edge-room-start: calc(var(--fade-len) * 1.5); --radius: var(--radius-lg); --overlap: var(--radius-sm);
        padding-block-start: calc(var(--c-top-bar-h) - var(--c-tab-row-h)); margin-block-start: 0;
        --fade-run-start: min(var(--fade-start), calc(var(--fade-cap-start, var(--strip-uncapped)) / 1.5));
        --fade-run-end: min(var(--fade-end), var(--fade-cap-end, var(--strip-uncapped)));
        mask-image: linear-gradient(to right, transparent, transparent calc(var(--fade-run-start) * 0.375), var(--mask-opaque-a15) calc(var(--fade-run-start) * 0.75), var(--mask-opaque-a60) calc(var(--fade-run-start) * 1.125), var(--mask-opaque) calc(var(--fade-run-start) * 1.5), var(--mask-opaque) calc(100% - var(--fade-run-end)), var(--mask-opaque-a90) calc(100% - var(--fade-run-end) * 0.75), var(--mask-opaque-a50) calc(100% - var(--fade-run-end) * 0.5), var(--mask-opaque-a10) calc(100% - var(--fade-run-end) * 0.25), transparent);
      }
    }`;
  const style =
    "--strip-px: 12px; --strip-item-rest: 32px; --strip-reach: 10px; --strip-fade: 16px; --strip-uncapped: 100vw";
  const root = cn(classesOf("Tabs", {}), "session-tabs");
  looks.push({
    name: "hook session-tabs, hosted: the Tabs root and its track (PaneTabs)",
    props: "all",
    also: [
      "--strip-item",
      "--strip-px",
      "--strip-flare",
      "--px",
      "--text",
      "--item",
      "--sheet",
      "--tab-hover",
      "--rim-w",
      "--pad",
      "--fade-len",
      "--edge-room-start",
      "--radius",
      "--overlap",
      "--fade-run-start",
      "--fade-run-end",
    ],
    ignore: [
      "--strip-item-rest",
      "--strip-reach",
      "--strip-fade",
      "--strip-uncapped",
    ],
    tCss,
    nowCss,
    cases: grid({
      hosted: [false, true],
      media: MEDIA,
      width: [1280, 800],
      leaf: [600, 760],
    }).map((c) => {
      const hosted = c.hosted ? " hosted" : "";
      const track =
        '<div data-k="track" data-slot="ff-tabs-list" class="ff-tabs-list scrollable kit-edge-fade"></div>';
      const wrap = (inner: string) =>
        `<div class="flex" style="container: leaf / inline-size; inline-size: ${c.leaf}px">${inner}</div>`;
      return {
        label: labelOf(c),
        media: c.media as Media,
        width: c.width as number,
        ref: wrap(
          `<div data-k="root" data-session-tabs data-slot="tabs" data-variant="folder" data-size="default" class="session-tabs${hosted}">${track}</div>`
        ),
        next: wrap(
          `<div data-k="root" data-session-tabs data-slot="tabs" data-variant="folder" data-size="default" class="${root}${hosted}" style="${style}">${track}</div>`
        ),
      };
    }),
  });
}

// ── The shorthands: each kit element whose rule at T wrote `outline: none`
// or `background: …` (a shorthand, every longhand reset), read longhand by
// longhand ─────────────────────────────────────────────────────────────────
const OUTLINE = [
  "outline-color",
  "outline-style",
  "outline-width",
  "outline-offset",
];
const BACKGROUND = [
  "background-color",
  "background-image",
  "background-position-x",
  "background-position-y",
  "background-size",
  "background-repeat",
  "background-attachment",
  "background-origin",
  "background-clip",
];
// TabItem's hit (TabItem.svelte:438 at T), drawn on the rail (WorkTabs
// `variant="rail"`), a link or a button.
{
  const now = classWith(
    readFileSync(join(ROOT, UI, "fluid-tabs/TabItem.svelte"), "utf8"),
    "touch-hit static z-3"
  );
  looks.push({
    name: "shorthand: TabItem's hit (outline: none; background: transparent)",
    props: [...OUTLINE, ...BACKGROUND],
    tCss: `
      .hit.sv {
        display: flex; align-items: center; align-self: stretch; flex: 1 1 auto; gap: calc(var(--gap) + 4px); min-inline-size: 0; padding-block: 0; padding-inline-start: var(--px-start, var(--px));
        border: 0; border-radius: inherit; background: transparent; color: inherit; font: inherit; font-size: var(--text); line-height: 1; white-space: nowrap; text-decoration: none; cursor: pointer; outline: none; position: static;
        &:last-child { padding-inline-end: var(--px); }
      }`,
    cases: grid({
      host: ["rail", "task sheet"],
      tag: ["button", "a"],
      state: ["rest", "hover", "focus-visible", "active"],
      media: MEDIA,
    }).map((c) => {
      // The rail's tabs (WorkTabs `variant="rail"`), and the task sheet's
      // Review and Details (TaskPane, compact Tabs, an unchosen tab's muted
      // ink, the colour `outline: none` hands the outline).
      const host =
        c.host === "rail"
          ? '<div data-variant="rail">'
          : '<div data-slot="tabs" data-size="compact" class="text-ink-muted">';
      const pseudo = {
        rest: [],
        hover: ["hover"],
        "focus-visible": ["focus", "focus-visible"],
        active: ["active"],
      }[String(c.state)] as string[];
      const tag = String(c.tag);
      const a =
        tag === "a" ? 'href="#" role="tab"' : 'type="button" role="tab"';
      const hit = (cls: string) =>
        `<span data-slot="ff-tab" class="ff-tab sv"><${tag} data-k="hit" data-m="t" data-slot="hit" data-hit aria-selected="false" tabindex="0" class="${cls}" ${a}>Work</${tag}></span>`;
      return {
        label: labelOf(c),
        media: c.media as Media,
        force: pseudo.length > 0 ? [["t", pseudo]] : [],
        ref: `${host}${hit("hit sv touch-hit")}</div>`,
        next: `${host}${hit(now)}</div>`,
      };
    }),
  });
}
// The rest of the kit's `background:` shorthands at T, each now a `bg-*`
// colour: the segment (TabsList.svelte:1314), machine-row's tile (:60, :64)
// and dot (:105–111), thinking-step's dot and connector (:176, :181) and its
// shimmer (:255), the steps header (thinking-steps-header.svelte:43).
// (TabsList's track rules, :1172 and :1242, are app.css's and still write
// the shorthand.) T's `shimmer` class is `shimmer-at-t` here: today's sheet
// has a `shimmer` utility T's had not, which T's element would not meet.
{
  const read = (path: string, marker: string) =>
    classWith(readFileSync(join(ROOT, UI, path), "utf8"), marker);
  const segment = read("fluid-tabs/TabsList.svelte", "bg-(--sheet)");
  const tile = read("machine-row/machine-row.svelte", "data-ink:bg-ink-solid");
  const dot = read("machine-row/machine-row.svelte", "data-is-online");
  const stepDot = read("thinking-steps/thinking-step.svelte", "bg-current");
  const connector = read(
    "thinking-steps/thinking-step.svelte",
    "bg-border-hairline"
  );
  const label = read(
    "thinking-steps/thinking-step.svelte",
    "status-ahead:text-ink-muted"
  );
  const header = read(
    "thinking-steps/thinking-steps-header.svelte",
    "group/header mark-line press-tint"
  ).replace(" {className}", "");
  const shimmer =
    "linear-gradient(90deg, var(--ink-muted) 0% 35%, var(--ink-strong) 50%, var(--ink-muted) 65% 100%)";
  const keyframes =
    "@keyframes shimmer { from { background-position: 0% 0; } to { background-position: 100% 0; } }";
  looks.push({
    name: "shorthand: the kit's other background shorthands at T",
    props: BACKGROUND,
    tCss: `
      .segment.sv { background: var(--sheet); }
      .tile.sv { background: var(--surface-raised); }
      .tile.sv.ink { background: var(--ink-solid); }
      .dot.sv { background: var(--neutral-8); }
      .dot.sv.online { background: var(--hue-green-500); }
      .dot.sv.away { background: var(--hue-orange-500); }
      .step-dot.sv { background: currentColor; }
      .connector.sv { background: var(--border-hairline); }
      @media (prefers-reduced-motion: no-preference) {
        .shimmer-at-t.sv { color: transparent; background: ${shimmer}; background-size: 300% 100%; background-clip: text; animation: shimmer var(--breath) var(--ease-in-out) infinite; }
      }
      ${keyframes}
      .thinking-header { margin: 0; padding: 0; border: 0; border-radius: var(--radius-xs); background: none; font: inherit; color: inherit; text-align: start; }`,
    nowCss: `
      @media (prefers-reduced-motion: no-preference) {
        [data-shimmer] { animation: shimmer var(--breath) var(--ease-in-out) infinite; }
      }
      ${keyframes}`,
    cases: grid({
      state: ["a", "b"],
      reduced: [false, true],
      media: MEDIA,
    }).map((c) => {
      const b = c.state === "b";
      return {
        label: labelOf(c),
        media: c.media as Media,
        reduced: Boolean(c.reduced),
        force: [["t", ["hover"]]],
        ref: `<div style="--sheet: var(--surface-raised)"><div data-k="segment" class="segment sv"></div></div>
          <span data-k="tile" class="tile sv${b ? " ink" : ""}"></span>
          <span data-k="dot" class="dot sv${b ? " online" : " away"}"></span>
          <span data-k="step-dot" class="step-dot sv"></span>
          <span data-k="connector" class="connector sv"></span>
          <span data-k="label" class="label sv${b ? " shimmer-at-t" : ""}">x</span>
          <button data-k="header" data-m="t" type="button" class="thinking-header mark-line press-tint">x</button>`,
        next: `<div style="--sheet: var(--surface-raised)"><div data-k="segment" class="${segment}"></div></div>
          <span data-k="tile" class="${tile}"${attr(b, "data-ink")}></span>
          <span data-k="dot" class="${dot}"${b ? " data-is-online" : " data-is-away"}></span>
          <span data-k="step-dot" class="${stepDot}"></span>
          <span data-k="connector" class="${connector}"></span>
          <span data-k="label" class="${label}" style="--step-shimmer: ${shimmer}; --step-shimmer-size: 300% 100%"${attr(b, "data-shimmer")}>x</span>
          <button data-k="header" data-m="t" type="button" class="${header}" style="--header-min: 26px; --hit-reach: -9px">x</button>`,
      };
    }),
  });
}

// ── The page ──────────────────────────────────────────────────────────────
const app = join(DASH, "src", "app.css");
const candidates = new Set<string>();
for (const l of looks) {
  for (const c of l.cases) {
    for (const html of [c.ref, c.next]) {
      for (const m of html.matchAll(CLASS_ATTR)) {
        for (const k of (m[1] ?? "").split(SPACES)) {
          if (k) {
            candidates.add(k);
          }
        }
      }
    }
  }
}
const compiler = await compile(readFileSync(app, "utf8"), {
  base: dirname(app),
  onDependency() {
    /* one build */
  },
});
const css: string = compiler.build([...candidates]);

/* A pointer per page: CDP's media emulation takes no `pointer` or `hover`
   (it is ignored without an error), and touch emulation turned off again
   leaves neither pointer matching, so the coarse page is a touch context
   from the start (`(pointer: coarse)`, `(hover: none)`). */
const browser = await chromium.launch();
const html = `<!doctype html><html><head><style>${css}</style><style id="t"></style></head><body><div id="stage"></div></body></html>`;
async function open(media: Media) {
  const context = await browser.newContext({ hasTouch: media === "coarse" });
  const page = await context.newPage();
  await page.setContent(html);
  const cdp = await context.newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  return { cdp, page };
}
const pages = { fine: await open("fine"), coarse: await open("coarse") };

type Read = Record<string, Record<string, string>>;
/** One side drawn alone: its rules, its markup, its states; then read. */
async function draw(look: Look, c: Case, markup: string, rules: string) {
  const { cdp, page } = pages[c.media];
  await page.setViewportSize({ width: c.width ?? 1280, height: 800 });
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [
      {
        name: "prefers-reduced-motion",
        value: c.reduced ? "reduce" : "no-preference",
      },
    ],
  });
  const media = await page.evaluate(() => ({
    coarse: matchMedia("(pointer: coarse) and (hover: none)").matches,
    fine: matchMedia("(pointer: fine) and (hover: hover)").matches,
    reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
  }));
  if (!media[c.media] || media.reduced !== Boolean(c.reduced)) {
    throw new Error(
      `${look.name}, ${c.label}: the page's media is ${JSON.stringify(media)}`
    );
  }
  await page.evaluate(
    ([inner, text, dark]: [string, string, boolean]) => {
      document.documentElement.classList.toggle("dark", dark);
      const t = document.getElementById("t");
      const stage = document.getElementById("stage");
      if (t && stage) {
        t.textContent = text;
        stage.innerHTML = inner;
      }
    },
    [markup, rules, Boolean(c.dark)] as [string, string, boolean]
  );
  const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
  await Promise.all(
    (c.force ?? []).map(async ([mark, pseudo]) => {
      const { nodeIds } = await cdp.send("DOM.querySelectorAll", {
        nodeId: root.nodeId,
        selector: `[data-m="${mark}"]`,
      });
      await Promise.all(
        nodeIds.map((nodeId: number) =>
          cdp.send("CSS.forcePseudoState", {
            nodeId,
            forcedPseudoClasses: pseudo,
          })
        )
      );
    })
  );
  return (await page.evaluate(
    ([props, also]: ["all" | string[], string[]]) => {
      for (const a of document.getAnimations()) {
        if (
          a.effect?.getComputedTiming().endTime === Number.POSITIVE_INFINITY
        ) {
          // A loop has no end: both sides are read at its start.
          a.pause();
          a.currentTime = 0;
        } else {
          a.finish();
        }
      }
      const out: Record<string, Record<string, string>> = {};
      for (const el of document.querySelectorAll<HTMLElement>(
        "#stage [data-k]"
      )) {
        const s = getComputedStyle(el);
        const names = props === "all" ? [...Array.from(s), ...also] : props;
        const values: Record<string, string> = {};
        for (const p of names) {
          values[p] = s.getPropertyValue(p).trim();
        }
        out[el.dataset.k ?? ""] = values;
      }
      return out;
    },
    [look.props, look.also ?? []] as ["all" | string[], string[]]
  )) as Read;
}

/** A list value's items, split at its top-level commas. */
function items(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
    } else if (ch === "," && depth === 0) {
      out.push(value.slice(from, i).trim());
      from = i + 1;
    }
  }
  out.push(value.slice(from).trim());
  return out;
}
const TRANSITION_LISTS = [
  "transition-behavior",
  "transition-delay",
  "transition-duration",
  "transition-timing-function",
];
/** The transition lists as used: each repeated or cut to the length of
    transition-property's (CSS Transitions 1, §2: "the excess values are
    not used"; a shorter list is repeated). Two lists that differ only past
    that length draw the same transitions. */
function used(values: Record<string, string>): Record<string, string> {
  const property = values["transition-property"];
  if (!property) {
    return values;
  }
  const n = items(property).length;
  const out = { ...values };
  for (const p of TRANSITION_LISTS) {
    const v = values[p];
    if (v !== undefined) {
      const list = items(v);
      out[p] = Array.from({ length: n }, (_, i) => list[i % list.length]).join(
        ", "
      );
    }
  }
  return out;
}

const lines: string[] = [];
let failed = 0;
for (const look of looks) {
  let differ = 0;
  const skip = new Set(look.ignore ?? []);
  for (const c of look.cases) {
    // biome-ignore lint/performance/noAwaitInLoops: one page draws each side in turn, its rules and states set for that side alone
    const ref = await draw(look, c, c.ref, look.tCss);
    const next = await draw(look, c, c.next, look.nowCss ?? "");
    const found: string[] = [];
    for (const k of new Set([...Object.keys(ref), ...Object.keys(next)])) {
      const a = used(ref[k] ?? {});
      const b = used(next[k] ?? {});
      for (const p of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (p.startsWith("--tw-") || skip.has(p)) {
          continue;
        }
        if ((a[p] ?? "") !== (b[p] ?? "")) {
          found.push(`    ${k} ${p}: T "${a[p] ?? ""}" now "${b[p] ?? ""}"`);
        }
      }
    }
    if (found.length > 0) {
      differ += 1;
      lines.push(`  DIFFER ${look.name}: ${c.label}`, ...found);
    }
  }
  failed += differ;
  lines.push(`${look.name}: ${look.cases.length} states, ${differ} differ`);
}
await browser.close();
for (const l of lines) {
  console.log(l);
}
const total = looks.reduce((n, l) => n + l.cases.length, 0);
console.log(
  `${looks.length} looks, ${total} states, ${failed} differ (parts ${Object.keys(PARTS).length})`
);
process.exit(failed === 0 ? 0 : 1);
