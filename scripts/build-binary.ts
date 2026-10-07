// biome-ignore-all lint/performance/useTopLevelRegex: these loader filters register once per serial build, never on a request path.
// biome-ignore-all lint/performance/noAwaitInLoops: filesystem walks and compiler stages are deliberately serialized to bound memory.
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";

export const PINNED_BUN = "1.4.2";
export const TARGETS = [
  "linux-x64",
  "linux-arm64",
  "darwin-arm64",
  "darwin-x64",
] as const;
const ROOT = resolve(import.meta.dir, "..");
const requireAgent = createRequire(join(ROOT, "packages/agent/package.json"));
const requireCore = createRequire(join(ROOT, "packages/core/package.json"));

function packageDir(
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
      if (
        actual === name ||
        (name === "typescript" && actual === "@typescript/typescript6")
      ) {
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
async function nativeClaude(target: string, work: string): Promise<string> {
  const { version } = JSON.parse(
    await Bun.file(
      join(
        packageDir("@anthropic-ai/claude-agent-sdk", requireAgent),
        "package.json"
      )
    ).text()
  );
  const pkg = `@anthropic-ai/claude-agent-sdk-${target}`;
  const dir = join(work, "native", version, target);
  const binary = join(dir, "package/claude");
  if (await Bun.file(binary).exists()) {
    return binary;
  }
  await mkdir(dir, { recursive: true });
  const response = await fetch(`https://registry.npmjs.org/${pkg}/${version}`);
  if (!response.ok) {
    throw new Error(`Cannot resolve ${pkg}@${version}: ${response.status}`);
  }
  const metadata = (await response.json()) as {
    dist: { tarball: string; integrity: string };
  };
  const archive = join(dir, "native.tgz");
  const download = await fetch(metadata.dist.tarball);
  if (!download.ok) {
    throw new Error(`Native asset download failed: ${download.status}`);
  }
  await Bun.write(archive, download);
  const [algorithm, expected] = metadata.dist.integrity.split("-");
  if (
    algorithm !== "sha512" ||
    new Bun.CryptoHasher("sha512")
      .update(await Bun.file(archive).bytes())
      .digest("base64") !== expected
  ) {
    throw new Error("Native SDK package integrity mismatch");
  }
  await run(["tar", "-xzf", archive, "-C", dir]);
  return binary;
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
    const overlay = await Bun.build({
      entrypoints: [
        join(ROOT, "packages/agent/src/preview-overlay/overlay.ts"),
      ],
      target: "browser",
      format: "iife",
      minify: true,
      outdir: work,
    });
    if (!overlay.success) {
      throw new AggregateError(overlay.logs, "Overlay build failed");
    }
  }
  const pi = packageDir("@earendil-works/pi-coding-agent", requireAgent);
  const requirePi = createRequire(join(pi, "package.json"));
  const photon = packageDir("@silvia-odwyer/photon-node", requirePi);
  const zod = packageDir("zod", requireCore);
  const typescript = packageDir("typescript", requireCore);
  const zodBundle = await Bun.build({
    entrypoints: [join(zod, "index.js")],
    target: "bun",
    format: "esm",
    minify: true,
  });
  if (!zodBundle.success) {
    throw new AggregateError(zodBundle.logs, "Workflow zod build failed");
  }
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
  const assets = [
    ...(await filesUnder(join(ROOT, "packages/hub/drizzle"), "drizzle")),
    ...(await filesUnder(join(ROOT, "packages/hub/skills"), "skills")),
    ...(await filesUnder(
      join(ROOT, "apps/dashboard/build/client"),
      "dashboard/client"
    )),
    ...(await filesUnder(join(typescript, "lib"), "workflow/lib")).filter(
      ([name]) => name.endsWith(".d.ts")
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
    ["native/claude", await nativeClaude(options.target, work)],
  ] as [string, string][];
  const assetsSource = `${assets.map(([, path], i) => `import a${i} from ${JSON.stringify(path)} with { type: "file" };`).join("\n")}\nexport const binaryAssets = {${assets.map(([key], i) => `${JSON.stringify(key)}:a${i}`).join(",")}};`;
  const [platform, arch] = options.target.split("-");
  const tui = packageDir("@earendil-works/pi-tui", requirePi);
  const clipboard = join(
    tui,
    `native/${platform}/prebuilds/${platform}-${arch}/${platform}-platform${platform === "linux" ? "-x11" : ""}.node`
  );
  const result = await Bun.build({
    entrypoints: [
      join(
        ROOT,
        options.proof
          ? "scripts/binary/proof-entry.ts"
          : "scripts/binary/entry.ts"
      ),
      join(ROOT, "scripts/binary/workflow-worker.ts"),
      join(ROOT, "scripts/binary/transcript-worker.ts"),
      join(pi, "dist/utils/image-resize-worker.js"),
      join(pi, "dist/extensions/codemode/worker.js"),
    ],
    compile: {
      target: `bun-${options.target}` as Bun.Build.CompileTarget,
      outfile: options.outfile,
      autoloadDotenv: false,
      autoloadBunfig: false,
    },
    minify: true,
    external: ["playwright-core"],
    define: {
      __CAWCO_RELEASE__: "true",
      __CAWCO_VERSION__: JSON.stringify(options.version),
      __CAWCO_COMMIT__: JSON.stringify(options.commit),
      "process.env.NODE_ENV": '"production"',
    },
    plugins: [
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
          build.onResolve({ filter: /^socket-activation$/ }, () => ({
            path: join(ROOT, "scripts/binary/socket-activation.ts"),
          }));
          build.onLoad(
            { filter: /apps\/dashboard\/build\/adapter-node\.js$/ },
            async ({ path }) => ({
              contents: `import {materializeTree} from ${JSON.stringify(join(ROOT, "packages/core/src/runtime.ts"))};\n${(await Bun.file(path).text()).replace("export const dir = dirname(fileURLToPath(import.meta.url));", 'export const dir = materializeTree("dashboard");')}`,
              loader: "js",
              resolveDir: dirname(path),
            })
          );
          build.onLoad({ filter: /photon_rs\.js$/ }, async ({ path }) => ({
            contents: `import wasmPath from ${JSON.stringify(join(photon, "photon_rs_bg.wasm"))} with {type:"file"};\n${(await Bun.file(path).text()).replace("require('path').join(__dirname, 'photon_rs_bg.wasm')", "wasmPath")}`,
            loader: "js",
            resolveDir: dirname(path),
          }));
          build.onLoad(
            { filter: /pi-coding-agent\/dist\/utils\/photon\.js$/ },
            () => ({
              contents:
                'let module; export async function loadPhoton(){return module ??= await import("@silvia-odwyer/photon-node");}',
              loader: "js",
              resolveDir: pi,
            })
          );
          build.onLoad(
            { filter: /pi-tui\/dist\/native-platform\.js$/ },
            () => ({
              contents: `let helper; function load(){return helper ??= require(${JSON.stringify(clipboard)});} export const getNativePlatformHelper=()=>process.platform==="darwin"?load():undefined; export const getNativeClipboard=()=>process.platform==="linux"?(process.env.DISPLAY?load():undefined):getNativePlatformHelper();`,
              loader: "js",
              resolveDir: tui,
            })
          );
          build.onLoad(
            { filter: /pi-coding-agent\/dist\/utils\/image-resize\.js$/ },
            async ({ path }) => ({
              contents: (await Bun.file(path).text()).replace(
                /export async function resizeImage\([\s\S]*?\n}\n/,
                `export async function resizeImage(inputBytes,mimeType,options){return resizeImageInWorker(new URL(${JSON.stringify(`./${relative(ROOT, join(pi, "dist/utils/image-resize-worker.js"))}`)},import.meta.url),inputBytes,mimeType,options);}\n`
              ),
              loader: "js",
              resolveDir: dirname(path),
            })
          );
          build.onLoad(
            { filter: /pi-coding-agent\/dist\/config\.js$/ },
            async ({ path }) => ({
              contents: (await Bun.file(path).text()).replace(
                'return "./src/extensions/codemode/worker.ts";',
                `return ${JSON.stringify(`/$bunfs/root/${relative(ROOT, join(pi, "dist/extensions/codemode/worker.js"))}`)};`
              ),
              loader: "js",
              resolveDir: dirname(path),
            })
          );
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
            build.onLoad(
              { filter: /packages\/agent\/src\/auth\.ts$/ },
              async ({ path }) => ({
                contents: (await Bun.file(path).text()).replace(
                  "export const probeAuth = async (): Promise<AuthState> => {",
                  'export const probeAuth = async (): Promise<AuthState> => { return "unauthenticated";'
                ),
                loader: "ts",
                resolveDir: dirname(path),
              })
            );
          }
        },
      },
    ],
  });
  if (!result.success) {
    throw new AggregateError(result.logs, "Standalone compile failed");
  }
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
