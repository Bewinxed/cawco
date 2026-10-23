/**
 * `bun run lint`, and `bun run lint:changed`, the name the landing gate and
 * the pre-push hook run it by: every lint check of the repository, over the
 * whole tree, at once (lib/checks.ts: each in its own process, each with a
 * time limit, what each printed whole when it ends).
 *
 * Two write what the others read, so they run first, one after the other:
 * the house faces (src/house-faces/faces.css, which app.css imports), then
 * one `svelte-kit sync` (the dashboard's generated tsconfig and each route's
 * `$types`, which the switch check reads; each sync rewrites them with a
 * plain write, so two at once can read each other's half-written file).
 */
import { join } from "node:path";
import { type Check, runChecks } from "./lib/checks";

const ROOT = join(import.meta.dir, "..");
const DASHBOARD = join(ROOT, "apps", "dashboard");
const BUN = process.execPath;
const FACES = "house faces";
const SYNC = "svelte-kit sync";

/** `bun <script> …args`, from the root, after the sync. */
const bun = (script: string, ...args: string[]): Check => ({
  name: [script, ...args].join(" "),
  dir: ROOT,
  argv: [BUN, script, ...args],
  after: SYNC,
});
const inDashboard = (check: Check): Check => ({
  ...check,
  name: `apps/dashboard ${check.name}`,
  dir: DASHBOARD,
});

const checks: Check[] = [
  {
    name: FACES,
    dir: ROOT,
    argv: [BUN, "apps/dashboard/scripts/house-faces.ts"],
  },
  {
    name: SYNC,
    dir: DASHBOARD,
    argv: [join(DASHBOARD, "node_modules/.bin/svelte-kit"), "sync"],
    after: FACES,
  },
  // The longest first, so they never wait for a free slot.
  bun("scripts/switch-check.ts"),
  // The design system's rules over the dashboard's markup and scripts
  // (eslint.config.mjs); eight threads read it in 9 s where one takes 22.
  inDashboard({
    name: "eslint src",
    dir: ROOT,
    argv: [
      join(DASHBOARD, "node_modules/.bin/eslint"),
      "--concurrency",
      "8",
      "src",
    ],
    after: SYNC,
  }),
  {
    name: "ultracite check",
    dir: ROOT,
    argv: [join(ROOT, "node_modules/.bin/ultracite"), "check"],
    after: SYNC,
  },
  bun("scripts/case-clash-check.ts"),
  bun("scripts/css-scope-check.ts"),
  bun("scripts/runtime-bundles-check.ts"),
  bun("apps/dashboard/scripts/mark-line-check.ts"),
  bun("apps/dashboard/scripts/specificity-trap.ts"),
  bun("apps/dashboard/scripts/lib-import-check.ts"),
  bun("packages/hub/scripts/skills-check.ts"),
  {
    name: "packages/core faces:check",
    dir: join(ROOT, "packages", "core"),
    argv: [BUN, "run", "faces:check"],
    after: SYNC,
  },
  bun("apps/dashboard/scripts/svelte-unused-css.ts"),
  bun("apps/dashboard/scripts/spacing-ratchet.ts"),
  inDashboard(bun("scripts/build-tokens.ts", "--check")),
  inDashboard(bun("scripts/build-variants.ts", "--check")),
  bun("scripts/fmt.ts", "--check"),
  bun("scripts/style-residual-check.ts"),
  bun("scripts/relics-check.ts"),
  bun("scripts/style-greps.ts"),
  bun("scripts/tool-answer-check.ts"),
  bun("scripts/icon-imports-check.ts"),
  bun("scripts/border-width-check.ts"),
  bun("scripts/token-contrast-check.ts"),
  bun("scripts/page-imports-check.ts"),
  bun("scripts/probe-words-check.ts"),
  bun("scripts/design-rules.ts", "--check"),
  // Every module a TypeScript project resolves lies inside the checkout.
  bun("scripts/resolution-check.ts"),
];

await runChecks("lint", checks);
