import { existsSync, realpathSync } from "node:fs";
import { dirname, join, sep } from "node:path";

/**
 * Package `name`'s real folder, found from `from` up as Node finds it, when
 * it is linked: its real path lies under no `node_modules` (a workspace's
 * own package, `workspace:*`), where an installed one's, bun's shared
 * store's included, lies under one. Null for an installed one or none.
 */
export function linkedFolder(from: string, name: string): string | null {
  for (let dir = from; ; dir = dirname(dir)) {
    const at = join(dir, "node_modules", name);
    if (existsSync(at)) {
      const real = realpathSync(at);
      return real.split(sep).includes("node_modules") ? null : real;
    }
    if (dirname(dir) === dir) {
      return null;
    }
  }
}

/** A package's name from an import of it or of its subpath: `@cawco/icons/marks` is `@cawco/icons`. */
const packageName = (specifier: string): string =>
  specifier
    .split("/")
    .slice(0, specifier.startsWith("@") ? 2 : 1)
    .join("/");

/** What the plugin uses of a Vite dev server (vite.dev/guide/api-javascript). */
interface RebundledServer {
  config: {
    root: string;
    plugins: readonly { name: string }[];
    logger: { error: (message: string) => void };
  };
  environments: {
    client: { config: { optimizeDeps: { include?: string[] } } };
  };
  /** Vite's own restart: "force the optimizer to re-bundle, same as --force cli flag". */
  restart: (forceOptimize?: boolean) => Promise<void>;
  watcher: {
    add: (paths: string[]) => unknown;
    on: (
      event: "add" | "change" | "unlink",
      listener: (file: string) => void
    ) => unknown;
  };
}

const NAME = "cawco:linked-rebundle";

/** How long a forced package's writes settle before its pre-bundle is built again: a merge or a checkout writes many files at once. */
const SETTLE_MS = 300;

/**
 * A linked workspace package a project's config forces into Vite's
 * pre-bundle ("Use this option to force a linked package to be
 * pre-bundled", vite.dev/config/dep-optimization-options) stays
 * pre-bundled, and is bundled again whenever a file of it changes. Every
 * other linked package is served as source, as Vite serves one by itself
 * ("Vite automatically detects dependencies that are not resolved from
 * `node_modules` and treats the linked dep as source code",
 * vite.dev/guide/dep-pre-bundling).
 *
 * The dashboard forces `@cawco/icons`: a canvas of a component drawing its
 * icons opened cold in 663 requests with it, 1,097 with the barrel served
 * from source (its icons one module each). Vite keeps a pre-bundle while
 * "Package manager lockfile content … Relevant fields in your
 * `vite.config.js` … `NODE_ENV` value" stay the same (same page), so an
 * icon added to the package never reached a running dev server ("does not
 * provide an export named 'IconTodoDone'") until its deps cache was
 * deleted; the same page: "When making changes to the linked dep, restart
 * the dev server with the `--force` command line option". This plugin does
 * that with Vite's own `restart(forceOptimize)`, on its watcher, given each
 * forced package's folder: Vite watches its root and the modules it serves,
 * and a pre-bundled package's source is neither. A page open on the server
 * has its socket closed by the restart, and Vite's client waits for the
 * server and reloads (`vite:ws:disconnect`: "Polling for restart...",
 * `location.reload()`), asking for the new bundle.
 *
 * One rule for every Vite server: the dashboard's config names it, and a
 * CawCo stage adds it to whatever project it runs (agent stage-host
 * host.ts). Where both have, the first in the resolved plugins acts and the
 * other stands down, so one change restarts the server once.
 */
export const linkedRebundle = () => {
  const plugin = {
    name: NAME,
    configureServer(server: RebundledServer) {
      if (server.config.plugins.find((one) => one.name === NAME) !== plugin) {
        return;
      }
      const { root } = server.config;
      const folders = [
        ...new Set(
          (server.environments.client.config.optimizeDeps.include ?? [])
            .filter((entry) => !entry.includes(">"))
            .map((entry) => linkedFolder(root, packageName(entry)))
            .filter((dir): dir is string => dir !== null)
        ),
      ];
      if (folders.length === 0) {
        return;
      }
      server.watcher.add(folders);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const changed = (file: string) => {
        if (
          file.includes(`${sep}node_modules${sep}`) ||
          !folders.some((dir) => file.startsWith(`${dir}${sep}`))
        ) {
          return;
        }
        clearTimeout(timer);
        timer = setTimeout(() => {
          server.restart(true).catch((error: unknown) => {
            server.config.logger.error(
              `[cawco] could not bundle ${file}'s package again: ${error instanceof Error ? error.message : String(error)}`
            );
          });
        }, SETTLE_MS);
      };
      for (const event of ["add", "change", "unlink"] as const) {
        server.watcher.on(event, changed);
      }
    },
  };
  return plugin;
};
