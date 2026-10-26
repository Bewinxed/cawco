/**
 * Golar (golar.dev): typescript-go, with svelte2tsx for `.svelte` files
 * (@golar/svelte). `bun run check` (scripts/check.ts) runs it twice:
 *
 * - `golar tsc -b` over the project references: the type check of every
 *   `.ts` and `.svelte` file;
 * - `golar lint`: the rules below, over the files the change reaches.
 *
 * The rules: the switch check (scripts/lint/switch-exhaustiveness.ts) over
 * the dashboard's and every package's `.ts`, `.svelte.ts` and `.svelte`
 * files, and the design rules (scripts/lint/design) over the dashboard's
 * `src`, each with the fixtures that prove it (scripts/lint/fixtures). The
 * files are those git tracks or would track, narrowed to the list
 * `CAWCO_CHECK_FILES` names (one repository path a line) when it is set.
 *
 * Golar runs under Node, from the repository's root: it does not run under
 * Bun (auvred/golar#31).
 */
import { execFileSync } from "node:child_process";
import { getEnvironmentData, isMainThread } from "node:worker_threads";
import "@golar/svelte";
import { defineConfig } from "golar/unstable";
import { switchExhaustiveness } from "./scripts/lint/switch-exhaustiveness.ts";

/** The switches the rule must report, outside the product's tree (scripts/check.ts). */
const SWITCH_FIXTURES = "scripts/lint/fixtures/*.ts";
/** The planted mistakes each design rule must report (scripts/check.ts). */
const DESIGN_FIXTURES = "scripts/lint/fixtures/design/*.{svelte,ts}";

const tracked = (...globs: string[]): string[] =>
  execFileSync(
    "git",
    [
      "ls-files",
      "-co",
      "--exclude-standard",
      "--",
      // `:(glob)` so `**/` also matches no folder (a file right under `src/`).
      ...globs.map((glob) => `:(glob)${glob}`),
    ],
    { encoding: "utf8" }
  )
    .split("\n")
    .filter(Boolean);

const only = process.env.CAWCO_CHECK_FILES?.split("\n").filter(Boolean);
const within = (paths: string[]): string[] =>
  only ? paths.filter((path) => only.includes(path)) : paths;

/**
 * `path` as a glob that matches only itself: Golar reads its file list as
 * globs, and a route folder such as `(app)` is a glob group. The pattern is
 * tinyglobby's own escapePath for POSIX paths (Golar's globber).
 */
const literal = (path: string): string =>
  path.replace(
    /(?<!\\)([()[\]{}*?|]|^!|[!+@](?=\()|\\(?![()[\]{}!*+?@|]))/gu,
    "\\$&"
  );

const switched = within(
  tracked(
    "apps/dashboard/src/**/*.ts",
    "apps/dashboard/src/**/*.svelte",
    "packages/*/src/**/*.ts",
    "packages/*/src/**/*.tsx"
  )
);
const designed = within(
  tracked("apps/dashboard/src/**/*.ts", "apps/dashboard/src/**/*.svelte")
);

// The design rules load Tailwind's design system and Svelte's parser: only
// `golar lint` reads them, not `golar tsc`. A lint worker thread hears its
// mode from Golar's environment data (golar cli.js `golar-env`).
const linting = isMainThread
  ? process.argv.includes("lint")
  : (getEnvironmentData("golar-env") as { mode?: string } | undefined)?.mode ===
    "lint";
const design = linting
  ? (await import("./scripts/lint/design/index.mjs")).designRules
  : [];

export default defineConfig({
  lint: {
    use: [
      {
        files: [...switched.map(literal), SWITCH_FIXTURES],
        rules: [switchExhaustiveness],
      },
      {
        files: [...designed.map(literal), DESIGN_FIXTURES],
        rules: design,
      },
    ],
  },
  // Lint mode still loads what `typecheck` includes, which by default is
  // every TypeScript file under the root.
  typecheck: { include: [] },
});
