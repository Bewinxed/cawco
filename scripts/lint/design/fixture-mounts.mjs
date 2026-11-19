// house/fixture-mounts: a fixture mounts and mocks. Everything a person sees
// or presses in a frame of the design graph is drawn by a product
// component; the fixture a states file draws holds those components, the
// mock that feeds them, and wrappers that give the frame room.
//
// The owner, on a canvas whose fixture drew a session card, a popover and
// its rows by hand (2026-11-16): "every time u make a component here you
// keep using fake components", and "showing a proper component i can just
// interact with, built from actual components". A copy drawn beside the
// product shows him a thing the product does not have, and his pins land on
// lines no screen ships.
//
// A fixture is a `.svelte` file that only states files reach: every file
// that imports it is a states file (`<Name>.stories.ts`) or another
// fixture, and no states file of its own name stands beside it (a component
// with its own states file is a part, new or shipped, and draws itself).
//
// What the rule reads in a fixture:
// - a control or a surface written as its own element (`button`, `input`,
//   `textarea`, `select`, `article`, `dialog`), reported on the element;
// - a `role` on an element, reported on the attribute: the element stands in
//   for a control (`role="option"`) or a surface (`role="dialog"`);
// - a call of a kit recipe (`buttonVariants(…)`, `glidePopoverVariants(…)`),
//   reported on the call: the recipe's own component draws that look.
//
// What it cannot read: a card copied as plain `div`s and words. The canvas
// report's `parts` (the design-graph skill, step 5) names the product
// components a frame drew, and a missing one is that copy.
import fs from "node:fs";
import path from "node:path";
import { DASHBOARD, eachNode } from "./model.mjs";

const OWN_ELEMENTS = new Set([
  "button",
  "input",
  "textarea",
  "select",
  "article",
  "dialog",
]);
const RECIPE = /Variants$/u;
const SOURCE_FILE = /\.(?:svelte|[cm]?[jt]sx?)$/u;
const SVELTE_FILE = /\.svelte$/u;
const STATES_FILE = /\.stories\.[cm]?[jt]sx?$/u;
const SKIPPED = new Set(["node_modules", ".git", ".svelte-kit", "build"]);
/** A `.svelte` specifier, in `import … from`, `export … from`, `import "…"` and `import("…")`. */
const SVELTE_SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+\.svelte)["']/gu;

const ELEMENT =
  "A fixture mounts and mocks (house/fixture-mounts): only states files reach this file, so everything a person sees or presses in its frame is drawn by a product component. Mount the component that draws this (`design_map` with `query` finds it; the kit's Button, Input, Dialog for a bare control) and feed it mock data: its props, its store's writers in the story's `beforeEach`, an event through the prop that takes it. A change to a product component is made in that component, never in a twin drawn here.";
const ROLE =
  "A fixture mounts and mocks (house/fixture-mounts): a `role` on a fixture's own element makes it stand in for a control or a surface a product component draws. Mount that component (`design_map` with `query` finds it) and feed it mock data; a wrapper that only gives the frame room carries no role.";
const RECIPE_CALL =
  "A fixture mounts and mocks (house/fixture-mounts): a kit recipe called in a fixture redraws the part that owns the recipe. Mount the recipe's own component (the file beside the recipe, or the product component that calls it) and pass its props; the look stays the component's.";

/** The folders whose files import the dashboard's components: its source, and the rule's planted fixtures. */
const READ = [
  path.join(DASHBOARD, "src"),
  path.resolve(DASHBOARD, "../../scripts/lint/fixtures/design"),
];

/** Where a specifier points, by absolute path, or null for a package's. */
function importedFile(from, specifier) {
  if (specifier.startsWith("#lib/")) {
    return path.join(DASHBOARD, "src/lib", specifier.slice(5));
  }
  if (specifier.startsWith(".")) {
    return path.resolve(path.dirname(from), specifier);
  }
  return null;
}

/** The `.svelte` files a source file imports, by absolute path. */
function svelteImportsOf(from) {
  return (
    [...fs.readFileSync(from, "utf8").matchAll(SVELTE_SPECIFIER)]
      .map(([, specifier]) => importedFile(from, specifier))
      // A specifier such as `./board.svelte` names the module
      // `board.svelte.ts`: no component, so no file by that name.
      .filter((file) => file && fs.existsSync(file))
  );
}

/** Every source file under `dir`. */
function sourceFilesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIPPED.has(entry.name)) {
      return [];
    }
    const at = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFilesUnder(at);
    }
    return SOURCE_FILE.test(entry.name) ? [at] : [];
  });
}

/** Every `.svelte` file with the files that import it, by absolute path; read once. */
function importersOf() {
  const importers = new Map();
  for (const from of READ.filter(fs.existsSync).flatMap(sourceFilesUnder)) {
    for (const file of svelteImportsOf(from)) {
      importers.set(file, (importers.get(file) ?? new Set()).add(from));
    }
  }
  return importers;
}

/** Whether a states file of the component's own name stands beside it. */
const hasOwnStatesFile = (file) =>
  fs.existsSync(file.replace(SVELTE_FILE, ".stories.ts"));

/** The fixtures: each `.svelte` file only states files reach, through other fixtures or at once. */
let fixtures = null;
function fixtureFiles() {
  if (fixtures) {
    return fixtures;
  }
  fixtures = new Set();
  const candidates = [...importersOf()].filter(
    ([file]) => !hasOwnStatesFile(file)
  );
  let grew = true;
  while (grew) {
    grew = false;
    for (const [file, importers] of candidates) {
      if (
        !fixtures.has(file) &&
        [...importers].every(
          (importer) => STATES_FILE.test(importer) || fixtures.has(importer)
        )
      ) {
        fixtures.add(file);
        grew = true;
      }
    }
  }
  return fixtures;
}

/** The name a call calls: `buttonVariants` of `buttonVariants(…)` and of `kit.buttonVariants(…)`. */
function calledName(call) {
  const { callee } = call;
  if (callee.type === "Identifier") {
    return callee.name;
  }
  if (callee.type === "MemberExpression" && !callee.computed) {
    return callee.property.name;
  }
  return null;
}

export function fixtureMounts(model) {
  if (
    model.kind !== "svelte" ||
    !fixtureFiles().has(path.resolve(model.file))
  ) {
    return [];
  }
  const findings = [];
  eachNode(model, (node) => {
    if (node.type === "RegularElement") {
      if (OWN_ELEMENTS.has(node.name)) {
        // The opening tag's name: `<button`.
        findings.push({
          start: node.start,
          end: node.start + 1 + node.name.length,
          message: ELEMENT,
        });
      }
      for (const attribute of node.attributes ?? []) {
        if (attribute.type === "Attribute" && attribute.name === "role") {
          findings.push({
            start: attribute.start,
            end: attribute.end,
            message: ROLE,
          });
        }
      }
    } else if (
      node.type === "CallExpression" &&
      RECIPE.test(calledName(node) ?? "")
    ) {
      findings.push({
        start: node.start,
        end: node.end,
        message: RECIPE_CALL,
      });
    }
  });
  return findings;
}
