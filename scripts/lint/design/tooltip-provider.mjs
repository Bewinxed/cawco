// house/tooltip-provider-at-root: every Svelte tree the dashboard mounts has
// exactly one tooltip provider, in its root component, so a part that draws
// a tooltip renders wherever it is mounted and no caller supplies one.
//
// bits-ui's Tooltip.Root reads its provider from Svelte context
// (`TooltipProviderContext.get()`, tooltip.svelte.js), and runed's
// `Context.get()` throws `Context "Tooltip.Provider" not found` when no
// ancestor set it. Context does not cross a `mount()`: a decision page is
// its own document and its own tree (decisions/host/host.ts), and its setup
// page threw that error on every project's board once a stage's More drew a
// GlideTip (tsk-354). bits-ui's docs: the provider "is required to be an
// ancestor of the `Tooltip.Root` component", in the root layout.
//
// What the rule reads:
// - in a `.svelte` file, a provider tag (`Tooltip.Provider`,
//   `TooltipProvider`, `TooltipPrimitive.Provider`) outside the root files
//   and the kit (src/lib/components/ui) is reported on the tag: the root
//   holds the tree's one provider;
// - a root file with no provider tag is reported at its start;
// - in a `.ts` module, a `mount()` (svelte's) of a default-imported
//   `.svelte` file that is not a root file is reported on the call: a tree
//   mounted there has no provider above it. A new tree's root joins ROOTS
//   and wraps itself in the provider.
import path from "node:path";
import { DASHBOARD, eachNode } from "./model.mjs";

/** The kit, whose tooltip parts define the provider. */
const KIT = "src/lib/components/ui/";

/**
 * The root component of each Svelte tree, from apps/dashboard: the app's
 * routes, a decision page (host.ts), an HTML page's dials (dials.ts) and the
 * word address's preview (address/flow/main.ts); and the planted roots the
 * rule's fixtures stand for (scripts/lint/fixtures/expected.txt).
 */
const ROOTS = new Set([
  "src/routes/+layout.svelte",
  "src/lib/cawco/decisions/host/Host.svelte",
  "src/lib/cawco/decisions/host/DialsRoot.svelte",
  "src/lib/cawco/address/flow/Page.svelte",
  "../../scripts/lint/fixtures/design/planted-tooltip-root.svelte",
  "../../scripts/lint/fixtures/design/planted-tooltip-bare-root.svelte",
]);

const PROVIDER = /^(?:Tooltip(?:Primitive)?\.Provider|TooltipProvider)$/u;

const STRAY =
  "A tooltip provider stands only in a tree's root component (house/tooltip-provider-at-root, scripts/lint/design/tooltip-provider.mjs): the root already holds one, so drop this one; a new tree's root joins ROOTS there.";
const BARE =
  "A Svelte tree's root component holds its one tooltip provider, around everything it draws, so any part that draws a tooltip renders in it (scripts/lint/design/tooltip-provider.mjs).";
const UNROOTED =
  "This mounts a Svelte tree whose root is not on the root list, so no tooltip provider stands above it: wrap the component in the kit's TooltipProvider and add it to ROOTS (scripts/lint/design/tooltip-provider.mjs).";

/** `file` from apps/dashboard. */
const named = (file) => path.relative(DASHBOARD, file);

/** Where an import's source points, from apps/dashboard, or null for a package's. */
function importedFile(model, source) {
  if (source.startsWith("#lib/")) {
    return named(path.join(DASHBOARD, "src/lib", source.slice(5)));
  }
  if (source.startsWith(".")) {
    return named(path.resolve(path.dirname(model.file), source));
  }
  return null;
}

/** The markup's provider tags. */
function providersOf(model) {
  const found = [];
  eachNode(model, (node) => {
    if (node.type === "Component" && PROVIDER.test(node.name)) {
      found.push(node);
    }
  });
  return found;
}

/** The `mount()` calls of a `.ts` module whose component is a `.svelte` file off the root list. */
function unrootedMounts(model) {
  const components = new Map();
  let mountName = null;
  for (const statement of model.ast.body ?? []) {
    if (statement.type !== "ImportDeclaration") {
      continue;
    }
    const source = statement.source.value;
    for (const specifier of statement.specifiers) {
      if (
        source === "svelte" &&
        specifier.type === "ImportSpecifier" &&
        specifier.imported.name === "mount"
      ) {
        mountName = specifier.local.name;
      }
      if (
        source.endsWith(".svelte") &&
        specifier.type === "ImportDefaultSpecifier"
      ) {
        components.set(specifier.local.name, importedFile(model, source));
      }
    }
  }
  if (!mountName) {
    return [];
  }
  const findings = [];
  eachNode(model, (node) => {
    if (
      node.type !== "CallExpression" ||
      node.callee.type !== "Identifier" ||
      node.callee.name !== mountName
    ) {
      return;
    }
    const [component] = node.arguments;
    if (component?.type !== "Identifier" || !components.has(component.name)) {
      return;
    }
    const file = components.get(component.name);
    if (file !== null && !ROOTS.has(file)) {
      findings.push({ start: node.start, end: node.end, message: UNROOTED });
    }
  });
  return findings;
}

export function tooltipProviderAtRoot(model) {
  if (model.kind === "ts") {
    return unrootedMounts(model);
  }
  const file = named(model.file);
  const providers = providersOf(model);
  if (ROOTS.has(file)) {
    return providers.length === 0 ? [{ start: 0, end: 1, message: BARE }] : [];
  }
  if (file.startsWith(KIT)) {
    return [];
  }
  return providers.map((node) => ({
    start: node.start,
    end: node.end,
    message: STRAY,
  }));
}
