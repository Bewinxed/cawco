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
import { refuseSchemeLowering } from "@cawco/core/bundle-css-guard";
import { bundled } from "@cawco/core/bundled";
import { houseFaceSheet } from "@cawco/core/house-faces";
import { embeddedFile, standalone } from "@cawco/core/runtime";
import { themeVariablesCss } from "@cawco/core/theme-css";

const HOST = new URL("./host.ts", import.meta.url).pathname;

/** The libraries bundled whole into the host, each with where it comes from: their licences head the file. */
const BUNDLED: [name: string, home: string][] = [
  ["@code-inspector/core", "https://github.com/zh-lx/code-inspector"],
  ["svelte2tsx", "https://github.com/sveltejs/language-tools"],
  ["vue-component-meta", "https://github.com/vuejs/language-tools"],
  ["react-docgen", "https://github.com/reactjs/react-docgen"],
  [
    "react-docgen-typescript",
    "https://github.com/styleguidist/react-docgen-typescript",
  ],
  ["@jridgewell/trace-mapping", "https://github.com/jridgewell/sourcemaps"],
];
const LICENCE_FILES = ["LICENSE", "LICENSE.md", "license", "LICENCE"];

/** Each bundled library's licence, as its package ships it. */
const notice = async (): Promise<string> => {
  const parts = await Promise.all(
    BUNDLED.map(async ([name, home]) => {
      const pkg = join(Bun.resolveSync(`${name}/package.json`, HOST), "..");
      const file = LICENCE_FILES.map((one) => join(pkg, one)).find(
        (one) => Bun.file(one).size > 0
      );
      if (!file) {
        throw new Error(
          `${name} ships no licence file this build knows: read its package again.`
        );
      }
      const text = await readFile(file, "utf8");
      return ` * Bundles ${name} (${home}):\n *\n${text
        .trim()
        .split("\n")
        .map((line) => ` * ${line}`.trimEnd())
        .join("\n")}`;
    })
  );
  return `/*!\n${parts.join("\n *\n")}\n */`;
};

/**
 * code-inspector's core reads its browser client (`client.umd.js`,
 * `client.iife.js`, 745 KB) from beside itself as it loads, for the full
 * plugin to put into pages. The stage uses the transform alone and no
 * client, and the bundle has no files beside it: both reads become empty
 * strings. Pinned to the version it was read in; another version that reads
 * them otherwise fails the build here, never a stage at its start.
 */
const CORE_DIST = /@code-inspector[/\\]core[/\\]dist[/\\]index\.mjs$/u;
const CLIENT_READ =
  /(\w+) = (\w+)\.resolve\(\w+, "\.\/client\.(?:umd|iife)\.js"\), (\w+) = \w+\.readFileSync\(\1, "utf-8"\)/gu;
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

/**
 * The docgen tools' peers (docgen.ts), the project's own: left out of the
 * bundle, so each tool's `require` of them is the project's copy, resolved
 * from where the host is written (the toolchain root's `.cawco/stage/`) as Node
 * resolves it, and only when a file of that framework is read.
 */
const PEERS = ["typescript", "svelte/compiler"];

/** svelte2tsx's shims for the code it writes, which the checker reads beside it; the bundle has no files beside it. */
const svelteShims = async (): Promise<string> =>
  await readFile(
    join(
      Bun.resolveSync("svelte2tsx/package.json", HOST),
      "..",
      "svelte-shims-v4.d.ts"
    ),
    "utf8"
  );

const CANVAS = new URL("./canvas/runtime.ts", import.meta.url).pathname;

/**
 * The house faces the canvas page's own style is set in (DESIGN.md's type), as every
 * surface serves them (core house-faces.ts): a rule per woff2 piece, pointed
 * at `faces/<file>` beside the canvas page (the host serves them there), and
 * each piece's bytes in base64.
 */
async function canvasFaces(): Promise<{
  css: string;
  files: Record<string, string>;
}> {
  const { css, files } = await houseFaceSheet("faces/");
  return {
    css,
    files: Object.fromEntries(
      files.map(([name, bytes]) => [
        name,
        Buffer.from(bytes).toString("base64"),
      ])
    ),
  };
}

/** The text of a bundle's one output file. */
const outputText = (
  what: string,
  outputs: Bun.BuildArtifact[]
): Promise<string> => {
  const [built] = outputs;
  if (!built) {
    throw new Error(`${what} built no file.`);
  }
  return built.text();
};

/** The canvas's browser runtime (canvas/runtime.ts), bundled: an ES module the stage serves as `cawco:stage/runtime.js`. */
async function canvasRuntime(): Promise<string> {
  const result = await bundled("The canvas runtime", {
    entrypoints: [CANVAS],
    target: "browser",
    format: "esm",
    minify: true,
  });
  await refuseSchemeLowering("The stage's canvas runtime", result.outputs);
  return await outputText("The canvas runtime", result.outputs);
}

/** The host, bundled: its text. */
export async function buildStageHost(): Promise<string> {
  const [runtime, tokens, faces] = await Promise.all([
    canvasRuntime(),
    themeVariablesCss(),
    canvasFaces(),
  ]);
  const result = await bundled("The stage host", {
    entrypoints: [HOST],
    target: "node",
    format: "esm",
    minify: true,
    banner: await notice(),
    plugins: [noClient],
    external: PEERS,
    define: {
      __SVELTE_SHIMS__: JSON.stringify(await svelteShims()),
      __CANVAS_RUNTIME__: JSON.stringify(runtime),
      __CANVAS_TOKENS__: JSON.stringify(tokens),
      __CANVAS_FACES__: JSON.stringify(faces.css),
      __CANVAS_FACE_FILES__: JSON.stringify(faces.files),
    },
  });
  await refuseSchemeLowering("The stage host", result.outputs);
  return await outputText("The stage host", result.outputs);
}

/**
 * The environment the host's bun runs with, past the stage's own words.
 *
 * `BUN_JSC_heapGrowthMaxIncrease`: how far JavaScriptCore lets its heap grow
 * past what the last full collection left before it collects the old space
 * again. Bun sets each `BUN_JSC_<option>` with `JSC::Options::setOption` as
 * it starts (its `JSCInitialize`, src/jsc/bindings/ZigGlobalObject.cpp). On
 * a machine of 16 GB or more the limit is `(3 · e^(−2 · heap/RAM) + 1) ·
 * heap` (WebKit heap/Heap.cpp `proportionalHeapSize`, OptionsList.h
 * `heapGrowthMaxIncrease` 3): about 4× for a 1 GB stage on obelisk's RAM.
 * An edit's work (its compile, its props' checker, its section read again)
 * outlives the eden collections run while it does, so a stage climbed some
 * 30 to 50 MB of heap a round of edits, 0.9 GB to 1.5 GB and RSS 1.2 GB to
 * 2.2 GB over 13, freed only when the limit was reached. At 0.3 the old
 * space is collected at 1.3× instead, as the edits come: across the same
 * 13 rounds the heap held at 0.9–1.0 GB and RSS within 250 MB of idle.
 */
export const HOST_RUNTIME_ENV: Record<string, string> = {
  BUN_JSC_heapGrowthMaxIncrease: "0.3",
};

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
