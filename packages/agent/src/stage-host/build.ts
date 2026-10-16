/**
 * The stage's host bundled into one ES module (host.ts), as the preview
 * overlay and the canvas host are: the standalone binary carries it prebuilt
 * as `stage/host.mjs` (`build-binary.ts`); a source checkout bundles it on
 * the first stage it starts. It runs in the project's own runtime, `node` or
 * `bun`, so it is built for Node. code-inspector's transform is in it,
 * Babel and all (5.8 MB, the spike's measure); its MIT notice heads the file.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { embeddedFile, standalone } from "@cawco/core/runtime";

const HOST = new URL("./host.ts", import.meta.url).pathname;

/** code-inspector's licence, as its package ships it. */
const notice = async (): Promise<string> => {
  const pkg = Bun.resolveSync("@code-inspector/core/package.json", HOST);
  const text = await readFile(join(pkg, "..", "LICENSE"), "utf8");
  return `/*!\n * Bundles @code-inspector/core (https://github.com/zh-lx/code-inspector):\n *\n${text
    .trim()
    .split("\n")
    .map((line) => ` * ${line}`.trimEnd())
    .join("\n")}\n */`;
};

/**
 * code-inspector's core reads its browser client (`client.umd.js`,
 * `client.iife.js`, 745 KB) from beside itself as it loads, for the full
 * plugin to put into pages. The stage uses the transform alone and no
 * client, and the bundle has no files beside it: both reads become empty
 * strings. Pinned to the version it was read in; another version that reads
 * them otherwise fails the build here, never a stage at its start.
 */
const CORE_DIST = /@code-inspector[/\\]core[/\\]dist[/\\]index\.mjs$/;
const CLIENT_READ =
  /(\w+) = (\w+)\.resolve\(\w+, "\.\/client\.(?:umd|iife)\.js"\), (\w+) = \w+\.readFileSync\(\1, "utf-8"\)/g;
const noClient: Bun.BunPlugin = {
  name: "code-inspector-no-client",
  setup(build) {
    build.onLoad({ filter: CORE_DIST }, async ({ path }) => {
      const source = await readFile(path, "utf8");
      const reads = source.match(CLIENT_READ)?.length ?? 0;
      if (reads !== 2) {
        throw new Error(
          `@code-inspector/core reads its client in ${reads} places this build knows, not 2: read its dist/index.mjs again.`
        );
      }
      return {
        contents: source.replace(CLIENT_READ, '$1 = "", $3 = ""'),
        loader: "js",
      };
    });
  },
};

/** The host, bundled: its text. */
export async function buildStageHost(): Promise<string> {
  const result = await Bun.build({
    entrypoints: [HOST],
    target: "node",
    format: "esm",
    minify: true,
    banner: await notice(),
    plugins: [noClient],
  });
  if (!result.success) {
    throw new AggregateError(result.logs, "The stage host's build failed");
  }
  return await (result.outputs[0] as Bun.BuildArtifact).text();
}

let built: Promise<string> | undefined;

/**
 * The host's text: the binary's own copy, or built once per process from
 * the checkout. A failed build is not kept, so the next stage tries again.
 */
export function stageHost(): Promise<string> {
  built ??= (
    standalone
      ? Bun.file(embeddedFile("stage/host.mjs")).text()
      : buildStageHost()
  ).catch((error: unknown) => {
    built = undefined;
    throw error;
  });
  return built;
}
