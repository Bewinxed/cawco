/**
 * Golar (golar.dev): typescript-go, with svelte2tsx for `.svelte` files
 * (@golar/svelte), the compiler `bun run typecheck` checks with. Its one rule
 * is the switch check (scripts/lint/switch-exhaustiveness.ts), over every
 * `.ts`, `.svelte.ts` and `.svelte` file of the dashboard and the packages
 * that git tracks or would track, and over the fixture the lint proves the
 * rule by (scripts/lint.ts). Each file's types come from its nearest
 * tsconfig.json.
 *
 * `bun run lint` runs it under Node, `golar lint` from the repository's root:
 * Golar does not run under Bun (auvred/golar#31).
 */
import { execFileSync } from "node:child_process";
import "@golar/svelte";
import { defineConfig } from "golar/unstable";
import { switchExhaustiveness } from "./scripts/lint/switch-exhaustiveness.ts";

/** The switches the rule must report, outside the product's tree (scripts/lint.ts). */
const FIXTURES = "scripts/lint/fixtures/*.ts";

const tracked = execFileSync(
  "git",
  [
    "ls-files",
    "-co",
    "--exclude-standard",
    "--",
    // `:(glob)` so `**/` also matches no folder (a file right under `src/`).
    ":(glob)apps/dashboard/src/**/*.ts",
    ":(glob)apps/dashboard/src/**/*.svelte",
    ":(glob)packages/*/src/**/*.ts",
    ":(glob)packages/*/src/**/*.tsx",
  ],
  { encoding: "utf8" }
)
  .split("\n")
  .filter(Boolean);

/**
 * `path` as a glob that matches only itself: Golar reads its file list as
 * globs, and a route folder such as `(app)` is a glob group. The pattern is
 * tinyglobby's own escapePath for POSIX paths (Golar's globber).
 */
const literal = (path: string): string =>
  path.replace(
    /(?<!\\)([()[\]{}*?|]|^!|[!+@](?=\()|\\(?![()[\]{}!*+?@|]))/g,
    "\\$&"
  );

export default defineConfig({
  lint: {
    use: [
      {
        files: [...tracked.map(literal), FIXTURES],
        rules: [switchExhaustiveness],
      },
    ],
  },
  // Lint mode still loads what `typecheck` includes, which by default is
  // every TypeScript file under the root.
  typecheck: { include: [] },
});
