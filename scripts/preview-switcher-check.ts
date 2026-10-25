/**
 * `bun scripts/preview-switcher-check.ts` (part of `bun run check`): every
 * design preview switches its states through the one shared switcher,
 * design-previews/state-switcher.js (the `interfaces:state-machine` skill's
 * switcher), and none carries a switcher of its own. Refused:
 *
 *   copy       a folder-served preview's `state-switcher.js` that is not
 *              byte for byte the shared one (a folder served on its own
 *              reaches nothing outside it, so each carries a copy)
 *   unloaded   a preview page that does not load the switcher: a folder's
 *              page with no module importing `./state-switcher.js`, or a
 *              built page whose bundle does not hold it
 *   reader     `__state` read or written outside the switcher
 *   look       the switcher's own class names outside it (a hand-made copy
 *              of its markup or its CSS)
 *   switch     a hand-made switch in a preview page's shell: a radio input,
 *              a radiogroup or an `aria-pressed` control in its index.html
 *
 * Passed over: Markdown (a README may name the address), the built bundles
 * themselves (read for the switcher instead), and the page a preview holds
 * as the thing under review (tablet-comments/page/: the comment-sizing
 * page as the hub served it when the owner commented on it, captured by
 * its capture.ts; its pins stand on that page as it was).
 *
 *   bun scripts/preview-switcher-check.ts
 *
 * Prints each refusal as `path  kind  what`, and exits 1 when there is any.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const PREVIEWS = join(ROOT, "design-previews");
const SHARED = join(PREVIEWS, "state-switcher.js");
/** Sources a built preview is made from: they hold no switcher of their own either. */
const BUILT_FROM = [join(ROOT, "apps/dashboard/src/lib/cawco/address/flow")];
/** The pages under review a preview holds, as they were captured. */
const UNDER_REVIEW = [join(PREVIEWS, "tablet-comments/page")];
const SOURCE = /\.(?:[cm]?js|ts|svelte|html|css)$/;
const READER = /__state\b/;
const LOOK =
  /\.state-switcher\b|state-switcher-(?:group|heading|select)|class=["'][^"']*\bstate-switcher\b/;
const SWITCH = /type=["']radio["']|role=["']radiogroup["']|aria-pressed/;
/** A page's own module, and its import of the switcher beside it. */
const MODULE = /\.m?js$/;
const IMPORTS = /from\s+["']\.\/state-switcher\.js["']/;
/** What only the shared switcher's code holds: its CSS, as any bundle of it carries it. */
const MARK = ".state-switcher-selects";

const shared = readFileSync(SHARED, "utf8");
const refused: string[] = [];
const refuse = (path: string, kind: string, what: string) =>
  refused.push(`${relative(ROOT, path)}  ${kind}  ${what}`);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === "node_modules" || UNDER_REVIEW.includes(path)) {
      continue;
    }
    if (statSync(path).isDirectory()) {
      walk(path, out);
    } else {
      out.push(path);
    }
  }
  return out;
}

/** A built page: its index.html loads a bundle from assets/. */
const builtBundles = (dir: string): string[] => {
  const page = readFileSync(join(dir, "index.html"), "utf8");
  return [...page.matchAll(/src=["']\.\/(assets\/[^"']+\.js)["']/g)].map((m) =>
    join(dir, m[1] ?? "")
  );
};

// Each preview page loads the shared switcher.
for (const name of readdirSync(PREVIEWS)) {
  const dir = join(PREVIEWS, name);
  if (!(statSync(dir).isDirectory() && existsSync(join(dir, "index.html")))) {
    continue;
  }
  const bundles = builtBundles(dir);
  if (bundles.length > 0) {
    if (
      !bundles.some((bundle) => readFileSync(bundle, "utf8").includes(MARK))
    ) {
      refuse(
        join(dir, "index.html"),
        "unloaded",
        "its bundle holds no shared state switcher"
      );
    }
    continue;
  }
  const copy = join(dir, "state-switcher.js");
  if (!existsSync(copy)) {
    refuse(dir, "unloaded", "no state-switcher.js beside the page");
  } else if (readFileSync(copy, "utf8") !== shared) {
    refuse(
      copy,
      "copy",
      "differs from design-previews/state-switcher.js (cp it again)"
    );
  }
  const imports = readdirSync(dir)
    .filter((file) => MODULE.test(file) && file !== "state-switcher.js")
    .some((file) => IMPORTS.test(readFileSync(join(dir, file), "utf8")));
  if (!imports) {
    refuse(
      dir,
      "unloaded",
      "no module of the page imports ./state-switcher.js"
    );
  }
}

// No switcher of a preview's own: no address reader, no copy of its look, no hand-made switch in a shell.
for (const path of [
  ...walk(PREVIEWS),
  ...BUILT_FROM.flatMap((dir) => walk(dir)),
]) {
  const name = relative(PREVIEWS, path);
  const built = /(^|\/)assets\//.test(name) && !name.startsWith("..");
  if (
    !SOURCE.test(path) ||
    built ||
    path === SHARED ||
    path.endsWith("/state-switcher.js")
  ) {
    continue;
  }
  const text = readFileSync(path, "utf8");
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (READER.test(line)) {
      refuse(path, "reader", `line ${i + 1}: ${line.trim().slice(0, 100)}`);
    }
    if (LOOK.test(line)) {
      refuse(path, "look", `line ${i + 1}: ${line.trim().slice(0, 100)}`);
    }
  });
  const shell =
    path.endsWith("/index.html") &&
    relative(PREVIEWS, path).split("/").length === 2;
  if (shell) {
    lines.forEach((line, i) => {
      if (SWITCH.test(line)) {
        refuse(path, "switch", `line ${i + 1}: ${line.trim().slice(0, 100)}`);
      }
    });
  }
}

if (refused.length > 0) {
  console.error(
    `preview-switcher-check: ${refused.length} refused (every design preview switches its states through design-previews/state-switcher.js alone):`
  );
  for (const line of refused) {
    console.error(`  ${line}`);
  }
  process.exit(1);
}
console.log(
  "preview-switcher-check: every design preview switches through the shared state switcher"
);
