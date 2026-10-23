/**
 * Every module a TypeScript project in this repository resolves comes from
 * inside the checkout: its own files, or the packages its install linked. So
 * `bun run typecheck` gives the same answer on any machine, whatever sits in
 * a `node_modules` above the checkout.
 *
 * TypeScript looks a bare import up in each ancestor folder's `node_modules`,
 * past the repository's root and on to `/`. An import nothing in the checkout
 * answers (a package the importing workspace never declared, or a store
 * package's own undeclared import) is answered by whatever an ancestor holds:
 * on the owner's Mac `~/node_modules`, where svelte 4's ambient
 * `declare module 'svelte/compiler'` once replaced svelte 5's types.
 *
 * For each tracked `tsconfig*.json` (but the shared base, which includes
 * nothing) this runs the repository's `tsc --listFilesOnly --traceResolution`,
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
 * `bun scripts/resolution-check.ts`, in `bun run lint` after `svelte-kit
 * sync` (the dashboard's project extends the config the sync writes).
 */
import { lstat, mkdir, mkdtemp, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";

const ROOT = await realpath(join(import.meta.dir, ".."));
const TSC = join(ROOT, "node_modules/.bin/tsc");
const BASE = "tsconfig.base.json";

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

const within = (path: string, folders: string[]): boolean =>
  folders.some((folder) => path === folder || path.startsWith(folder + sep));

/** The imports `project` (a tsconfig under `root`) resolves outside `root`. */
const leaksOf = async (
  root: string,
  project: string,
  folders: string[]
): Promise<Leak[]> => {
  const child = Bun.spawn(
    [TSC, "--project", project, "--listFilesOnly", "--traceResolution"],
    { cwd: root, stdout: "pipe", stderr: "pipe" }
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
      `tsc --project ${project} --listFilesOnly exited ${code}\n${err}${out
        .split("\n")
        .filter((line) => line.includes("error TS"))
        .join("\n")}`
    );
  }
  const leaks = new Map<string, Leak>();
  let specifier = "";
  let from = "";
  for (const line of out.split("\n")) {
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
    const leaky = join(dir, "node_modules/leaky");
    await mkdir(checkout, { recursive: true });
    await mkdir(leaky, { recursive: true });
    await Bun.write(
      join(leaky, "package.json"),
      JSON.stringify({ name: "leaky", version: "1.0.0", types: "index.d.ts" })
    );
    await Bun.write(
      join(leaky, "index.d.ts"),
      "export declare const leaky: number;\n"
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
        files: ["index.ts"],
      })
    );
    await Bun.write(
      join(checkout, "index.ts"),
      'export { leaky } from "leaky";\n'
    );
    const expected = join(leaky, "index.d.ts");
    const found = await leaksUnder(checkout, ["tsconfig.json"]);
    if (!found.some((leak) => leak.path === expected)) {
      console.error(
        `resolution-check: its fixture, which imports ${expected} from above its checkout, passed; the check no longer sees a leak`
      );
      process.exit(1);
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
  .filter((path) => path && !path.endsWith(BASE));
const outside = await leaksUnder(ROOT, tracked);
for (const leak of outside) {
  console.error(describe(ROOT, leak));
}
if (outside.length > 0) {
  console.error(
    `resolution-check: ${outside.length} module(s) resolved outside the checkout; declare each in the package that imports it`
  );
  process.exit(1);
}
console.log(
  `resolution-check: ${tracked.length} TypeScript projects resolve every module inside the checkout`
);
