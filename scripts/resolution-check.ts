/**
 * Every module a TypeScript project in this repository resolves comes from
 * inside the checkout: its own files, or the packages its install linked. So
 * `bun run check` gives the same answer on any machine, whatever sits in
 * a `node_modules` above the checkout.
 *
 * TypeScript looks a bare import up in each ancestor folder's `node_modules`,
 * past the repository's root and on to `/`. An import nothing in the checkout
 * answers (a package the importing workspace never declared, or a store
 * package's own undeclared import) is answered by whatever an ancestor holds:
 * on the owner's Mac `~/node_modules`, where svelte 4's ambient
 * `declare module 'svelte/compiler'` once replaced svelte 5's types.
 *
 * The answer is tsconfig.paths.json, which every project extends: it maps
 * each such name to the copy the root package.json declares, from either
 * store layout.
 *
 * For each tracked `tsconfig*.json` (but the shared base and paths, which
 * include nothing) this runs `golar tsc --listFilesOnly --traceResolution`
 * (the TypeScript `bun run check` checks with, from the repository's root,
 * where its config is),
 * which builds the program without checking it, and reads every
 * "successfully resolved to '<path>'" line of the trace. A path outside the
 * checkout fails the check, named with the import and the file that made it.
 * Inside means under the root, or under a store entry the checkout's
 * `node_modules/.bun` links to: with bun's global virtual store a package
 * realpaths into `<cache>/links/` (bun.com/docs/pm/global-store:
 * "project/node_modules/.bun/react@18.3.1 -> ~/.bun/install/cache/links/…").
 *
 * The check proves itself first: a fixture made in the temp dir, a checkout
 * importing `leaky` that only a `node_modules` above it holds, must fail it
 * and name that path.
 *
 * `bun scripts/resolution-check.ts`, in `bun run check` after `svelte-kit
 * sync` (the dashboard's project extends the config the sync writes).
 */
import { realpathSync } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, sep } from "node:path";

const ROOT = await realpath(join(import.meta.dir, ".."));
const GOLAR = join(ROOT, "node_modules/.bin/golar");
/** Configs projects extend, which check nothing themselves. */
const SHARED = ["tsconfig.base.json", "tsconfig.paths.json"];

const HEADER =
  /^======== Resolving (?:module '(?<module>[^']+)' from|type reference directive '(?<type>[^']+)', containing file) '(?<from>[^']+)'/;
const RESOLVED = /successfully resolved to '(?<path>[^']+)'/;

interface Leak {
  from: string;
  path: string;
  project: string;
  specifier: string;
}

/** The folders a resolved path may lie in: the root, and each store entry it links. */
const insides = async (root: string): Promise<string[]> => {
  const store = join(root, "node_modules/.bun");
  const entries = await readdir(store).catch(() => []);
  const linked = await Promise.all(
    entries.map(async (name) => {
      const at = join(store, name);
      return (await lstat(at)).isSymbolicLink() ? realpath(at) : undefined;
    })
  );
  return [root, ...linked.filter((at) => at !== undefined)];
};

/**
 * Real folders, each looked up once. tsc names a project's own files by the
 * path it was started in, which may run through a symlink ($TMPDIR on macOS
 * is one), and a package's files by their real path.
 */
const realFolders = new Map<string, string>();
const real = (path: string): string => {
  const folder = dirname(path);
  let found = realFolders.get(folder);
  if (found === undefined) {
    found = realpathSync(folder);
    realFolders.set(folder, found);
  }
  return join(found, basename(path));
};

const within = (path: string, folders: string[]): boolean => {
  const at = real(path);
  return folders.some((folder) => at === folder || at.startsWith(folder + sep));
};

/** The imports `project` (a tsconfig under `root`) resolves outside `root`. */
const leaksOf = async (
  root: string,
  project: string,
  folders: string[]
): Promise<Leak[]> => {
  const child = Bun.spawn(
    [
      GOLAR,
      "tsc",
      "--project",
      join(root, project),
      "--listFilesOnly",
      "--traceResolution",
    ],
    {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  // A config others extend and which includes nothing itself
  // (packages/agent/tsconfig.browser.json) imports nothing.
  if (code !== 0 && out.includes("error TS18003: No inputs were found")) {
    return [];
  }
  if (code !== 0) {
    throw new Error(
      `golar tsc --project ${project} --listFilesOnly exited ${code}\n${err}${out
        .split("\n")
        .filter((line) => line.includes("error TS"))
        .join("\n")}`
    );
  }
  // Golar reads a project's `.svelte` components through svelte2tsx, so
  // their imports are in the same trace.
  return leaksIn(out.split("\n"), project, folders);
};

/** The leaks a resolution trace's `lines` show, crossings first. */
const leaksIn = (
  lines: string[],
  project: string,
  folders: string[]
): Leak[] => {
  const leaks = new Map<string, Leak>();
  let specifier = "";
  let from = "";
  for (const line of lines) {
    const header = HEADER.exec(line);
    if (header?.groups) {
      const { module, type, from: containing } = header.groups;
      specifier = module ?? `types:${type}`;
      from = containing;
      continue;
    }
    const path = RESOLVED.exec(line)?.groups?.path;
    const key = `${from}\0${specifier}`;
    if (path && !within(path, folders) && !leaks.has(key)) {
      leaks.set(key, { project, specifier, from, path });
    }
  }
  // The crossings: an import made inside the checkout that resolved outside
  // it. What the files outside import in turn follows from those.
  const all = [...leaks.values()];
  const crossings = all.filter((leak) => within(leak.from, folders));
  return crossings.length > 0 ? crossings : all;
};

const leaksUnder = async (
  root: string,
  projects: string[]
): Promise<Leak[]> => {
  const folders = await insides(root);
  return (
    await Promise.all(
      projects.map((project) => leaksOf(root, project, folders))
    )
  ).flat();
};

const describe = (root: string, leak: Leak): string =>
  `${leak.project}: ${relative(root, leak.from)} imports '${leak.specifier}', resolved outside the checkout to ${leak.path}`;

/** The fixture: `<tmp>/node_modules/leaky` above `<tmp>/checkout`, which imports it undeclared. */
const selfTest = async (): Promise<void> => {
  const dir = await realpath(
    await mkdtemp(join(tmpdir(), "resolution-check-"))
  );
  try {
    const checkout = join(dir, "checkout");
    await mkdir(join(checkout, "node_modules"), { recursive: true });
    // Golar's Svelte codegen loads the svelte a component's project resolves.
    await symlink(
      realpathSync(join(ROOT, "node_modules/svelte")),
      join(checkout, "node_modules/svelte")
    );
    // Bun.write makes the folders it writes into.
    await Promise.all(
      ["leaky", "leaky-component"].flatMap((name) => [
        Bun.write(
          join(dir, "node_modules", name, "package.json"),
          JSON.stringify({ name, version: "1.0.0", types: "index.d.ts" })
        ),
        Bun.write(
          join(dir, "node_modules", name, "index.d.ts"),
          "export declare const leaky: number;\n"
        ),
      ])
    );
    await Bun.write(
      join(checkout, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "bundler",
          noEmit: true,
          types: [],
        },
        include: ["*"],
      })
    );
    await Bun.write(
      join(checkout, "index.ts"),
      'export { leaky } from "leaky";\n'
    );
    await Bun.write(
      join(checkout, "App.svelte"),
      '<script lang="ts">\n  import { leaky } from "leaky-component";\n</script>\n\n<p>{leaky}</p>\n'
    );
    const found = await leaksUnder(checkout, ["tsconfig.json"]);
    for (const name of ["leaky", "leaky-component"]) {
      const expected = join(dir, "node_modules", name, "index.d.ts");
      if (!found.some((leak) => leak.path === expected)) {
        console.error(
          `resolution-check: its fixture, which imports ${expected} from above its checkout, passed; the check no longer sees a leak`
        );
        process.exit(1);
      }
    }
    for (const leak of found) {
      console.log(`fixture (fails, as it must): ${describe(checkout, leak)}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

await selfTest();

const tracked = (
  await Bun.$`git -C ${ROOT} ls-files -- tsconfig*.json **/tsconfig*.json`.text()
)
  .split("\n")
  .filter((path) => path && !SHARED.some((shared) => path.endsWith(shared)));
const outside = await leaksUnder(ROOT, tracked);
for (const leak of outside) {
  console.error(describe(ROOT, leak));
}
if (outside.length > 0) {
  console.error(
    `resolution-check: ${outside.length} module(s) resolved outside the checkout; declare each in the root package.json and map it in tsconfig.paths.json`
  );
  process.exit(1);
}
console.log(
  `resolution-check: ${tracked.length} TypeScript projects resolve every module inside the checkout`
);
