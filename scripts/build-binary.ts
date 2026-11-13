// biome-ignore-all lint/performance/useTopLevelRegex: these loader filters register once per compile, never on a request path.
/**
 * The standalone binary, in two steps:
 *
 *   bun scripts/build-binary.ts prepare
 *       The assets every target embeds, built once: the dashboard (its Vite
 *       build), the preview overlay, the stage host,
 *       the dashboard's server, the canvas and decision hosts, a Linux
 *       target's boundary host. Left in `.context/binary-build/` with a record
 *       of them (`prepared.json`) that every compile reads.
 *   bun scripts/build-binary.ts TARGET OUTFILE VERSION COMMIT [--proof] [--skip-prepare]
 *       One target compiled from the prepared assets, in a root of its own,
 *       so any number of targets compile at once in one checkout. Without
 *       `--skip-prepare` it prepares first.
 *
 * release.ts runs `prepare` once and every compile (the proof build, stage
 * 2's three, the four release targets) at once beside it; build-e2e.ts and
 * the probe kit call the exports.
 */
import { existsSync, readFileSync } from "node:fs";
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { availableParallelism } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { buildStageHost } from "../packages/agent/src/stage-host/build";
import { bundled } from "../packages/core/src/bundled";
import { fileViewerAssets } from "../packages/core/src/file-viewer";
import { publishedFile } from "../packages/core/src/runtime";
import { agentReact } from "../packages/hub/src/agent-react";
import { canvasHostAssets } from "../packages/hub/src/canvas-host";
import { decisionHostAssets } from "../packages/hub/src/decision-host";
import { bundleOverlay } from "../packages/preview/src/proxy";
import { dashboardBuild } from "./dashboard-build-cache";

export const PINNED_BUN = "1.4.4";
export const TARGETS = [
  "linux-x64",
  "linux-arm64",
  "darwin-arm64",
  "darwin-x64",
] as const;
const ROOT = resolve(import.meta.dir, "..");
const requireAgent = createRequire(join(ROOT, "packages/agent/package.json"));
/** Where `prepare` leaves the assets every target shares, and each compile its own root. */
const WORK = join(ROOT, ".context/binary-build");
/** `prepare`'s record of what it left ({@link Prepared}). */
const PREPARED = join(WORK, "prepared.json");

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
const PUBLISHED_PACKAGE = /^(?:playwright-core|@silvia-odwyer\/photon-node)$/u;

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

async function run(argv: string[], env: Record<string, string> = {}) {
  const child = Bun.spawn(argv, {
    env: { ...process.env, ...env },
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await child.exited) !== 0) {
    throw new Error(`Build command failed: ${argv.join(" ")}`);
  }
}

/** Every regular file under `dir`, keyed by `prefix` and its path below `dir`. */
async function filesUnder(
  dir: string,
  prefix: string
): Promise<[string, string][]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry): [string, string] => {
      const path = join(entry.parentPath, entry.name);
      return [`${prefix}/${relative(dir, path)}`, path];
    });
}

const pinnedBun = (): void => {
  if (Bun.version !== PINNED_BUN) {
    throw new Error(
      `Release builds require Bun ${PINNED_BUN}, got ${Bun.version}`
    );
  }
};

/** pi's package, and the packages found through it. */
const piPackages = () => {
  const pi = packageDir("@earendil-works/pi-coding-agent", requireAgent);
  const requirePi = createRequire(join(pi, "package.json"));
  return {
    pi,
    requirePi,
    photon: packageDir("@silvia-odwyer/photon-node", requirePi),
    tui: packageDir("@earendil-works/pi-tui", requirePi),
  };
};

/**
 * What `prepare` leaves for every compile, each asset by the name the binary
 * finds it by and the file it is read from.
 */
interface Prepared {
  /** Each published file's content hash among them (core runtime.ts). */
  hashes: Record<string, string>;
  /** A Linux target's besides: its boundary host. */
  linux: [string, string][];
  /** Every target's. */
  shared: [string, string][];
}

/** A bundle's one output, written to `file`. */
const writeBundle = async (
  what: string,
  file: string,
  config: Bun.BuildConfig
): Promise<void> => {
  const output = await bundled(what, config);
  if (output.outputs.length !== 1) {
    throw new Error(
      `${what} bundled to ${output.outputs.length} files, not one`
    );
  }
  await writeFile(file, await output.outputs[0].text());
};

/**
 * The files {@link WORK} holds for the binary's assets beside the canvas's
 * and the decision page's: `copies` (name, source) copied in, and the bundles
 * built, all at once.
 */
const writeWorkFiles = async (copies: [string, string][]): Promise<void> => {
  await Promise.all([
    (async () => writeFile(join(WORK, "overlay.js"), await bundleOverlay()))(),
    ...copies.map(async ([name, source]) =>
      writeFile(join(WORK, name), await Bun.file(join(ROOT, source)).bytes())
    ),
    // A Linux workspace's boundary host, srt inside, run as plain Bun by
    // sessiond (boundary/); a Linux target embeds it with the ripgrep srt
    // scans a clone with: a fresh machine has none (REPORT.md §1). macOS
    // boundaries run on Seatbelt and need neither.
    writeBundle("The boundary host", join(WORK, "srt-host.js"), {
      entrypoints: [join(ROOT, "packages/agent/src/boundary-host.ts")],
      target: "bun",
      format: "esm",
      minify: true,
    }),
    // CawCo's OpenCode plugin, bundled with the parts of core it shares and
    // written into each server's plugin directory (agent harnesses/opencode-plugin.ts).
    writeBundle("The OpenCode plugin", join(WORK, "opencode-plugin.js"), {
      entrypoints: [
        join(ROOT, "packages/agent/src/harnesses/opencode-plugin-module.ts"),
      ],
      target: "bun",
      format: "esm",
    }),
    // A workspace's stage (live components): run by the project's own node or
    // bun inside the workspace's boundary, never by cawco (agent stage.ts).
    (async () =>
      writeFile(join(WORK, "stage-host.mjs"), await buildStageHost()))(),
  ]);
};

/**
 * The dashboard's server bundle: the one asset that reads the dashboard's
 * build, so it waits for it while the others are made.
 */
const writeDashboardHandler = async (): Promise<void> => {
  // The dashboard's server (adapter-node's `build/handler.js`), one file
  // with its dependencies, published beside its client tree and imported
  // from there (apps/dashboard serve.js): adapter-node's `dir` is the
  // directory of its own module, `dirname(fileURLToPath(import.meta.url))`,
  // which a bundle keeps for run time, so it names the published
  // `dashboard/` tree.
  await writeBundle(
    "The dashboard's server",
    join(WORK, "dashboard-handler.js"),
    {
      entrypoints: [join(ROOT, "apps/dashboard/build/handler.js")],
      target: "bun",
      format: "esm",
      minify: true,
      define: { "process.env.NODE_ENV": '"production"' },
      plugins: [agentReact],
    }
  );
};

/**
 * The assets every target embeds, built once into {@link WORK}, and their
 * record ({@link PREPARED}), written last and whole. `dashboard`: the
 * dashboard's Vite build first (what `--skip-prepare` callers did already).
 */
export async function prepareAssets(options: {
  dashboard: boolean;
}): Promise<void> {
  pinnedBun();
  await mkdir(WORK, { recursive: true });
  // The dashboard builds while the bundles that do not read its output are
  // made; only the dashboard's server bundle waits for it.
  const dashboard = options.dashboard
    ? dashboardBuild(ROOT, () =>
        run(
          [process.execPath, "run", "--filter", "@cawco/dashboard", "build"],
          // Node's default of 4 threads serialises the adapter's zlib work.
          { UV_THREADPOOL_SIZE: String(availableParallelism()) }
        )
      )
    : Promise.resolve();
  const { pi, photon } = piPackages();
  const copies: [string, string][] = [
    // Embedded from a copy: log-relay.ts imports
    // the source as a module, and a file the bundle also imports `with {
    // type: "file" }` is a file to every importer, so its named exports vanish.
    ["boundary-log-protocol.ts", "packages/agent/src/boundary-log-protocol.ts"],
    // The same for the workspace judge: core and pi import it as a module, and
    // each workspace's hook and OpenCode's plugin run its copy.
    ["workspace-judge.ts", "packages/core/src/workspace-judge.ts"],
    // The same for the boundary's protocol: the agent and the srt host import
    // it as a module, and each workspace's judge runs its copy.
    ["boundary-protocol.ts", "packages/agent/src/boundary/protocol.ts"],
  ];
  const [canvas, decision, fileViewer] = await Promise.all([
    // A canvas's host page, its bundle and Excalidraw's fonts (hub canvas-host.ts).
    canvasHostAssets(join(WORK, "canvas"), filesUnder),
    // A decision page's host bundle, its HTML pages' dials entry with it (hub decision-host.ts).
    decisionHostAssets(join(WORK, "decision"), filesUnder),
    // The file viewer's script and sheet, and PDF.js as published (core file-viewer.ts).
    fileViewerAssets(join(WORK, "file"), filesUnder),
    writeWorkFiles(copies),
    dashboard.then(writeDashboardHandler),
  ]);
  const playwright = packageDir("playwright-core", requireAgent);
  const shared: [string, string][] = [
    ...(await filesUnder(join(ROOT, "packages/hub/drizzle"), "drizzle")),
    ...(await filesUnder(join(ROOT, "packages/hub/skills"), "skills")),
    ...(await filesUnder(
      join(ROOT, "apps/dashboard/build/client"),
      "dashboard/client"
    )),
    ["dashboard/handler.js", join(WORK, "dashboard-handler.js")],
    ...(
      await filesUnder(join(pi, "dist/modes/interactive/theme"), "pi/theme")
    ).filter(([name]) => name.endsWith(".json")),
    ...(
      await filesUnder(join(pi, "dist/core/export-html"), "pi/export-html")
    ).filter(
      ([name]) =>
        name.includes("/vendor/") || /template\.(html|css|js)$/u.test(name)
    ),
    ["pi/package.json", join(pi, "package.json")],
    ["preview/overlay.js", join(WORK, "overlay.js")],
    ["opencode/plugin.js", join(WORK, "opencode-plugin.js")],
    ["stage/host.mjs", join(WORK, "stage-host.mjs")],
    ...canvas,
    ...decision,
    ...fileViewer,
    // Run as plain Bun as each workspace's judge, never as cawco (boundary/).
    ["boundary/judge.ts", join(ROOT, "packages/agent/src/boundary-judge.ts")],
    // What the judge imports from beside it, and the agent writes there (boundary/protocol.ts).
    ["boundary/protocol.ts", join(WORK, "boundary-protocol.ts")],
    // Run as plain Bun by a macOS workspace's `log` shim (boundary/).
    ["boundary/log.ts", join(ROOT, "packages/agent/src/boundary-log.ts")],
    ["boundary/log-protocol.ts", join(WORK, "boundary-log-protocol.ts")],
    // Run as plain Bun beside the judge, and imported by OpenCode's plugin (boundary/).
    ["boundary/workspace-judge.ts", join(WORK, "workspace-judge.ts")],
    // A project's browser image's build context, sent to the machine's
    // container runtime as it is (agent browser/image.ts).
    ...(await filesUnder(join(ROOT, "packages/agent/browser"), "browser")),
    // The packages the binary loads from their own published trees
    // (PUBLISHED_PACKAGES, core published-package.ts), each whole.
    ...(await filesUnder(playwright, "playwright-core")),
    ...(await filesUnder(photon, "photon-node")),
  ];
  const linux: [string, string][] = [
    ["srt/host.js", join(WORK, "srt-host.js")],
  ];
  const prepared: Prepared = {
    shared,
    linux,
    hashes: await publishedHashes([...shared, ...linux]),
  };
  const temp = `${PREPARED}.${process.pid}`;
  await writeFile(temp, JSON.stringify(prepared));
  await rename(temp, PREPARED);
}

/**
 * Each published file's content hash, the manifest a start compares with its
 * runtime folder's marker instead of reading the files (core runtime.ts).
 */
const publishedHashes = async (
  assets: [string, string][]
): Promise<Record<string, string>> =>
  Object.fromEntries(
    await Promise.all(
      assets
        .filter(([key]) => publishedFile(key))
        .map(async ([key, path]) => [
          key,
          Bun.hash(await Bun.file(path).bytes()).toString(36),
        ])
    )
  );

/** One target compiled from the prepared assets; release.ts owns locking, gates, signing and archives. */
export async function compileBinary(options: {
  target: string;
  outfile: string;
  version: string;
  commit: string;
  proof?: boolean;
  /** Link the credential-free stub harnesses into the real entry point; for the tests only. */
  stubHarness?: boolean;
  testPublicKey?: string;
}) {
  pinnedBun();
  if (!TARGETS.includes(options.target as (typeof TARGETS)[number])) {
    throw new Error(`Unsupported target ${options.target}`);
  }
  const prepared = await readFile(PREPARED, "utf8").then(
    (text) => JSON.parse(text) as Prepared,
    (error: unknown) => {
      throw new Error(
        `No prepared assets at ${PREPARED}: run \`bun scripts/build-binary.ts prepare\` first`,
        { cause: error }
      );
    }
  );
  const { pi, requirePi, tui } = piPackages();
  const linuxTarget = options.target.startsWith("linux-");
  const ripgrep = packageDir("@vscode/ripgrep-universal", requireAgent);
  const own: [string, string][] = linuxTarget
    ? [
        ...prepared.linux,
        ["srt/rg", join(ripgrep, "bin", options.target, "rg")],
      ]
    : [];
  const assets = [...prepared.shared, ...own];
  const hashes = {
    ...Object.fromEntries(
      prepared.shared
        .filter(([key]) => key in prepared.hashes)
        .map(([key]) => [key, prepared.hashes[key]])
    ),
    ...(await publishedHashes(own)),
  };
  const assetsSource = `${assets.map(([, path], i) => `import a${i} from ${JSON.stringify(path)} with { type: "file" };`).join("\n")}\nexport const binaryAssets = {${assets.map(([key], i) => `${JSON.stringify(key)}:a${i}`).join(",")}};\nexport const publishedHashes = ${JSON.stringify(hashes)};`;
  // The binary's root, this compile's own: Bun names each embedded entry and
  // asset by its path below it, and the code inside finds them by those
  // names. Each entry is a module of one import. Ours keep the names the code
  // spawns them by (./scripts/binary/*-worker.js); pi's take the names pi's
  // own Bun binary gives them, which its code spawns (config.js
  // `resolveCodemodeWorkerSpecifier`: "./src/extensions/codemode/worker.ts";
  // image-resize.js `resizeImage`: "./src/utils/image-resize-worker.ts").
  // pi-tui's native helper sits where its `getNativeModuleCandidates` looks
  // beside the module that loads it (native-module-path.js
  // `join(moduleDir, nativePath)`): /$bunfs/root/native/….
  await mkdir(WORK, { recursive: true });
  const root = await mkdtemp(join(WORK, `root-${options.target}-`));
  try {
    const entries: [string, string][] = [
      [
        "cawco.ts",
        join(
          ROOT,
          options.proof
            ? "scripts/binary/test-entry.ts"
            : "scripts/binary/entry.ts"
        ),
      ],
      ...[
        "transcript-worker.ts",
        "process-table-worker.ts",
        "loop-watch-worker.ts",
        "stores-worker.ts",
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
    await Promise.all(
      entries.map(async ([name, module]) => {
        await mkdir(dirname(join(root, name)), { recursive: true });
        await writeFile(
          join(root, name),
          `import ${JSON.stringify(module)};\n`
        );
      })
    );
    const [platform, arch] = options.target.split("-");
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
      // runtime pages' CSS compiler (hub page-css.ts), which loads them on a
      // compile only; the binary carries every page prebuilt and compiles none.
      // postcss, @tailwindcss/postcss and unplugin-icons: the decision host's
      // Tailwind compile and its icons (hub decision-host.ts), loaded the same
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
                { filter: /packages\/core\/src\/release-key\.ts$/u },
                () => ({
                  contents: `export const RELEASE_PUBLIC_KEY=${JSON.stringify(options.testPublicKey)};`,
                  loader: "ts",
                })
              );
            }
            build.onResolve({ filter: /^cawco:pi-runtime$/u }, () => ({
              path: join(ROOT, "packages/agent/src/standalone-setup.ts"),
            }));
            build.onResolve({ filter: /^cawco:pi-config$/u }, () => ({
              path: join(pi, "dist/config.js"),
            }));
            build.onResolve({ filter: /^cawco:quickjs$/u }, () => ({
              path: requirePi.resolve("quickjs-wasi/quickjs.wasm"),
            }));
            build.onLoad(
              { filter: /packages\/core\/src\/binary-assets\.ts$/u },
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
              { filter: /.*/u, namespace: "published-package" },
              ({ path }) => ({
                contents: `module.exports=require(${JSON.stringify(join(ROOT, "packages/core/src/published-package.ts"))}).publishedPackage(${JSON.stringify(PUBLISHED_PACKAGES[path])});`,
                loader: "js",
              })
            );
            build.onResolve({ filter: /^socket-activation$/u }, () => ({
              path: join(ROOT, "scripts/binary/socket-activation.ts"),
            }));
            if (options.stubHarness) {
              // The end-to-end test's builds run the update's timed steps at
              // the pace its machines set (scripts/binary/test-clock.ts).
              build.onLoad(
                { filter: /packages\/core\/src\/clock\.ts$/u },
                () => ({
                  contents: readFileSync(
                    join(ROOT, "scripts/binary/test-clock.ts"),
                    "utf8"
                  ),
                  loader: "ts",
                })
              );
            }
            if (options.proof) {
              // smoke-runtime.ts `smoke-pi` calls pi's and pi-tui's own
              // exports, which the scripts package does not declare.
              build.onResolve({ filter: /^cawco:smoke-pi$/u }, () => ({
                path: join(pi, "dist/index.js"),
              }));
              build.onResolve({ filter: /^cawco:smoke-pi-tui$/u }, () => ({
                path: join(tui, "dist/index.js"),
              }));
            }
            if (options.proof || options.stubHarness) {
              build.onLoad(
                { filter: /packages\/agent\/src\/harnesses\/index\.ts$/u },
                async () => ({
                  // Its imports are relative to scripts/binary, not to the file it replaces.
                  contents: (
                    await Bun.file(
                      join(ROOT, "scripts/binary/test-harnesses.ts")
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
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  console.log(
    `${options.target}: ${options.outfile} (${(await stat(options.outfile)).size} bytes)`
  );
}

if (import.meta.main) {
  const args = Bun.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (args[0] === "prepare") {
    await prepareAssets({ dashboard: true });
  } else {
    const [
      target = "linux-x64",
      outfile = join(WORK, "cawco"),
      version = "0.1.0-dev",
      commit = "dev",
    ] = args;
    if (!Bun.argv.includes("--skip-prepare")) {
      await prepareAssets({ dashboard: true });
    }
    await compileBinary({
      target,
      outfile,
      version,
      commit,
      proof: Bun.argv.includes("--proof"),
    });
  }
}
