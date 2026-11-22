/**
 * A design folder as the hub keeps it (core stage.ts `designOf`): the files
 * an agent gave as the design's `html` or `dir` (or each direction's), under
 * its artifact's folder (`ARTIFACTS_ROOT/<id>/design`, core `DESIGN_FOLDER`),
 * completed into a Vite project the hub machine's stage runs (agent
 * stage-design.ts): a package.json naming Vite, the plugins its code needs
 * and the content kit, and a Vite config naming those plugins, where the
 * agent gave none.
 *
 * A write replaces the design in place, so the stage's own HMR carries it to
 * the open panel: each file written only when its bytes changed (a file Vite
 * serves and nothing changed in reloads nothing), each file the new design
 * lacks deleted, and what the stage made itself (its install's
 * `node_modules` and lockfile) kept.
 *
 * The stage's boundary writes this folder too (its install, Vite's cache),
 * so nothing here follows a link in it: a folder on the way to a file that
 * is a link or a file is made a folder again, and each file is written in
 * place by an open that refuses a link ({@link writeInPlace}).
 */
import {
  closeSync,
  constants,
  lstatSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeSync,
} from "node:fs";
import { join, posix } from "node:path";
import { LOCKFILES } from "@cawco/core/deps";
import { makeFolderSync } from "@cawco/core/folders";
import { DESIGN_FOLDER, type DesignMoved } from "@cawco/core/stage";
import { designArtifactOf } from "@cawco/core/workspace-id";
import { z } from "zod";

/** One file of a design: its path from the design's folder, its bytes. */
export interface DesignFile {
  bytes: Uint8Array;
  path: string;
}

/**
 * The most a design folder holds of the agent's files, ours: a page and the
 * code, styles and pictures it loads, never a project's tree. Its
 * dependencies are its stage's install's.
 */
export const DESIGN_LIMITS = { bytes: 64 * 1024 * 1024, files: 4000 } as const;

/**
 * The latest release of Vite and of its framework plugins and their
 * frameworks, as npm published them (read 2026-11-22), each a caret range:
 * what a design's package.json names where it names none of them.
 */
const TOOLCHAIN = {
  vite: "^8.3.8",
  "@vitejs/plugin-react": "^6.3.0",
  "@sveltejs/vite-plugin-svelte": "^7.3.1",
  svelte: "^5.59.1",
  react: "^19.3.1",
  "react-dom": "^19.3.1",
} as const;

/**
 * The content kit (the owner's pin on graph-general-canvas#content,
 * 2026-11-22: "use a good set of known modern maintained libraries for each
 * common thing, fall back to browser or html"): one library for each common
 * kind of content, picked by its releases, its use and its licence, each its
 * latest release as npm published it (read 2026-11-22) as a caret range.
 * Every design's package.json names each where it names none, so a page
 * imports it by its bare name and Vite serves the package's own published
 * build from the stage's install: no CDN, nothing of ours in between. An
 * import map can't stand in for it: Vite resolves every bare import of a
 * module it serves itself, and refuses one it can't ("Failed to resolve
 * import"), whatever a page's import map says.
 */
const KIT = {
  /** Documents: Markdown to HTML. */
  marked: "^18.2.1",
  /** Charts. */
  "chart.js": "^4.6.1",
  /** Slide decks. */
  "reveal.js": "^6.0.2",
  /** Diagrams. */
  mermaid: "^12.3.0",
  /** Maths. */
  katex: "^0.19.1",
  /** Code, highlighted. */
  shiki: "^4.6.0",
} as const;

/** What the design's stage makes in its folder, kept across its writes: its install's, and the stage host the daemon writes (agent stage.ts `HOST_DIR`). */
const MADE: ReadonlySet<string> = new Set([
  "node_modules",
  ".cawco",
  ...LOCKFILES,
]);

/** What an agent's design may not carry: what an install makes, and a repository. */
const NOT_CARRIED = new Set(["node_modules", ".git", ".cawco"]);

/** A Vite config at the folder's root: the agent's own, which stands as it is. */
const VITE_CONFIG = /^vite\.config\.(?:ts|mts|js|mjs|cts|cjs)$/u;

/** The config the hub writes where the agent gave none. */
const OWN_CONFIG = "vite.config.mjs";

const JSX_FILE = /\.[jt]sx$/u;
const SVELTE_FILE = /\.svelte$/u;

/** The frameworks a JSX file may be written for: one named, React is not assumed. */
const JSX_FRAMEWORKS = ["react", "preact", "solid-js", "vue"];

const PackageSchema = z.looseObject({
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
});
type Package = z.infer<typeof PackageSchema>;

/** Where design tree `tree`'s files stand under artifacts root `root`: its first artifact's folder. */
export const designFolderOf = (root: string, tree: string): string =>
  join(root, designArtifactOf(tree), DESIGN_FOLDER);

/**
 * Why `files` can't be a design, one sentence the agent acts on; null when
 * they can: a page at each of `pages`, nothing an install makes, within
 * {@link DESIGN_LIMITS}.
 */
export function designFilesProblem(
  files: readonly DesignFile[],
  pages: readonly string[]
): string | null {
  const carried = files.find((one) =>
    one.path.split("/").some((part) => NOT_CARRIED.has(part))
  );
  if (carried) {
    return `${carried.path} is in an install's or a repository's folder: a design carries its pages and code, and its stage installs what its package.json names. Leave node_modules, .git and .cawco out of dir.`;
  }
  if (files.length > DESIGN_LIMITS.files) {
    return `A design holds at most ${DESIGN_LIMITS.files} files; this one has ${files.length}.`;
  }
  const bytes = files.reduce((sum, one) => sum + one.bytes.byteLength, 0);
  if (bytes > DESIGN_LIMITS.bytes) {
    return `A design holds at most ${DESIGN_LIMITS.bytes / 1024 / 1024} MiB; this one has ${Math.ceil(bytes / 1024 / 1024)} MiB.`;
  }
  const paths = new Set(files.map((one) => one.path));
  const missing = pages.find((page) => !paths.has(page));
  return missing
    ? `${missing} isn't there: the design graph opens each design at its index.html, so dir holds one at its top.`
    : null;
}

/** A package.json of the design's, read; refused in words when it isn't one. */
function packageOf(file: DesignFile): Package | string {
  try {
    return PackageSchema.parse(
      JSON.parse(new TextDecoder().decode(file.bytes))
    );
  } catch (error) {
    return `${file.path} doesn't read as a package.json (${error instanceof Error ? error.message : String(error)}).`;
  }
}

/**
 * The dependencies of every package.json of the design's, its root's first,
 * each direction's beside it; or why they can't be one install's, one
 * sentence.
 */
function dependenciesOf(
  manifests: readonly DesignFile[],
  root: Package
): { deps: Record<string, string>; dev: Record<string, string> } | string {
  const deps: Record<string, string> = { ...root.dependencies };
  const dev: Record<string, string> = { ...root.devDependencies };
  for (const manifest of manifests) {
    const read = packageOf(manifest);
    if (typeof read === "string") {
      return read;
    }
    const sections = [
      [read.dependencies, deps],
      [read.devDependencies, dev],
    ] as const;
    for (const [section, into] of sections) {
      for (const [name, range] of Object.entries(section ?? {})) {
        const named = deps[name] ?? dev[name];
        if (named !== undefined && named !== range) {
          return `${manifest.path} names ${name}@${range} and another of the design's package.json files names ${name}@${named}: a design installs one of each, so name the same range in both.`;
        }
        into[name] = range;
      }
    }
  }
  return { deps, dev };
}

/**
 * The plugins the design's code needs, by what it names and its files: the
 * Svelte plugin for Svelte, React's for React or a JSX file where no other
 * framework that writes JSX is named; each framework, Vite, each plugin and
 * each package of the {@link KIT}, added where the design names none.
 */
function withToolchain(
  deps: Record<string, string>,
  dev: Record<string, string>,
  paths: readonly string[]
): ("react" | "svelte")[] {
  const named = (name: string) => name in deps || name in dev;
  const plugins: ("react" | "svelte")[] = [];
  if (named("svelte") || paths.some((one) => SVELTE_FILE.test(one))) {
    plugins.push("svelte");
  }
  const jsx = paths.some((one) => JSX_FILE.test(one));
  const otherJsx = JSX_FRAMEWORKS.some((one) => one !== "react" && named(one));
  if (named("react") || (jsx && !otherJsx)) {
    plugins.push("react");
  }
  const needs: [keyof typeof TOOLCHAIN, "deps" | "dev"][] = [["vite", "dev"]];
  if (plugins.includes("svelte")) {
    needs.push(["svelte", "deps"], ["@sveltejs/vite-plugin-svelte", "dev"]);
  }
  if (plugins.includes("react")) {
    needs.push(
      ["react", "deps"],
      ["react-dom", "deps"],
      ["@vitejs/plugin-react", "dev"]
    );
  }
  for (const [name, section] of needs) {
    if (!named(name)) {
      (section === "deps" ? deps : dev)[name] = TOOLCHAIN[name];
    }
  }
  for (const [name, range] of Object.entries(KIT)) {
    if (!named(name)) {
      deps[name] = range;
    }
  }
  return plugins;
}

/**
 * The design's package.json at its root: its own (at its root) with every
 * direction's dependencies (each folder's package.json) beside its own, and
 * Vite, the plugins its code needs, their frameworks and the content kit
 * where it names none ({@link withToolchain}); or why it can't be, one
 * sentence.
 */
function rootPackage(
  files: readonly DesignFile[]
): { pkg: Package; plugins: ("react" | "svelte")[] } | string {
  const manifests = files.filter(
    (one) => posix.basename(one.path) === "package.json"
  );
  const own = manifests.find((one) => one.path === "package.json");
  const root = own ? packageOf(own) : {};
  if (typeof root === "string") {
    return root;
  }
  const merged = dependenciesOf(
    manifests.filter((one) => one !== own),
    root
  );
  if (typeof merged === "string") {
    return merged;
  }
  const { deps, dev } = merged;
  const plugins = withToolchain(
    deps,
    dev,
    files.map((one) => one.path)
  );
  return {
    pkg: {
      ...root,
      private: true,
      type: "module",
      dependencies: deps,
      devDependencies: dev,
    },
    plugins,
  };
}

/** The Vite config the hub writes for a design that gave none: Vite with the plugins its code needs. */
const ownConfig = (plugins: readonly ("react" | "svelte")[]): string =>
  `// CawCo wrote this for the design: Vite with the plugins its code needs.
import { defineConfig } from "vite";
${plugins.includes("react") ? 'import react from "@vitejs/plugin-react";\n' : ""}${plugins.includes("svelte") ? 'import { svelte } from "@sveltejs/vite-plugin-svelte";\n' : ""}
export default defineConfig({
  plugins: [${plugins.map((one) => (one === "react" ? "react()" : "svelte()")).join(", ")}],
});
`;

/**
 * The design's files whole: the agent's, its root package.json made
 * ({@link rootPackage}), and a Vite config where it gave none at its root;
 * or why they can't run, one sentence.
 */
export function designWhole(
  files: readonly DesignFile[]
): DesignFile[] | string {
  const made = rootPackage(files);
  if (typeof made === "string") {
    return made;
  }
  const encoder = new TextEncoder();
  const ownFiles = files.filter((one) => one.path !== "package.json");
  const config = ownFiles.some((one) => VITE_CONFIG.test(one.path))
    ? []
    : [{ path: OWN_CONFIG, bytes: encoder.encode(ownConfig(made.plugins)) }];
  return [
    ...ownFiles,
    {
      path: "package.json",
      bytes: encoder.encode(`${JSON.stringify(made.pkg, null, 2)}\n`),
    },
    ...config,
  ];
}

/** What stands at `path`, links not followed: a folder, a file, or something else (a link); none. */
const kindAt = (path: string): "dir" | "file" | "other" | null => {
  try {
    const stat = lstatSync(path);
    if (stat.isDirectory()) {
      return "dir";
    }
    return stat.isFile() ? "file" : "other";
  } catch {
    return null;
  }
};

/** `rel`'s folders under `folder` made, each a folder of its own: a link or file on the way taken out first. */
function foldersOf(folder: string, rel: string): void {
  let at = folder;
  for (const part of rel.split("/").slice(0, -1)) {
    at = join(at, part);
    const kind = kindAt(at);
    if (kind === "dir") {
      continue;
    }
    if (kind !== null) {
      rmSync(at, { force: true, recursive: false });
    }
    makeFolderSync(at, { exclusive: true });
  }
}

/**
 * `bytes` written at `path` in place, the file there kept (its inode): Vite's
 * watcher follows a file it watches by the file, and a file renamed over it
 * is a new one whose later changes it missed (its second edit reached no
 * page, 2026-11-22). A link at `path` is never written through: the open
 * refuses it (`O_NOFOLLOW`, open(2): "If the trailing component … of
 * pathname is a symbolic link, then the open fails"), and it is taken out
 * and the file made in its place.
 */
function writeInPlace(path: string, bytes: Uint8Array): void {
  // Four distinct bits: their sum is their mask.
  const flags =
    constants.O_WRONLY +
    constants.O_CREAT +
    constants.O_TRUNC +
    constants.O_NOFOLLOW;
  let fd: number;
  try {
    fd = openSync(path, flags, FILE_MODE);
  } catch (error) {
    if (!(
      error instanceof Error &&
      "code" in error &&
      error.code === "ELOOP"
    )) {
      throw error;
    }
    rmSync(path, { force: true });
    fd = openSync(path, flags, FILE_MODE);
  }
  try {
    writeSync(fd, bytes);
  } finally {
    closeSync(fd);
  }
}

/** A design file's mode: its stage's boundary and the hub's own process read it. */
const FILE_MODE = 0o644;

/** Whether the file at `path` (no link) holds `bytes` already. */
const holds = (path: string, bytes: Uint8Array): boolean =>
  kindAt(path) === "file" && Buffer.from(readFileSync(path)).equals(bytes);

/** Every path under `folder` (from it, `/`-separated), links and files alike, folders walked; what the stage made at its top left out. */
function standing(folder: string, rel = ""): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(folder, rel), { withFileTypes: true })) {
    const path = rel ? `${rel}/${entry.name}` : entry.name;
    if (!rel && MADE.has(entry.name)) {
      continue;
    }
    if (entry.isDirectory()) {
      found.push(...standing(folder, path));
    } else {
      found.push(path);
    }
  }
  return found;
}

/** The folders under `folder` that hold nothing now, deepest first, taken out; what the stage made at its top kept. */
function emptiedFolders(folder: string, rel = ""): void {
  for (const entry of readdirSync(join(folder, rel), { withFileTypes: true })) {
    if (!entry.isDirectory() || (!rel && MADE.has(entry.name))) {
      continue;
    }
    const path = rel ? `${rel}/${entry.name}` : entry.name;
    emptiedFolders(folder, path);
    if (readdirSync(join(folder, path)).length === 0) {
      rmSync(join(folder, path), { recursive: true, force: true });
    }
  }
}

/**
 * Design `files` (whole: {@link designWhole}) written into `folder` in
 * place: each changed file written over, each the design no longer has
 * deleted, what its stage made kept. Answers what it moved, each by its
 * path from the folder (core `DesignMoved`).
 */
export function writeDesignFolder(
  folder: string,
  files: readonly DesignFile[]
): DesignMoved {
  makeFolderSync(folder);
  const wanted = new Set(files.map((one) => one.path));
  const moved: DesignMoved = { added: [], changed: [], removed: [] };
  for (const path of standing(folder)) {
    if (!wanted.has(path)) {
      rmSync(join(folder, path), { force: true });
      moved.removed.push(path);
    }
  }
  emptiedFolders(folder);
  for (const file of files) {
    const path = join(folder, file.path);
    foldersOf(folder, file.path);
    const kind = kindAt(path);
    if (kind === "file" && holds(path, file.bytes)) {
      continue;
    }
    if (kind === "dir") {
      rmSync(path, { recursive: true, force: true });
    }
    writeInPlace(path, file.bytes);
    (kind === "file" ? moved.changed : moved.added).push(file.path);
  }
  return moved;
}
