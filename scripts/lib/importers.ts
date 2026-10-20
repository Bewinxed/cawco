/**
 * The files a change can reach through imports, for a check whose verdict on
 * a file reads the types of what it imports (states-lint.ts's
 * switch-exhaustiveness-check: a member added to a union in one file leaves a
 * switch in another unhandled).
 *
 * The graph is every import a file names, type-only ones and `import()`
 * included (`ts.preProcessFile`), resolved as TypeScript resolves it for that
 * file: its nearest tsconfig's options (`paths`, `rootDirs`, package
 * `exports` and `imports`, workspace packages through their real path), so a
 * route's `./$types` reaches the generated declarations and through them its
 * `+page.ts` ({@link importsOf}). A Svelte file is the text of its `<script>` blocks; a `.svelte`
 * specifier, which TypeScript does not resolve, is taken relative or under
 * `#lib/`. Files under node_modules are not followed.
 *
 * What reaches files without an import makes the answer "all of them": a
 * manifest, the lockfile, a tsconfig, a declaration file, a module that
 * declares globals or augments a module, and the files listed in `WHOLE`.
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import ts from "typescript";

const ROOT = resolve(import.meta.dir, "..", "..");
const DASHBOARD = join(ROOT, "apps", "dashboard");
const LIB = join(DASHBOARD, "src", "lib");
const KIT_TYPES = join(DASHBOARD, ".svelte-kit", "types");
const PROXY = "proxy";
const SCRIPT = /<script\b[^>]*>([\s\S]*?)<\/script>/g;
/** A module whose declarations reach files that never import it. */
const AMBIENT = /\bdeclare\s+(global|module)\b/;
const CONFIG =
  /^(package\.json|bun\.lock|tsconfig[^/]*\.json|svelte\.config\.js)$/;
const DECLARATION = /\.d\.[cm]?ts$/;
const SCANNED = /\.(svelte|[cm]?[jt]sx?)$/;

const code = (file: string): string => {
  const text = readFileSync(file, "utf8");
  return file.endsWith(".svelte")
    ? [...text.matchAll(SCRIPT)].map((match) => match[1]).join("\n")
    : text;
};

interface Config {
  cache: ts.ModuleResolutionCache;
  options: ts.CompilerOptions;
}
const configs = new Map<string, Config>();
/** The compiler options of the tsconfig nearest `file`, with a resolution cache of their own. */
const configFor = (file: string): Config => {
  const path = ts.findConfigFile(dirname(file), ts.sys.fileExists) ?? "";
  let config = configs.get(path);
  if (!config) {
    const dir = dirname(path || ROOT);
    const { options } = ts.parseJsonConfigFileContent(
      path ? ts.readConfigFile(path, ts.sys.readFile).config : {},
      ts.sys,
      dir
    );
    config = {
      options,
      cache: ts.createModuleResolutionCache(dir, (name) => name, options),
    };
    configs.set(path, config);
  }
  return config;
};

/** The repository file `spec` names from `from`, or null. */
const resolveFrom = (from: string, spec: string): string | null => {
  const { options, cache } = configFor(from);
  let found = ts.resolveModuleName(spec, from, options, ts.sys, cache)
    .resolvedModule?.resolvedFileName;
  if (!found && spec.endsWith(".svelte")) {
    const base = spec.startsWith("#lib/")
      ? join(LIB, spec.slice("#lib/".length))
      : resolve(dirname(from), spec);
    found = existsSync(base) ? base : undefined;
  }
  return found?.startsWith(`${ROOT}/`) && !found.includes("/node_modules/")
    ? found
    : null;
};

/**
 * The repository files `file` imports. A route's generated `$types.d.ts`
 * reads its load function's types from `proxy+page.ts` (and the like), the
 * copy `svelte-kit sync` writes of the route's `+page.ts`, which imports
 * nothing of it: the copy stands for its route file.
 */
const importsOf = (file: string): string[] => {
  const named = ts.preProcessFile(code(file), true, true);
  const targets = [...named.importedFiles, ...named.referencedFiles]
    .map(({ fileName }) => resolveFrom(file, fileName))
    .filter((target) => target !== null);
  const name = basename(file);
  if (file.startsWith(`${KIT_TYPES}/`) && name.startsWith(PROXY)) {
    targets.push(
      join(
        DASHBOARD,
        dirname(file).slice(KIT_TYPES.length),
        name.slice(PROXY.length)
      )
    );
  }
  return targets;
};

/** Whether a change to `path` (from the root) reaches files without an import. */
const reachesAll = (path: string, whole: string[]): boolean => {
  if (
    whole.includes(path) ||
    CONFIG.test(basename(path)) ||
    DECLARATION.test(path)
  ) {
    return true;
  }
  const file = join(ROOT, path);
  return SCANNED.test(path) && existsSync(file) && AMBIENT.test(code(file));
};

/**
 * Of `files`, those that are in `changed` or import one of them, at any
 * depth; every one of `files` when a change reaches files without an import
 * (or is one of `whole`, the checker's own configuration). Paths are from
 * the repository's root.
 */
export const reachedBy = (
  changed: string[],
  files: string[],
  whole: string[]
): string[] => {
  if (changed.some((path) => reachesAll(path, whole))) {
    return files;
  }
  const importers = new Map<string, string[]>();
  const seen = new Set<string>();
  const queue = files.map((path) => join(ROOT, path));
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file) || !SCANNED.test(file) || !existsSync(file)) {
      continue;
    }
    seen.add(file);
    for (const target of importsOf(file)) {
      importers.set(target, [...(importers.get(target) ?? []), file]);
      queue.push(target);
    }
  }
  const reached = new Set(changed.map((path) => join(ROOT, path)));
  const walk = [...reached];
  while (walk.length > 0) {
    for (const importer of importers.get(walk.pop() as string) ?? []) {
      if (!reached.has(importer)) {
        reached.add(importer);
        walk.push(importer);
      }
    }
  }
  return files.filter((path) => reached.has(join(ROOT, path)));
};

/** The files that differ from the merge-base with origin/main, and the untracked ones git does not ignore, from the root. */
export const changedFiles = (): string[] => {
  const git = (...argv: string[]): string[] => {
    const run = Bun.spawnSync(["git", ...argv], { cwd: ROOT });
    if (run.exitCode !== 0) {
      throw new Error(`git ${argv.join(" ")}: ${run.stderr.toString().trim()}`);
    }
    return run.stdout.toString().split("\0").filter(Boolean);
  };
  const base = git("merge-base", "HEAD", "origin/main")[0]?.trim() ?? "";
  return [
    ...new Set([
      ...git("diff", "-z", "--name-only", base),
      ...git("ls-files", "-z", "-o", "--exclude-standard"),
    ]),
  ];
};
