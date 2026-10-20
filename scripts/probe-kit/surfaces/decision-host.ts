/**
 * A decision page's host on the walk's previews: the bundle the hub serves
 * at `/__cawco/decision/` on every preview origin (core decision-host.ts),
 * built from this tree. The hub tape holds none of its files (the recording
 * never fetched them), so a decision page's frame drew nothing under its
 * program, and a tape would draw a recording's build, not this tree's.
 *
 * Captured, it is the hub's own build (core `decisionHostFile`, Svelte in
 * production). Read for coverage (`dev`), the same entry is built with
 * Svelte's dev compile, so each element it draws names its file
 * (`__svelte_meta`) as the dashboard's dev server's do; its other files
 * (DialKit's) are the hub's.
 */
import { createRequire } from "node:module";
import { join } from "node:path";
import { agentReact } from "../../../packages/core/src/agent-react";
import { decisionHostFile } from "../../../packages/core/src/decision-host";
import { ROOT } from "../kit";

/** Where the hub serves the host on a preview origin (hub decision-program.ts `DECISION_ASSETS`). */
export const DECISION_HOST = "/__cawco/decision/";

const HOST_ENTRY = join(
  ROOT,
  "apps/dashboard/src/lib/cawco/decisions/host/host.ts"
);

/** bun-plugin-svelte, as core resolves it (the kit has none of its own). */
interface SveltePluginModule {
  SveltePlugin: (options: { development: boolean }) => Bun.BunPlugin;
}

let devBuilt: Promise<Map<string, Blob>> | undefined;

/** The host built with Svelte's dev compile, its files by name, once a process. */
function devHost(): Promise<Map<string, Blob>> {
  devBuilt ??= (async () => {
    const { SveltePlugin } = (await import(
      createRequire(join(ROOT, "packages/core/package.json")).resolve(
        "bun-plugin-svelte"
      )
    )) as SveltePluginModule;
    const result = await Bun.build({
      entrypoints: [HOST_ENTRY],
      target: "browser",
      format: "esm",
      splitting: true,
      conditions: ["browser", "development"],
      plugins: [SveltePlugin({ development: true }), agentReact],
      publicPath: DECISION_HOST,
      loader: { ".woff2": "file", ".webp": "file" },
      naming: {
        entry: "[name].[ext]",
        chunk: "chunk-[hash].[ext]",
        asset: "asset-[hash].[ext]",
      },
    });
    if (!result.success) {
      throw new Error(
        `the decision host's dev build failed: ${result.logs.map(String).join("; ")}`
      );
    }
    return new Map(
      result.outputs.map((out) => [out.path.split("/").at(-1) ?? "", out])
    );
  })();
  return devBuilt;
}

const TYPES: Record<string, string> = {
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
};

/** The host's file at `path` (under {@link DECISION_HOST}); null when it has none. */
export async function decisionHostAnswer(
  path: string,
  dev: boolean
): Promise<Response | null> {
  if (dev) {
    const file = (await devHost()).get(path);
    if (file) {
      const type = TYPES[path.slice(path.lastIndexOf(".") + 1)];
      return new Response(file, {
        headers: type ? { "content-type": type } : {},
      });
    }
  }
  return await decisionHostFile(path);
}
