/**
 * The client build's first-paint code in a few chunks, not a few hundred.
 *
 * Rolldown's automatic splitting gives every set of entries that shares a
 * module a chunk of its own, and this build has 77 entries (Kit's runtime
 * and one per route node) and 450 dynamic ones: the `(app)` layout's static
 * graph came out as 245 chunks, 60 of them under 1 KB, and a cold page carried
 * a `<link rel="modulepreload">` for each. A browser fetches six at a time
 * from an HTTP/1.1 origin, so WebKit on an iPhone made ~40 round trips before
 * its first paint: 1.6 s on the tailnet, 15.7 s at an LTE round trip.
 *
 * Here every module a page's first paint loads goes in a chunk by who loads
 * it, through Rolldown's `output.codeSplitting.groups` (rolldown.rs
 * /in-depth/manual-code-splitting: "A module will be either captured by
 * automatic code splitting or manual code splitting depending on your
 * configuration, but not both"). The loaders are the families of routes:
 * - `base`: every route, by Kit's runtime entries and the root layout;
 * - a route group (`(app)`), by its layout;
 * - each page outside every route group (an artifact in its own tab, a
 *   project's custom view in the app's web view), by itself: what a group's
 *   layout shares with one goes in a chunk named for both, so a bare page
 *   never loads the shell's chunk. The owner's rule for those: "an artifact
 *   shouldn't load anything that is not needed for the preview/artifact".
 * A page's own modules, a nested layout's and every dynamic import stay with
 * the automatic splitting, so routes still load lazily and a lazy editor or
 * diagram library is fetched only when drawn. The `/dev/*` pages are no
 * family: they load whatever they share, the shell included.
 *
 * A module's dependencies are loaded by everyone who loads it, so each lies in
 * a chunk of at least the same loaders. A group with more loaders takes its
 * modules first (`priority`: "modules of that group will be removed from
 * other groups"), so the recursive capture of a group's dependencies
 * (`includeDependenciesRecursively`, on by default) never pulls a shared
 * module into a narrower chunk. Rolldown reads the groups before the build
 * (`outputOptions` runs before `buildEnd`), so there is one group per
 * loader count, up to one per entry, each naming its chunks once the graph is
 * known.
 */
import { relative } from "node:path";
import type { Plugin } from "vite";

/** Kit's client runtime entries, which every page loads (Kit build/index.js `client_input`). */
const KIT_RUNTIME =
  /[\\/]@sveltejs[\\/]kit[\\/]src[\\/]runtime[\\/]client[\\/](?:entry|payload)\.js$/u;
const KIT_APP = /[\\/]client-optimized[\\/]app\.js$/u;
/** A route node's entry: Kit writes one per node, re-exporting its route files. */
const KIT_NODE = /[\\/]client-optimized[\\/]nodes[\\/]\d+\.js$/u;
/** A route file, by the directory it is in and its kind. */
const ROUTE_FILE = /^(.*?)\+(page|layout|error)(?:\.svelte|\.[jt]s)$/u;
const GROUP_SEGMENT = /^\([^)]+\)$/u;
const BASE = "base";
const PAGE = "page:";
const PARAM_SEGMENT = /^\[.*\]$/u;

/**
 * A chunk's name from its families', as Vite names the chunk's stylesheet
 * (`assets/<name>.<hash>.css`): `(app)` is `app`, a page its path without
 * its parameters (`project-view`), joined by `_`.
 */
const chunkName = (families: Iterable<string>): string =>
  [...families]
    .map((family) =>
      family
        .replace(PAGE, "")
        .split("/")
        .filter((segment) => !PARAM_SEGMENT.test(segment))
        .join("-")
        .replace(/[^\w-]/gu, "")
    )
    .sort()
    .join("_");

/** The family of routes a node's route file loads for, or null when it is no family's. */
const familyOf = (route: string): string | null => {
  const match = ROUTE_FILE.exec(route);
  if (!match) {
    return null;
  }
  const [, dir = "", kind] = match;
  const segments = dir.split("/").filter(Boolean);
  const [first = ""] = segments;
  if (kind === "layout" && segments.length === 0) {
    return BASE;
  }
  if (kind === "layout" && segments.length === 1 && GROUP_SEGMENT.test(first)) {
    return first;
  }
  if (kind === "page" && !GROUP_SEGMENT.test(first) && first !== "dev") {
    return `${PAGE}${segments.join("/")}`;
  }
  return null;
};

/** The module graph as the build has it, the parts read here. */
interface Graph {
  getModuleIds: () => IterableIterator<string>;
  getModuleInfo: (
    id: string
  ) => { importedIds: readonly string[]; isEntry: boolean } | null;
}

/** Each family's first modules: Kit's runtime entries for `base`, and the route files its node entries import. */
const rootsOf = (graph: Graph, routesDir: string): Map<string, string[]> => {
  const roots = new Map<string, string[]>();
  const root = (family: string, id: string) =>
    roots.set(family, [...(roots.get(family) ?? []), id]);
  for (const id of graph.getModuleIds()) {
    const info = graph.getModuleInfo(id);
    if (!info?.isEntry) {
      continue;
    }
    if (KIT_RUNTIME.test(id) || KIT_APP.test(id)) {
      root(BASE, id);
      continue;
    }
    for (const imported of KIT_NODE.test(id) ? info.importedIds : []) {
      const family = familyOf(
        relative(routesDir, imported).split("\\").join("/")
      );
      if (family) {
        root(family, imported);
      }
    }
  }
  return roots;
};

/** The families whose static graph holds each module: who loads it at first paint. An entry stays its own chunk and is left out. */
const loadersOf = (
  graph: Graph,
  roots: Map<string, string[]>
): Map<string, Set<string>> => {
  const loaders = new Map<string, Set<string>>();
  for (const [family, ids] of roots) {
    const stack = [...ids];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const id = stack.pop() as string;
      const info = seen.has(id) ? null : graph.getModuleInfo(id);
      seen.add(id);
      if (info && !info.isEntry) {
        loaders.set(id, (loaders.get(id) ?? new Set()).add(family));
      }
      stack.push(...(info?.importedIds ?? []));
    }
  }
  return loaders;
};

export const firstPaintChunks = (routesDir: string): Plugin => {
  /** Each captured module's chunk: its loaders' names, and how many they are. */
  const chunkOf = new Map<string, { name: string; loaders: number }>();
  let entries = 0;

  return {
    name: "cawco:first-paint-chunks",
    apply: "build",
    applyToEnvironment: (environment) => environment.name === "client",
    options(options) {
      const { input } = options;
      entries = typeof input === "string" ? 1 : Object.keys(input ?? {}).length;
      return null;
    },
    outputOptions(options) {
      const split = options.codeSplitting;
      if (split === false) {
        return null;
      }
      const own = typeof split === "object" ? split : {};
      // `base`'s loader count is one above every other's: each route loads it.
      const groups = Array.from({ length: entries + 1 }, (_, at) => {
        const loaders = entries + 1 - at;
        return {
          name: (id: string) => {
            const chunk = chunkOf.get(id);
            return chunk?.loaders === loaders ? chunk.name : null;
          },
          debugName: `first paint, ${loaders} loaders`,
          priority: loaders,
        };
      });
      return {
        ...options,
        codeSplitting: { ...own, groups: [...(own.groups ?? []), ...groups] },
      };
    },
    buildEnd() {
      chunkOf.clear();
      const roots = rootsOf(this, routesDir);
      if (!roots.has(BASE)) {
        this.error("first-paint chunks: Kit's runtime entries were not found");
      }
      for (const [id, families] of loadersOf(this, roots)) {
        if (families.has(BASE)) {
          chunkOf.set(id, { name: BASE, loaders: entries + 1 });
        } else if (![...families].every((one) => one.startsWith(PAGE))) {
          // A bare page's own code is left to the automatic splitting.
          chunkOf.set(id, {
            name: chunkName(families),
            loaders: families.size,
          });
        }
      }
    },
  };
};
