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
 * The recipes are the kit's own `tv({…})` literals, read from the module
 * script and built with utils.ts's `tv`; the arguments before them are the
 * component's own `cn(…)` call, evaluated with the element's props and the
 * component's defaults.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { plugin } from "bun";
import { readSites, type Site, walk } from "./k2-sites";

const ROOT = resolve(import.meta.dir, "..");
const DASH = join(ROOT, "apps", "dashboard");
const UI = join(DASH, "src", "lib", "components", "ui");
const RAW = /\?raw$/;
const LAST_SEGMENT = /\/[^/]*$/;
const ANY = /.*/;
const PLAIN_ATTRIBUTE = /^[\w-]+="([^"{}]*)"$/;
const SPACES = /\s+/;

plugin({
  name: "raw",
  setup(build) {
    build.onResolve({ filter: RAW }, (args) => ({
      path: resolve(
        args.importer.replace(LAST_SEGMENT, ""),
        args.path.replace(RAW, "")
      ),
      namespace: "raw",
    }));
    build.onLoad({ filter: ANY, namespace: "raw" }, (args) => ({
      contents: `export default ${JSON.stringify(readFileSync(args.path, "utf8"))};`,
      loader: "js",
    }));
  },
});
const { cn, tv } = (await import(join(DASH, "src", "lib", "utils.ts"))) as {
  cn: (...c: unknown[]) => string;
  tv: (config: unknown) => Recipe;
};
const { parse } = (await import(Bun.resolveSync("svelte/compiler", DASH))) as {
  parse: (source: string, options: { modern: true }) => Node;
};

// biome-ignore lint/suspicious/noExplicitAny: Svelte's and ESTree's nodes, read structurally
type Node = any;
type Recipe = ((props: Record<string, unknown>) => string) & {
  variants: Record<string, Record<string, string>>;
};

interface Part {
  /** The axes K2 added (the looks a consumer passes). */
  axes: string[];
  file: string;
  recipe: string;
}
const ui = (path: string) => join(UI, path);
const PARTS: Record<string, Part> = {
  Button: {
    file: ui("button/button.svelte"),
    recipe: "buttonVariants",
    axes: [
      "tone",
      "answer",
      "edge",
      "fit",
      "shape",
      "width",
      "margin",
      "gap",
      "pad",
      "reveal",
      "expanded",
      "face",
      "toggle",
    ],
  },
  Badge: {
    file: ui("badge/badge.svelte"),
    recipe: "badgeVariants",
    axes: ["size", "tone", "gap", "kind"],
  },
  Skeleton: {
    file: ui("skeleton/skeleton.svelte"),
    recipe: "skeletonVariants",
    axes: ["height", "width", "radius", "cell"],
  },
  PopoverContent: {
    file: ui("popover/popover-content.svelte"),
    recipe: "popoverContentVariants",
    axes: ["width", "height", "pad", "gap", "frame"],
  },
  Input: {
    file: ui("input/input.svelte"),
    recipe: "inputVariants",
    axes: ["face", "text", "pad", "measure", "flex"],
  },
  Textarea: {
    file: ui("textarea/textarea.svelte"),
    recipe: "textareaVariants",
    axes: ["face", "text", "height", "fill", "look"],
  },
  SelectTrigger: {
    file: ui("select/select-trigger.svelte"),
    recipe: "selectTriggerVariants",
    axes: ["measure", "tone", "look", "chosen"],
  },
  ResizableHandle: {
    file: ui("resizable/resizable-handle.svelte"),
    recipe: "resizableHandleVariants",
    axes: ["look"],
  },
  ResizablePaneGroup: {
    file: ui("resizable/resizable-pane-group.svelte"),
    recipe: "resizablePaneGroupVariants",
    axes: ["height"],
  },
  SidebarMenuButton: {
    file: ui("sidebar/sidebar-menu-button.svelte"),
    recipe: "sidebarMenuButtonVariants",
    axes: ["row"],
  },
  SidebarMenuSubButton: {
    file: ui("sidebar/sidebar-menu-sub-button.svelte"),
    recipe: "sidebarMenuSubButtonVariants",
    axes: ["row", "tone"],
  },
  SidebarGroup: {
    file: ui("sidebar/sidebar-group.svelte"),
    recipe: "sidebarGroupVariants",
    axes: ["pad"],
  },
  SidebarGroupLabel: {
    file: ui("sidebar/sidebar-group-label.svelte"),
    recipe: "sidebarGroupLabelVariants",
    axes: ["pad", "end"],
  },
  SidebarMenuBadge: {
    file: ui("sidebar/sidebar-menu-badge.svelte"),
    recipe: "sidebarMenuBadgeVariants",
    axes: ["tone"],
  },
  SidebarMenu: {
    file: ui("sidebar/sidebar-menu.svelte"),
    recipe: "sidebarMenuVariants",
    axes: ["gap"],
  },
  SidebarContent: {
    file: ui("sidebar/sidebar-content.svelte"),
    recipe: "sidebarContentVariants",
    axes: ["pad"],
  },
  DropdownMenuContent: {
    file: ui("dropdown-menu/dropdown-menu-content.svelte"),
    recipe: "dropdownMenuContentVariants",
    axes: ["width", "min"],
  },
  DropdownMenuSubContent: {
    file: ui("dropdown-menu/dropdown-menu-sub-content.svelte"),
    recipe: "dropdownMenuSubContentVariants",
    axes: ["width", "min"],
  },
  DropdownMenuItem: {
    file: ui("dropdown-menu/dropdown-menu-item.svelte"),
    recipe: "dropdownMenuItemVariants",
    axes: ["marks"],
  },
  DropdownMenuPendingItem: {
    file: ui("dropdown-menu/dropdown-menu-pending-item.svelte"),
    recipe: "dropdownMenuPendingItemVariants",
    axes: ["look"],
  },
  ContextMenuSubContent: {
    file: ui("context-menu/context-menu-sub-content.svelte"),
    recipe: "contextMenuSubContentVariants",
    axes: ["min", "width", "frame", "pad"],
  },
  ContextMenuSubTrigger: {
    file: ui("context-menu/context-menu-sub-trigger.svelte"),
    recipe: "contextMenuSubTriggerVariants",
    axes: ["gap"],
  },
  DrawerContent: {
    file: ui("drawer/drawer-content.svelte"),
    recipe: "drawerContentVariants",
    axes: ["pad", "height", "look"],
  },
  DrawerDescription: {
    file: ui("drawer/drawer-description.svelte"),
    recipe: "drawerDescriptionVariants",
    axes: ["text"],
  },
  DrawerFooter: {
    file: ui("drawer/drawer-footer.svelte"),
    recipe: "drawerFooterVariants",
    axes: ["pad"],
  },
  DialogContent: {
    file: ui("dialog/dialog-content.svelte"),
    recipe: "dialogContentVariants",
    axes: ["width"],
  },
  "DialogContent.bodyClass": {
    file: ui("dialog/dialog-content.svelte"),
    recipe: "dialogBodyVariants",
    axes: ["bodyPad"],
  },
  DialogTitle: {
    file: ui("dialog/dialog-title.svelte"),
    recipe: "dialogTitleVariants",
    axes: ["gap", "look"],
  },
  SheetContent: {
    file: ui("sheet/sheet-content.svelte"),
    recipe: "sheetContentVariants",
    axes: ["pad"],
  },
  Alert: {
    file: ui("alert/alert.svelte"),
    recipe: "alertVariants",
    axes: ["surface"],
  },
  AlertAction: {
    file: ui("alert/alert-action.svelte"),
    recipe: "alertActionVariants",
    axes: ["place"],
  },
  CardContent: {
    file: ui("card/card-content.svelte"),
    recipe: "cardContentVariants",
    axes: ["gap"],
  },
  EmptyState: {
    file: ui("empty/empty-state.svelte"),
    recipe: "emptyStateVariants",
    axes: ["pad"],
  },
  PopoverTrigger: {
    file: ui("popover/popover-trigger.svelte"),
    recipe: "popoverTriggerVariants",
    axes: ["motion"],
  },
  DrawerTrigger: { file: "", recipe: "", axes: [] },
  Tabs: {
    file: ui("fluid-tabs/Tabs.svelte"),
    recipe: "tabsVariants",
    axes: ["fill"],
  },
  ThinkingIndicator: {
    file: ui("thinking-indicator/thinking-indicator.svelte"),
    recipe: "thinkingIndicatorVariants",
    axes: ["fit"],
  },
  Spinner: {
    file: ui("spinner/spinner.svelte"),
    recipe: "spinnerVariants",
    axes: ["tone", "box", "reveal"],
  },
  Checkbox: {
    file: ui("checkbox/checkbox.svelte"),
    recipe: "checkboxVariants",
    axes: ["reveal"],
  },
  Switch: {
    file: ui("switch/switch.svelte"),
    recipe: "switchVariants",
    axes: ["align"],
  },
  NativeSelect: {
    file: ui("native-select/native-select.svelte"),
    recipe: "nativeSelectVariants",
    axes: ["measure"],
  },
  ProviderLogo: {
    file: join(
      DASH,
      "src",
      "lib",
      "components",
      "features",
      "ProviderLogo.svelte"
    ),
    recipe: "providerLogoVariants",
    axes: ["fade"],
  },
};
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
        "not-disabled:group-not-data-[disabled=true]/field",
        "disabled:group-not-data-[disabled=true]/field",
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

/** The `tv({…})` literal a module script exports under `name`, built with utils.ts's tv. */
const recipes = new Map<string, Recipe>();
function recipeOf(file: string, name: string): Recipe {
  const key = `${file}#${name}`;
  const known = recipes.get(key);
  if (known) {
    return known;
  }
  const source = readFileSync(file, "utf8");
  const at = source.indexOf(`export const ${name} = tv(`);
  if (at < 0) {
    throw new Error(`${file}: no export const ${name} = tv(`);
  }
  const open = source.indexOf("(", at);
  let depth = 0;
  let end = open;
  for (; end < source.length; end += 1) {
    if (source[end] === "(") {
      depth += 1;
    } else if (source[end] === ")") {
      depth -= 1;
      if (depth === 0) {
        break;
      }
    }
  }
  const config = source.slice(open + 1, end);
  const made = new Function("tv", `return tv(${config});`)(tv) as Recipe;
  recipes.set(key, made);
  return made;
}

/** The component's defaults, from `let { x = … } = $props()`. */
function defaultsOf(ast: Node): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  walk(ast.instance?.content, (node) => {
    const props =
      node.type === "VariableDeclarator" &&
      node.id?.type === "ObjectPattern" &&
      node.init?.callee?.name === "$props";
    if (!props) {
      return;
    }
    for (const { value } of node.id.properties) {
      const named =
        value?.type === "AssignmentPattern" &&
        value.left?.type === "Identifier";
      if (named && value.right.type === "Literal") {
        out[value.left.name] = value.right.value;
      }
    }
  });
  return out;
}

/** An argument of the component's `cn(…)`, with the element's props bound. */
function argumentOf(
  n: Node,
  bindings: Record<string, unknown>,
  file: string
): unknown {
  const of = (m: Node) => argumentOf(m, bindings, file);
  switch (n.type) {
    case "Literal":
      return n.value;
    case "Identifier":
      return bindings[n.name];
    case "LogicalExpression":
      return n.operator === "&&"
        ? of(n.left) && of(n.right)
        : of(n.left) || of(n.right);
    case "ConditionalExpression":
      return of(n.test) ? of(n.consequent) : of(n.alternate);
    case "BinaryExpression":
      if (n.operator === "===" || n.operator === "!==") {
        return (of(n.left) === of(n.right)) === (n.operator === "===");
      }
      throw new Error(`${file}: operator ${n.operator}`);
    default:
      throw new Error(`${file}: cannot evaluate ${n.type}`);
  }
}

/** The arguments the component's `cn(…)` passes before its looks recipe, evaluated with the props. */
function before(part: Part, props: Record<string, unknown>): string[] {
  const source = readFileSync(part.file, "utf8");
  const ast = parse(source, { modern: true });
  const bindings = { ...defaultsOf(ast), ...props };
  let found: Node[] = [];
  const find = (node: Node) => {
    if (
      found.length > 0 ||
      node.type !== "CallExpression" ||
      node.callee?.name !== "cn"
    ) {
      return;
    }
    const at = node.arguments.findIndex(
      (a: Node) => a.type === "CallExpression" && a.callee?.name === part.recipe
    );
    if (at >= 0) {
      found = node.arguments.slice(0, at);
    }
  };
  walk(ast.instance?.content, find);
  walk(ast.fragment, find);
  // None: the recipe is the call's own first argument, or the class is the recipe alone.
  return found
    .map((n) => argumentOf(n, bindings, part.file))
    .filter((v): v is string => typeof v === "string");
}

/** An attribute written as a plain string (`variant="ghost"`), or nothing. */
function literal(source: string): string | undefined {
  return source.match(PLAIN_ATTRIBUTE)?.[1];
}

const words = (s: string) => s.split(SPACES).filter(Boolean);
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
