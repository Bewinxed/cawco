/**
 * `bun .cutover/k2-exact.ts`: K2's exactness proof. For every appendix site
 * of K2's kit parts (k2-sites.ts reads each element and every string its
 * class can be), the part's final class string with the variant must equal
 * today's: the part's own classes plus the consumer's, through the kit's
 * tailwind-merge (src/lib/utils.ts `cn`).
 *
 * For each element and each of its class strings:
 * - today = cn(<the part's own cn() arguments before its looks>,
 *   recipe(<the element's props>), <the consumer's classes>);
 * - the flagged classes (the appendix's, for every site on that element)
 *   are matched to one value per axis of the part's looks recipe, whose
 *   classes are exactly them; a flagged class the part already draws is a
 *   duplicate the consumer drops;
 * - new = cn(<the same arguments>, recipe(<props> + <the matched values>),
 *   <the consumer's other classes>).
 * The two are compared as class sets (a class attribute's order draws
 * nothing). Hooks (classes another file's selector reads, which the sets
 * turn into data attributes) are set aside and listed. Each match is
 * printed as `site → part prop="value"`; K2.md is written from it.
 *
 * It checks class strings, not the context they render in (an ancestor a
 * variant needs): k2-looks.ts checks that, in Chromium, for each look that
 * carries a guard.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { before, cn, PARTS, ROOT, recipeOf, words } from "./k2-kit";
import { readSites, type Site } from "./k2-sites";

const PLAIN_ATTRIBUTE = /^[\w-]+="([^"{}]*)"$/;

/** A part that forwards everything to another part's recipe, with classes of its own first. */
const FORWARDS: Record<string, { part: string; classes: string }> = {
  CopyButton: { part: "Button", classes: "flex items-center gap-2" },
};
/** A component that forwards its `class` to a part, with the part's own element there. */
const WRAPPERS: Record<
  string,
  { classes: string; props: Record<string, string> }
> = {
  // ModelCombobox.svelte:141: its Button, `variant="outline"`, its own classes first.
  ModelCombobox: {
    classes: "justify-between gap-2",
    props: { variant: "outline" },
  },
};

/**
 * Hooks: names another file's selector or script reads, which draw nothing
 * through a utility of their own. The element carries its data flag (the
 * hook sweep's) or its own file selects it; the set retargets the selector
 * (delta O2) and drops the class. No variant.
 */
const HOOKS: Record<string, string> = {
  "rail-configure": "Sidebar.svelte's own rules (:global(.rail-configure))",
  count:
    "app.css .kit-section-head > .count; the element carries data-text-section-count",
  "session-tabs":
    "PaneTabs.svelte's rules and closest('.session-tabs'); the element carries data-session-tabs",
  hosted: "PaneTabs.svelte's rules (.session-tabs.hosted)",
  "strip-hit": "UsageMeter.svelte's own rules (:global(.strip-hit…))",
  "rollout-chip":
    'RolloutChip.svelte (set 8 deleted it; its motion is PopoverTrigger motion="settle")',
};

/** Classes a set adds to an element in its own kind-5 work, which the variant carries. */
const SET_ADDS: Record<string, string[]> = {
  // Set 8: RolloutChip.svelte:320's pause, written on the Spinner.
  "src/lib/cawco/config/RolloutChip.svelte:142": [
    "group-not-glyph-busy:animation-paused",
  ],
};
/**
 * Variant order (V.md): where a look's class and the part's own class set
 * one property under states that can hold together, the source of record
 * (main at T, ac7b79de8) names the winner, and the classes say it with
 * exclusive states instead of Tailwind's sort. The consumer's classes from
 * 1a are rewritten to that form before they are compared; each rewrite
 * names its source. A rewrite applies to an element whose classes hold all
 * of `from`.
 */
const REWRITES: Record<
  string,
  { from: string[]; source: string; to: string[] }[]
> = {
  Button: [
    ...["fail", "done"].map((s) => ({
      from: [`hover:bg-status-${s}-bg`],
      to: [
        `not-aria-expanded:hover:bg-status-${s}-bg`,
        `aria-expanded:hover:bg-status-${s}-bg`,
      ],
      source:
        "NeedsCard/TaskNeeds' unlayered .deny/.approve rules outrank the kit's aria-expanded fill",
    })),
    ...["fail", "done"].map((s) => ({
      from: ["border-transparent", `bg-status-${s}-bg`],
      to: [
        "border-transparent",
        "aria-invalid:border-transparent",
        `bg-status-${s}-bg`,
        "bg-clip-border",
      ],
      source:
        "NeedsCard/TaskNeeds' unlayered `.peers > .peer { border-color: transparent }` outranks the kit's aria-invalid edge, and their `background` shorthand resets the clip to the border box (layer)",
    })),
    ...["fail", "done"].map((s) => ({
      from: [`border-status-${s}-ink`],
      to: [`border-status-${s}-ink`, `aria-invalid:border-status-${s}-ink`],
      source:
        "PeekPane's/Prompt's unlayered .deny/.approve border outranks the kit's aria-invalid edge (layer)",
    })),
    ...["fail", "done"].map((s) => ({
      from: [`hover:border-status-${s}-ink`],
      to: [
        `not-aria-invalid:hover:border-status-${s}-ink`,
        `aria-invalid:hover:border-status-${s}-ink`,
      ],
      source:
        "PeekPane's unlayered .deny/.approve:hover border outranks the kit's aria-invalid edge",
    })),
    {
      from: ["hover:bg-surface-recess"],
      to: [
        "not-aria-expanded:hover:bg-surface-recess",
        "aria-expanded:hover:bg-surface-recess",
      ],
      source:
        "PeekPane's/Prompt's unlayered :hover fill outranks the kit's aria-expanded fill",
    },
    {
      from: [
        "aria-expanded:bg-transparent",
        "hover:aria-expanded:bg-surface-hover",
      ],
      to: ["aria-expanded:unhovered:bg-transparent"],
      source:
        'MovedLogins.svelte:190 `.toggle[aria-expanded="true"]:not(:hover)`',
    },
    {
      from: [
        "opacity-0",
        "focus-visible:opacity-100",
        "group-hover/value:opacity-100",
        "coarse:opacity-100",
      ],
      to: [
        "opacity-0",
        "disabled:opacity-0",
        "not-disabled:focus-visible:opacity-100",
        "disabled:focus-visible:opacity-100",
        "group-hover/value:not-disabled:opacity-100",
        "group-hover/value:disabled:opacity-100",
        "coarse:opacity-100",
        "coarse:disabled:opacity-100",
      ],
      source:
        "TaskFields.svelte's unlayered .drop rules outrank the kit's disabled dimming",
    },
    {
      from: [
        "can-hover:opacity-0",
        "can-hover:focus-visible:opacity-100",
        "can-hover:group-hover:opacity-100",
      ],
      to: [
        "can-hover:opacity-0",
        "can-hover:disabled:opacity-0",
        "can-hover:not-disabled:focus-visible:opacity-100",
        "can-hover:disabled:focus-visible:opacity-100",
        "can-hover:group-hover:not-disabled:opacity-100",
        "can-hover:group-hover:disabled:opacity-100",
      ],
      source:
        "TodoList.svelte's unlayered .under rules outrank the kit's disabled dimming",
    },
  ],
  ResizableHandle: [
    {
      from: ["hover:bg-border-control", "active-keyboard:bg-ink-muted"],
      to: [
        "not-active-keyboard:not-active-pointer:hover:bg-border-control",
        "active-keyboard:bg-ink-muted",
      ],
      source:
        "PaneGrid.svelte:236, the active rule after the :hover one at equal weight",
    },
  ],
  Checkbox: [
    {
      from: ["opacity-0"],
      to: [
        "opacity-0",
        "disabled:opacity-0",
        "group-data-[disabled=true]/field:opacity-0",
      ],
      source:
        "TaskColumn.svelte's unlayered `li > .pick` rules outrank the kit's disabled dimming (layer)",
    },
    ...[
      "group-focus-within/card",
      "group-hover/card",
      "group-data-picked/card",
      "group-data-picking/col",
      "coarse",
    ].map((state) => ({
      from: [`${state}:opacity-100`],
      to: [
        "not-disabled:not-group-data-[disabled=true]/field",
        "disabled:not-group-data-[disabled=true]/field",
        "not-disabled:group-data-[disabled=true]/field",
        "disabled:group-data-[disabled=true]/field",
      ].map((regime) => `${state}:${regime}:opacity-100`),
      source:
        "TaskColumn.svelte's unlayered `li > .pick` rules outrank the kit's disabled dimming (layer)",
    })),
  ],
  DropdownMenuItem: [
    {
      from: ["aria-current:text-ink-strong"],
      to: [
        "aria-current:text-ink-strong",
        "aria-current:data-[variant=destructive]:text-ink-strong",
        "aria-current:data-[variant=destructive]:focus:text-ink-strong",
      ],
      source:
        "ArtifactMenu.svelte:306's unlayered `[aria-current=\"true\"]` ink outranks the kit's destructive ink (layer)",
    },
  ],
  Tabs: [
    {
      from: ["bg-transparent"],
      to: ["background-none"],
      source:
        'WorkTabs.svelte:28 at T, `:global(.work-tabs[data-slot="tabs"]) { background: none }`: the shorthand, every longhand reset',
    },
  ],
  ProviderLogo: [
    {
      from: ["text-hue-amber-500", "opacity-80"],
      to: ["opacity-80"],
      source:
        "a dead colour: on the GitHub mark (INK) ProviderLogo's `color: var(--ink-strong) !important` wins over the amber",
    },
  ],
};

/** The consumer's classes in their variant-order form, and the rewrites applied. */
function rewritten(
  part: string,
  classes: string[],
  flagged: Set<string>
): { applied: string[]; classes: string[] } {
  let out = [...classes];
  const applied: string[] = [];
  for (const r of REWRITES[part] ?? []) {
    if (!r.from.every((c) => out.includes(c))) {
      continue;
    }
    const at = out.indexOf(r.from[0] ?? "");
    out = out.filter((c) => !r.from.includes(c));
    out.splice(at, 0, ...r.to);
    if (r.from.some((c) => flagged.has(c))) {
      for (const c of r.to) {
        flagged.add(c);
      }
    }
    applied.push(r.source);
  }
  return { applied, classes: out };
}

/** The real alternatives where the evaluator's would be impossible combinations. */
const ALTS: Record<string, string[]> = {
  // HookTester.svelte:50: `kind` is one value, so exactly one of the three `&&` holds.
  "src/lib/cawco/HookTester.svelte:50": [
    "shrink-0 border-success-9 text-success-9",
    "shrink-0 border-warning-9 text-warning-9",
    "shrink-0 border-border text-ink-muted",
  ],
};

/** An attribute written as a plain string (`variant="ghost"`), or nothing. */
function literal(source: string): string | undefined {
  return source.match(PLAIN_ATTRIBUTE)?.[1];
}

const sameSet = (a: string, b: string) =>
  [...new Set(words(a))].sort().join(" ") ===
  [...new Set(words(b))].sort().join(" ");

interface Row {
  dropped: string[];
  element: string;
  hooks: string[];
  next: string;
  ok: boolean;
  part: string;
  props: string;
  rest: string;
  /** The variant-order rewrites the consumer's classes went through, by source. */
  rewrites: string[];
  set: string;
  site: string;
  today: string;
}

const sites: Site[] = readSites();
// Every flagged class on an element, from every site on it.
const flaggedOn = new Map<string, Set<string>>();
for (const site of sites) {
  for (const i of site.instances) {
    const key = `${site.file}:${i.line}:${i.attr}`;
    const set = flaggedOn.get(key) ?? new Set<string>();
    for (const c of site.flagged) {
      set.add(c);
    }
    flaggedOn.set(key, set);
  }
}

const rows: Row[] = [];
const unmatched: string[] = [];
const seen = new Set<string>();
for (const site of sites) {
  for (const i of site.instances) {
    const elementKey = `${site.file}:${i.line}:${i.attr}`;
    if (seen.has(elementKey)) {
      continue;
    }
    seen.add(elementKey);
    const forward = FORWARDS[site.part];
    const partName =
      forward?.part ??
      (i.attr === "class" ? site.part : `${site.part}.${i.attr}`);
    const part = PARTS[partName];
    if (!part) {
      unmatched.push(`${elementKey} <${site.part}>: no part entry`);
      continue;
    }
    const wrapper = i.wrapper ? WRAPPERS[i.wrapper] : undefined;
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries({
      ...i.props,
      ...(wrapper?.props ?? {}),
    })) {
      const value = wrapper?.props[k] ?? literal(v);
      if (value !== undefined) {
        props[k] = value;
      }
    }
    const flagged = new Set(flaggedOn.get(elementKey) ?? []);
    const alts = ALTS[`${site.file}:${i.line}`] ?? i.alts;
    const adds = SET_ADDS[`${site.file}:${i.line}`] ?? [];
    for (const alt of alts) {
      const consumer = [
        ...(forward ? words(forward.classes) : []),
        ...(wrapper ? words(wrapper.classes) : []),
        ...words(alt),
        ...adds,
      ];
      const hooks = consumer.filter((c) => c in HOOKS);
      const { applied, classes } = rewritten(
        forward?.part ?? site.part,
        consumer.filter((c) => !(c in HOOKS)),
        flagged
      );
      const recipe = part.file ? recipeOf(part.file, part.recipe) : null;
      if (!recipe) {
        // A part whose every hit is a hook.
        rows.push({
          site: `${site.file}:${site.line}`,
          set: site.set,
          part: site.part,
          element: elementKey,
          props: "",
          rest: classes.join(" "),
          dropped: [],
          hooks,
          rewrites: applied,
          ok: classes.every((c) => !flagged.has(c)),
          today: "",
          next: "",
        });
        continue;
      }
      const recipeProps: Record<string, unknown> = {};
      for (const k of Object.keys(recipe.variants)) {
        if (!part.axes.includes(k) && props[k] !== undefined) {
          recipeProps[k] = props[k];
        }
      }
      const head = forward ? [] : before(part, props);
      const own = cn(...head, recipe(recipeProps));
      const ownSet = new Set(words(own));
      const wanted = classes.filter((c) => flagged.has(c) || adds.includes(c));
      let need = [...wanted];
      const chosen: Record<string, string> = {};
      const candidates = part.axes
        .flatMap((axis) =>
          Object.entries(recipe.variants[axis] ?? {}).map(([value, cls]) => ({
            axis,
            value,
            cls: words(String(cls)),
          }))
        )
        .sort((a, b) => b.cls.length - a.cls.length);
      for (const c of candidates) {
        if (chosen[c.axis] !== undefined) {
          continue;
        }
        if (c.cls.length > 0 && c.cls.every((x) => need.includes(x))) {
          chosen[c.axis] = c.value;
          need = need.filter((x) => !c.cls.includes(x));
        }
      }
      // What no value draws but the part already does: a duplicate the consumer drops.
      const dropped = need.filter((c) => ownSet.has(c));
      need = need.filter((c) => !ownSet.has(c));
      if (need.length > 0) {
        unmatched.push(
          `${elementKey} <${site.part}> alt "${alt}": no value draws ${need.join(" ")}`
        );
      }
      const rest = classes.filter((c) => !wanted.includes(c));
      const today = cn(...head, recipe(recipeProps), classes.join(" "));
      const next = cn(
        ...head,
        recipe({ ...recipeProps, ...chosen }),
        rest.join(" ")
      );
      rows.push({
        site: `${site.file}:${site.line}`,
        set: site.set,
        part: site.part,
        element: elementKey,
        props: Object.entries(chosen)
          .map(([k, v]) => `${k}="${v}"`)
          .join(" "),
        rest: rest.join(" "),
        dropped,
        hooks,
        rewrites: applied,
        ok: need.length === 0 && sameSet(today, next),
        today,
        next,
      });
    }
  }
}

const bad = rows.filter((r) => !r.ok);
for (const r of bad) {
  console.log(
    `MISMATCH ${r.element} <${r.part}>\n  today ${r.today}\n  new   ${r.next}`
  );
}
for (const u of unmatched) {
  console.log(`UNMATCHED ${u}`);
}
writeFileSync(
  join(ROOT, ".cutover", "clearance", "K2-exact.json"),
  `${JSON.stringify(rows, null, 1)}\n`
);
const elements = new Set(rows.map((r) => r.element)).size;
console.log(
  `${sites.length} sites (${elements} elements, ${rows.length} class strings), ${bad.length} mismatches, ${unmatched.length} unmatched`
);
process.exit(bad.length + unmatched.length === 0 ? 0 : 1);
