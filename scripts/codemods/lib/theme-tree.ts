// biome-ignore-all lint/performance/useTopLevelRegex: a one-shot codemod helper, run by hand, never on a hot path.
/**
 * The files a theme migration reads and rewrites, shared by theme-unify.ts
 * and theme-audit.ts: the scan roots of theme-prune.ts, with this
 * migration's own files, other projects' tokens and vendored files left out.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, repoFiles } from "../../lib/repo-files";

export const THEME = "apps/dashboard/src/lib/tokens/theme.css";
export const CONTRAST = "scripts/token-contrast-check.ts";
const SCAN = [
  "apps/dashboard/src",
  "apps/dashboard/scripts",
  ...readdirSync(join(ROOT, "packages"))
    .map((member) => `packages/${member}/src`)
    .filter((dir) => existsSync(join(ROOT, dir))),
  "packages/hub/skills",
  "site",
  "scripts",
];
/** Never renamed: this migration's own files, other projects' tokens, vendored files. */
const SKIP = (path: string) =>
  path === THEME ||
  path.startsWith("scripts/codemods/") ||
  path === "packages/design-tokens/src/design-tokens.ts" ||
  /(^|\/)dtcg-[^/]*$/u.test(path) ||
  /(^|\/)node_modules\//u.test(path);

export const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
export const write = (path: string, text: string) =>
  writeFileSync(join(ROOT, path), text);

/** Every text file of the scan roots, by path. */
export const loadTexts = () => {
  const texts = new Map<string, string>();
  for (const path of repoFiles(SCAN)) {
    if (SKIP(path)) {
      continue;
    }
    const text = read(path);
    if (!text.includes("\0")) {
      texts.set(path, text);
    }
  }
  return texts;
};

/** Runs the repository's formatter over the files. */
export const format = (files: string[]) => {
  const run = Bun.spawnSync(["bun", "scripts/fmt.ts", ...files], {
    cwd: ROOT,
    env: process.env,
    stderr: "inherit",
    stdout: "inherit",
  });
  if (run.exitCode !== 0) {
    process.exit(run.exitCode);
  }
};
