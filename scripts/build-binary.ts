// biome-ignore-all lint/performance/useTopLevelRegex: these loader filters register once per serial build, never on a request path.
// biome-ignore-all lint/performance/noAwaitInLoops: filesystem walks and compiler stages are deliberately serialized to bound memory.
import { existsSync, readFileSync } from "node:fs";
import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { buildStageHost } from "../packages/agent/src/stage-host/build";
import { agentReact } from "../packages/core/src/agent-react";
import { bundled } from "../packages/core/src/bundled";
import { canvasHostAssets } from "../packages/core/src/canvas-host";
import { decisionHostAssets } from "../packages/core/src/decision-host";
import { bundleOverlay } from "../packages/core/src/preview-proxy";
import { publishedFile } from "../packages/core/src/runtime";

export const PINNED_BUN = "1.4.3";
export const TARGETS = [
  "linux-x64",
  "linux-arm64",
  "darwin-arm64",
  "darwin-x64",
] as const;
const ROOT = resolve(import.meta.dir, "..");
const requireAgent = createRequire(join(ROOT, "packages/agent/package.json"));
const requireCore = createRequire(join(ROOT, "packages/core/package.json"));

/**
 * The packages that read files beside themselves at run time, by import
 * specifier, each with the runtime tree the binary publishes it as (core
 * runtime.ts `RUNTIME_TREES`): playwright-core its browsers.json, package.json
 * and webp wasm from `__dirname`, photon-node its `photon_rs_bg.wasm`.
 */
const PUBLISHED_PACKAGES: Record<string, string> = {
  "playwright-core": "playwright-core",
  "@silvia-odwyer/photon-node": "photon-node",
};
const PUBLISHED_PACKAGE = /^(?:playwright-core|@silvia-odwyer\/photon-node)$/;

export function packageDir(
  name: string,
  require: ReturnType<typeof createRequire>
): string {
  const from = require.resolve.paths(name)?.[0];
  if (!from) {
    throw new Error(`No resolution context for ${name}`);
  }
  let path = dirname(Bun.resolveSync(name, dirname(from)));
  while (path !== dirname(path)) {
    const manifest = join(path, "package.json");
    if (existsSync(manifest)) {
      const actual = JSON.parse(readFileSync(manifest, "utf8")).name;
      if (actual === name) {
        return path;
      }
    }
    path = dirname(path);
  }
  throw new Error(`Cannot locate package ${name}`);
}

async function run(argv: string[]) {
  const child = Bun.spawn(argv, {
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await child.exited) !== 0) {
    throw new Error(`Build command failed: ${argv.join(" ")}`);
  }
}
async function filesUnder(
  dir: string,
  prefix: string
): Promise<[string, string][]> {
  const files: [string, string][] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const key = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await filesUnder(path, key)));
    } else if (entry.isFile()) {
      files.push([key, path]);
    }
  }
  return files;
}
/** Builds one target at a time; release.ts owns locking, gates, signing and archives. */
export async function buildBinary(options: {
  target: string;
  outfile: string;
  version: string;
  commit: string;
  proof?: boolean;
  prepare?: boolean;
  /** Link the credential-free stub harnesses into the real entry point; for proofs only. */
  stubHarness?: boolean;
  testPublicKey?: string;
}) {
  if (Bun.version !== PINNED_BUN) {
    throw new Error(
      `Release builds require Bun ${PINNED_BUN}, got ${Bun.version}`
    );
  }
  if (!TARGETS.includes(options.target as (typeof TARGETS)[number])) {
    throw new Error(`Unsupported target ${options.target}`);
  }
  const work = join(ROOT, ".context/binary-build");
  await mkdir(work, { recursive: true });
  if (options.prepare !== false) {
    await run([
      process.execPath,
      "run",
      "--filter",
      "@cawco/dashboard",
      "build",
    ]);
    await writeFile(join(work, "overlay.js"), await bundleOverlay());
  }
  const pi = packageDir("@earendil-works/pi-coding-agent", requireAgent);
  const requirePi = createRequire(join(pi, "package.json"));
  const photon = packageDir("@silvia-odwyer/photon-node", requirePi);
  const zod = packageDir("zod", requireCore);
  // The lib files beside the compiler the binary bundles, wherever its
  // package keeps them: `typescript` is the @typescript/typescript6 shim,
  // whose own lib/ holds no lib.*.d.ts (it re-exports @typescript/old).
  const typescriptLib = dirname(
    (
      requireCore("typescript") as typeof import("typescript")
    ).getDefaultLibFilePath({})
  );
  if (!existsSync(join(typescriptLib, "lib.es5.d.ts"))) {
    throw new Error(
      `No TypeScript lib files in ${typescriptLib}: workflow programs would typecheck without the standard library`
    );
  }
  const zodBundle = await bundled("Workflow zod", {
    entrypoints: [join(zod, "index.js")],
    target: "bun",
    format: "esm",
    minify: true,
  });
  await writeFile(
    join(work, "zod-runtime.js"),
    await zodBundle.outputs[0].text()
  );
  await writeFile(
    join(work, "zod-package.json"),
    JSON.stringify({
      name: "zod",
      version: "4.6.5",
      type: "module",
      main: "./index.js",
      types: "./index.d.ts",
      exports: { ".": { types: "./index.d.ts", default: "./index.js" } },
    })
  );
  for (const name of [
    "workflow-globals.d.ts",
    "workflow-program.ts",
    "workflow.ts",
  ]) {
    await writeFile(
      join(work, name),
      await Bun.file(join(ROOT, "packages/core/src", name)).bytes()
    );
  }
  // Embedded from a copy, as the workflow files are: log-relay.ts imports the
  // source as a module, and a file the bundle also imports `with { type:
  // "file" }` is a file to every importer, so its named exports vanish.
  await writeFile(
    join(work, "boundary-log-protocol.ts"),
    await Bun.file(
      join(ROOT, "packages/agent/src/boundary-log-protocol.ts")
    ).bytes()
  );
  // The same for the workspace judge: core and pi import it as a module, and
  // each workspace's hook and OpenCode's plugin run its copy.
  await writeFile(
    join(work, "workspace-judge.ts"),
    await Bun.file(join(ROOT, "packages/core/src/workspace-judge.ts")).bytes()
  );
  // A Linux workspace's boundary host, srt inside, run as plain Bun by sessiond
  // (boundary.ts), and the ripgrep srt scans a clone with: a fresh machine has
  // none (REPORT.md §1). macOS boundaries run on Seatbelt and need neither.
  const linuxTarget = options.target.startsWith("linux-");
  if (linuxTarget) {
    const host = await bundled("The boundary host", {
      entrypoints: [join(ROOT, "packages/agent/src/boundary-host.ts")],
      target: "bun",
      format: "esm",
      minify: true,
    });
    await writeFile(join(work, "srt-host.js"), await host.outputs[0].text());
  }
  // A workspace's stage (live components): run by the project's own node or
  // bun inside the workspace's boundary, never by cawco (agent stage.ts).
  await writeFile(join(work, "stage-host.mjs"), await buildStageHost());
  // The dashboard's server (adapter-node's `build/handler.js`), one file with
  // its dependencies, published beside its client tree and imported from
  // there (apps/dashboard serve.js): adapter-node's `dir` is the directory of
  // its own module, `dirname(fileURLToPath(import.meta.url))`, which a bundle
  // keeps for run time, so it names the published `dashboard/` tree.
  const dashboardServer = await bundled("The dashboard's server", {
    entrypoints: [join(ROOT, "apps/dashboard/build/handler.js")],
    target: "bun",
    format: "esm",
    minify: true,
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [agentReact],
  });
  if (dashboardServer.outputs.length !== 1) {
    throw new Error(
      `The dashboard's server bundled to ${dashboardServer.outputs.length} files, not one`
    );
  }
  await writeFile(
    join(work, "dashboard-handler.js"),
    await dashboardServer.outputs[0].text()
  );
  const ripgrep = packageDir("@vscode/ripgrep-universal", requireAgent);
  const playwright = packageDir("playwright-core", requireAgent);
  const assets = [
    ...(linuxTarget
      ? [
          ["srt/host.js", join(work, "srt-host.js")],
          ["srt/rg", join(ripgrep, "bin", options.target, "rg")],
        ]
      : []),
    ...(await filesUnder(join(ROOT, "packages/hub/drizzle"), "drizzle")),
    ...(await filesUnder(join(ROOT, "packages/hub/skills"), "skills")),
    ...(await filesUnder(
      join(ROOT, "apps/dashboard/build/client"),
      "dashboard/client"
    )),
    ["dashboard/handler.js", join(work, "dashboard-handler.js")],
    ...(await filesUnder(typescriptLib, "workflow/lib")).filter(([name]) =>
      name.endsWith(".d.ts")
    ),
    ...(await filesUnder(zod, "workflow/node_modules/zod")).filter(([name]) =>
      name.endsWith(".d.ts")
    ),
    ["workflow/node_modules/zod/index.js", join(work, "zod-runtime.js")],
    ["workflow/node_modules/zod/package.json", join(work, "zod-package.json")],
    ...(
      await filesUnder(join(pi, "dist/modes/interactive/theme"), "pi/theme")
    ).filter(([name]) => name.endsWith(".json")),
    ...(
      await filesUnder(join(pi, "dist/core/export-html"), "pi/export-html")
    ).filter(
      ([name]) =>
        name.includes("/vendor/") || /template\.(html|css|js)$/.test(name)
    ),
    ["pi/package.json", join(pi, "package.json")],
    ["workflow/workflow-globals.d.ts", join(work, "workflow-globals.d.ts")],
    ["workflow/workflow-program.ts", join(work, "workflow-program.ts")],
    ["workflow/workflow.ts", join(work, "workflow.ts")],
    ["preview/overlay.js", join(work, "overlay.js")],
    ["stage/host.mjs", join(work, "stage-host.mjs")],
    // A canvas's host page, its bundle and Excalidraw's fonts (core canvas-host.ts).
    ...(await canvasHostAssets(join(work, "canvas"), filesUnder)),
    // A decision page's host bundle and DialKit (core decision-host.ts).
    ...(await decisionHostAssets(join(work, "decision"), filesUnder)),
    // Run as plain Bun as each workspace's judge, never as cawco (boundary.ts).
    ["boundary/judge.ts", join(ROOT, "packages/agent/src/boundary-judge.ts")],
    // Run as plain Bun by a macOS workspace's `log` shim (boundary.ts).
    ["boundary/log.ts", join(ROOT, "packages/agent/src/boundary-log.ts")],
    ["boundary/log-protocol.ts", join(work, "boundary-log-protocol.ts")],
    // Run as plain Bun beside the judge, and imported by OpenCode's plugin (boundary.ts).
    ["boundary/workspace-judge.ts", join(work, "workspace-judge.ts")],
    // A project's browser image's build context, sent to the machine's
    // container runtime as it is (agent browser/image.ts).
    ...(await filesUnder(join(ROOT, "packages/agent/browser"), "browser")),
    // The packages the binary loads from their own published trees
    // (PUBLISHED_PACKAGES, core published-package.ts), each whole.
    ...(await filesUnder(playwright, "playwright-core")),
    ...(await filesUnder(photon, "photon-node")),
  ] as [string, string][];
  // Each published file's content hash, the manifest a start compares with
  // its runtime folder's marker instead of reading the files (core runtime.ts).
  const publishedHashes: Record<string, string> = {};
  for (const [key, path] of assets) {
    if (publishedFile(key)) {
      publishedHashes[key] = Bun.hash(await Bun.file(path).bytes()).toString(
        36
      );
    }
  }
  const assetsSource = `${assets.map(([, path], i) => `import a${i} from ${JSON.stringify(path)} with { type: "file" };`).join("\n")}\nexport const binaryAssets = {${assets.map(([key], i) => `${JSON.stringify(key)}:a${i}`).join(",")}};\nexport const publishedHashes = ${JSON.stringify(publishedHashes)};`;
  // The binary's root: Bun names each embedded entry and asset by its path
  // below it, and the code inside finds them by those names. Each entry is a
  // module of one import. Ours keep the names the code spawns them by
  // (./scripts/binary/*-worker.js); pi's take the names pi's own Bun binary
  // gives them, which its code spawns (config.js
  // `resolveCodemodeWorkerSpecifier`: "./src/extensions/codemode/worker.ts";
  // image-resize.js `resizeImage`: "./src/utils/image-resize-worker.ts").
  // pi-tui's native helper sits where its `getNativeModuleCandidates` looks
  // beside the module that loads it (native-module-path.js
  // `join(moduleDir, nativePath)`): /$bunfs/root/native/….
  const root = join(work, "root");
  await rm(root, { recursive: true, force: true });
  const entries: [string, string][] = [
    [
      "cawco.ts",
      join(
        ROOT,
        options.proof
          ? "scripts/binary/proof-entry.ts"
          : "scripts/binary/entry.ts"
      ),
    ],
    ...[
      "workflow-worker.ts",
      "transcript-worker.ts",
      "process-table-worker.ts",
    ].map((name): [string, string] => [
      `scripts/binary/${name}`,
      join(ROOT, "scripts/binary", name),
    ]),
    [
      "src/utils/image-resize-worker.ts",
      join(pi, "dist/utils/image-resize-worker.js"),
    ],
    [
      "src/extensions/codemode/worker.ts",
      join(pi, "dist/extensions/codemode/worker.js"),
    ],
  ];
  for (const [name, module] of entries) {
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), `import ${JSON.stringify(module)};\n`);
  }
  const [platform, arch] = options.target.split("-");
  const tui = packageDir("@earendil-works/pi-tui", requirePi);
  const prebuilds = `native/${platform}/prebuilds/${platform}-${arch}`;
  await cp(join(tui, prebuilds), join(root, prebuilds), { recursive: true });
  await bundled("The standalone binary", {
    entrypoints: entries.map(([name]) => join(root, name)),
    root,
    compile: {
      target: `bun-${options.target}` as Bun.Build.CompileTarget,
      outfile: options.outfile,
      assets: [join(root, "native")],
      autoloadDotenv: false,
      autoloadBunfig: false,
    },
    minify: true,
    // cpu-features: an optional native addon of ssh2 (dockerode's
    // docker-modem loads it), built by no install here; ssh2 requires it
    // inside a try and goes on without it, and the browser runtime speaks to
    // unix sockets alone, never SSH. lightningcss and browserslist: the
    // runtime pages' CSS compiler (core page-css.ts), which loads them on a
    // compile only; the binary carries every page prebuilt and compiles none.
    // postcss, @tailwindcss/postcss and unplugin-icons: the decision host's
    // Tailwind compile and its icons (core decision-host.ts), loaded the same
    // way; the binary carries the host prebuilt and never builds it.
    // fontkit, subset-font and woff2-encoder: what cuts the house faces into
    // their woff2 pieces (core house-faces.ts), loaded the same way; the
    // binary carries the decision host's and the stage host's pieces
    // prebuilt.
    external: [
      "cpu-features",
      "lightningcss",
      "browserslist",
      "postcss",
      "@tailwindcss/postcss",
      "unplugin-icons",
      "fontkit",
      "subset-font",
      "woff2-encoder",
    ],
    define: {
      __CAWCO_RELEASE__: "true",
      __CAWCO_VERSION__: JSON.stringify(options.version),
      __CAWCO_COMMIT__: JSON.stringify(options.commit),
      "process.env.NODE_ENV": '"production"',
    },
    plugins: [
      agentReact,
      {
        name: "owned-runtime-resources",
        setup(build) {
          if (options.testPublicKey) {
            build.onLoad(
              { filter: /packages\/core\/src\/release-key\.ts$/ },
              () => ({
                contents: `export const RELEASE_PUBLIC_KEY=${JSON.stringify(options.testPublicKey)};`,
                loader: "ts",
              })
            );
          }
          build.onResolve({ filter: /^cawco:pi-runtime$/ }, () => ({
            path: join(ROOT, "packages/agent/src/standalone-setup.ts"),
          }));
          build.onResolve({ filter: /^cawco:pi-config$/ }, () => ({
            path: join(pi, "dist/config.js"),
          }));
          build.onResolve({ filter: /^cawco:quickjs$/ }, () => ({
            path: requirePi.resolve("quickjs-wasi/quickjs.wasm"),
          }));
          build.onLoad(
            { filter: /packages\/core\/src\/binary-assets\.ts$/ },
            () => ({ contents: assetsSource, loader: "ts", resolveDir: ROOT })
          );
          // A package that reads files beside itself is never bundled, whose
          // __dirname the bundle would fix at this machine's node_modules:
          // every import of it is core published-package.ts loading the
          // tree the binary publishes.
          build.onResolve({ filter: PUBLISHED_PACKAGE }, ({ path }) => ({
            path,
            namespace: "published-package",
          }));
          build.onLoad(
            { filter: /.*/, namespace: "published-package" },
            ({ path }) => ({
              contents: `module.exports=require(${JSON.stringify(join(ROOT, "packages/core/src/published-package.ts"))}).publishedPackage(${JSON.stringify(PUBLISHED_PACKAGES[path])});`,
              loader: "js",
            })
          );
          // @achingbrain/ssdp (nat-port-mapper's) reads its name and version
          // through createRequire(import.meta.url), which the bundle leaves to
          // run time against /$bunfs (oven-sh/bun#36565): fix them at build.
          build.onLoad(
            { filter: /@achingbrain\/ssdp\/dist\/src\/ssdp\.js$/ },
            async ({ path }) => {
              const source = await Bun.file(path).text();
              const read =
                "const { name, version } = req('../../package.json');";
              if (!source.includes(read)) {
                throw new Error(
                  `${path} no longer reads its manifest as expected`
                );
              }
              const { name, version } = JSON.parse(
                readFileSync(join(dirname(path), "../../package.json"), "utf8")
              );
              return {
                contents: source.replace(
                  read,
                  `const { name, version } = ${JSON.stringify({ name, version })};`
                ),
                loader: "js",
                resolveDir: dirname(path),
              };
            }
          );
          build.onResolve({ filter: /^socket-activation$/ }, () => ({
            path: join(ROOT, "scripts/binary/socket-activation.ts"),
          }));
          if (options.stubHarness) {
            // The stage 2 proof's builds run the update's timed steps at the
            // pace its machines set (scripts/binary/proof-clock.ts).
            build.onLoad({ filter: /packages\/core\/src\/clock\.ts$/ }, () => ({
              contents: readFileSync(
                join(ROOT, "scripts/binary/proof-clock.ts"),
                "utf8"
              ),
              loader: "ts",
            }));
            // And answer a retiring keeper's `list` as late as they set
            // (scripts/binary/proof-list-pace.ts).
            build.onLoad(
              { filter: /packages\/sessiond\/src\/list-pace\.ts$/ },
              () => ({
                contents: `export * from ${JSON.stringify(join(ROOT, "scripts/binary/proof-list-pace.ts"))};`,
                loader: "ts",
              })
            );
          }
          if (options.proof) {
            // proof-runtime.ts `proof-pi` calls pi's and pi-tui's own
            // exports, which the scripts package does not declare.
            build.onResolve({ filter: /^cawco:proof-pi$/ }, () => ({
              path: join(pi, "dist/index.js"),
            }));
            build.onResolve({ filter: /^cawco:proof-pi-tui$/ }, () => ({
              path: join(tui, "dist/index.js"),
            }));
          }
          if (options.proof || options.stubHarness) {
            build.onLoad(
              { filter: /packages\/agent\/src\/harnesses\/index\.ts$/ },
              async () => ({
                // Its imports are relative to scripts/binary, not to the file it replaces.
                contents: (
                  await Bun.file(
                    join(ROOT, "scripts/binary/proof-harnesses.ts")
                  ).text()
                ).replaceAll('"../../packages/', `"${ROOT}/packages/`),
                loader: "ts",
              })
            );
          }
        },
      },
    ],
  });
  console.log(
    `${options.target}: ${options.outfile} (${(await stat(options.outfile)).size} bytes)`
  );
}

if (import.meta.main) {
  const [
    target = "linux-x64",
    outfile = join(ROOT, ".context/binary-build/cawco"),
    version = "0.1.0-dev",
    commit = "dev",
  ] = Bun.argv.slice(2);
  await buildBinary({
    target,
    outfile,
    version,
    commit,
    proof: Bun.argv.includes("--proof"),
    prepare: !Bun.argv.includes("--skip-prepare"),
  });
}
