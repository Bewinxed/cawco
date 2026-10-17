/**
 * The kit, as K2's proofs read it: utils.ts's own `cn` and `tv`, each part's
 * looks recipe (the `tv({…})` literal its module script exports, built with
 * that `tv`), and the arguments the part's own `cn(…)` passes before the
 * recipe, evaluated with an element's props and the component's defaults.
 * k2-exact.ts and k2-looks.ts both read the kit through this.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { plugin } from "bun";
import { walk } from "./k2-sites";

export const ROOT = resolve(import.meta.dir, "..");
export const DASH = join(ROOT, "apps", "dashboard");
const UI = join(DASH, "src", "lib", "components", "ui");
const RAW = /\?raw$/;
const LAST_SEGMENT = /\/[^/]*$/;
const ANY = /.*/;
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
export const { cn, tv } = (await import(
  join(DASH, "src", "lib", "utils.ts")
)) as {
  cn: (...c: unknown[]) => string;
  tv: (config: unknown) => Recipe;
};
const { parse } = (await import(Bun.resolveSync("svelte/compiler", DASH))) as {
  parse: (source: string, options: { modern: true }) => Node;
};

// biome-ignore lint/suspicious/noExplicitAny: Svelte's and ESTree's nodes, read structurally
type Node = any;
export type Recipe = ((props: Record<string, unknown>) => string) & {
  variants: Record<string, Record<string, string>>;
};

export interface Part {
  /** The axes K2 added (the looks a consumer passes). */
  axes: string[];
  file: string;
  recipe: string;
}
const ui = (path: string) => join(UI, path);
export const PARTS: Record<string, Part> = {
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
      "figures",
      "current",
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

export const words = (s: string) => s.split(SPACES).filter(Boolean);

/** The `tv({…})` literal a module script exports under `name`, built with utils.ts's tv. */
const recipes = new Map<string, Recipe>();
export function recipeOf(file: string, name: string): Recipe {
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
export function before(part: Part, props: Record<string, unknown>): string[] {
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

/**
 * The part's own final class string for a look: `cn(<its own arguments>,
 * recipe(<props>), <the caller's classes>)`, as the component composes it.
 */
export function classesOf(
  partName: string,
  props: Record<string, unknown>,
  caller = ""
): string {
  const part = PARTS[partName];
  if (!part) {
    throw new Error(`no part ${partName}`);
  }
  const recipe = recipeOf(part.file, part.recipe);
  return cn(...before(part, props), recipe(props), caller);
}
