/**
 * Where an import specifier lands in this repository, read off the
 * workspace's own manifests as TypeScript and Bun read them: a relative
 * path, a `#name` through its package's `imports`, or `@cawco/<name>`
 * through that package's `exports` (its `main` when it has none). Shared by
 * check.ts's affected set and the import rules (import-rules-check.ts).
 */
import { readFileSync } from "node:fs";
import { basename, dirname, join, normalize } from "node:path";
import { ROOT } from "./repo-files";

type Entry = string | { types?: string; default?: string };
/** A workspace package: its name, folder, `exports`, `imports` and `main`. */
export interface Manifest {
  dir: string;
  exports?: Record<string, Entry>;
  imports?: Record<string, string>;
  main?: string;
  name: string;
}

/** An import of a file TypeScript reads: code, JSON, or a path with no extension. */
const TYPED_TARGET = /\.(?:[cm]?[jt]sx?|svelte|json)$/u;
const WORKSPACE_IMPORT = /^(@cawco\/[^/]+)(?:\/(.+))?$/u;

/** How many folders deep `dir` is (`.` is none). */
export const depth = (dir: string): number =>
  dir === "." ? 0 : dir.split("/").length;
/** Whether folder `dir` holds `path` (`.` holds everything). */
export const holds = (dir: string, path: string): boolean =>
  dir === "." || path === dir || path.startsWith(`${dir}/`);

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(join(ROOT, path), "utf8")) as T;

/** Each workspace package by name, the root's (`cawco`, folder `.`) among them. */
export const packages: ReadonlyMap<string, Manifest> = (() => {
  const root = readJson<Omit<Manifest, "dir"> & { workspaces: string[] }>(
    "package.json"
  );
  const found = new Map<string, Manifest>([[root.name, { ...root, dir: "." }]]);
  for (const pattern of root.workspaces) {
    for (const path of new Bun.Glob(`${pattern}/package.json`).scanSync({
      cwd: ROOT,
    })) {
      const pkg = readJson<Omit<Manifest, "dir">>(path);
      found.set(pkg.name, { ...pkg, dir: dirname(path) });
    }
  }
  return found;
})();

/** The package whose folder holds `file` most closely (the root's for a file of no other). */
export const packageOf = (file: string): Manifest =>
  [...packages.values()]
    .filter((pkg) => holds(pkg.dir, file))
    .sort((a, b) => depth(b.dir) - depth(a.dir))[0] as Manifest;

/** The path a `#name` import in `file` names, through its package's `imports`. */
const subpathImport = (file: string, specifier: string): string | undefined => {
  const holder = packageOf(file);
  for (const [key, path] of Object.entries(holder.imports ?? {})) {
    if (key === specifier) {
      return normalize(join(holder.dir, path));
    }
    const star = key.indexOf("*");
    if (
      star >= 0 &&
      specifier.startsWith(key.slice(0, star)) &&
      specifier.endsWith(key.slice(star + 1))
    ) {
      const matched = specifier.slice(
        star,
        specifier.length - (key.length - star - 1)
      );
      return normalize(join(holder.dir, path.replace("*", matched)));
    }
  }
};

/** The entry `exports` answers `sub` with, by its exact key or its longest-prefixed `*` pattern, as a resolver reads it. */
const exportedAt = (
  exports: Manifest["exports"],
  sub: string
): Entry | undefined => {
  if (!exports) {
    return;
  }
  const exact = exports[sub];
  if (exact !== undefined) {
    return exact;
  }
  const [pattern] = Object.keys(exports)
    .filter((key) => {
      const star = key.indexOf("*");
      return (
        star >= 0 &&
        sub.startsWith(key.slice(0, star)) &&
        sub.endsWith(key.slice(star + 1))
      );
    })
    .sort((a, b) => b.indexOf("*") - a.indexOf("*"));
  if (pattern === undefined) {
    return;
  }
  const star = pattern.indexOf("*");
  const matched = sub.slice(star, sub.length - (pattern.length - star - 1));
  const entry = exports[pattern] as string;
  return entry.replace("*", matched);
};

/**
 * The repository path `specifier` in `file` names, when TypeScript reads it:
 * as written, so it may lack its extension or name a `.ts` as `.js`
 * ({@link fileAt} finds the file).
 */
export const targetOf = (
  file: string,
  specifier: string
): string | undefined => {
  if (specifier.startsWith("#")) {
    return subpathImport(file, specifier);
  }
  if (specifier.startsWith(".")) {
    const path = normalize(join(dirname(file), specifier));
    const hasExtension = basename(path).includes(".");
    return !hasExtension || TYPED_TARGET.test(path) ? path : undefined;
  }
  const named = WORKSPACE_IMPORT.exec(specifier);
  const pkg = named ? packages.get(named[1] as string) : undefined;
  if (!(named && pkg)) {
    return;
  }
  const sub = named[2] ? `./${named[2]}` : ".";
  const entry = exportedAt(pkg.exports, sub);
  const path =
    typeof entry === "string"
      ? entry
      : (entry?.types ??
        entry?.default ??
        (sub === "." ? pkg.main : undefined));
  return path ? normalize(join(pkg.dir, path)) : pkg.dir;
};

/** The forms a module's file takes for an extensionless path its importer wrote. */
const FORMS = [
  "",
  ".ts",
  ".tsx",
  ".svelte.ts",
  ".svelte",
  ".js",
  ".mjs",
  ".json",
  "/index.ts",
  "/index.js",
  "/index.svelte.ts",
];
/** A script's specifier and the source it may name in its place (`x.js` for `x.ts`). */
const SOURCE_OF: [RegExp, string[]][] = [
  [/\.js$/u, [".js", ".ts", ".tsx"]],
  [/\.mjs$/u, [".mjs", ".mts"]],
  [/\.cjs$/u, [".cjs", ".cts"]],
];

/** The file of `present` that `path` (a {@link targetOf} answer) names. */
export const fileAt = (
  path: string,
  present: ReadonlySet<string>
): string | undefined => {
  const script = SOURCE_OF.find(([ending]) => ending.test(path));
  const candidates = script
    ? script[1].map((ending) => path.replace(script[0], ending))
    : FORMS.map((form) => path + form);
  return candidates.find((candidate) => present.has(candidate));
};
