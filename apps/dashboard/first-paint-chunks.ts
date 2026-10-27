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
 * - every other layout (`(app)`, `(app)/config`), by itself, for the pages
 *   under it;
 * - each page outside every route group (an artifact in its own tab, a
 *   project's custom view in the app's web view), by itself: what a group's
 *   layout shares with one goes in a chunk named for both, so a bare page
 *   never loads the shell's chunk. The owner's rule for those: "an artifact
 *   shouldn't load anything that is not needed for the preview/artifact".
 * A module both a layout and one under it load is the outer one's: every
 * page under the inner layout loads the outer one too. What two or more pages
 * under a nested layout (`(app)/config`, below the shell) share counts as
 * that layout's: a settings section's pages share their rows and forms, which
 * came out as a dozen chunks of a few KB each. A page's own modules, what
 * pages directly under a group's layout share, and every dynamic import stay
 * with the automatic splitting, so routes still load lazily and a lazy editor
 * or diagram library is fetched only when drawn. The `/dev/*` routes are no
 * family: they load whatever they share, the shell included.
 *
 * A module's dependencies are loaded by every page that loads it, so each
 * lies in a chunk loaded by at least the same pages. The group whose chunk
 * more pages load takes its modules first (`priority`: "modules of that group
 * will be removed from other groups"), so the recursive capture of a group's
 * dependencies (`includeDependenciesRecursively`, on by default) never pulls
 * a shared module into a narrower chunk. Rolldown reads the groups before the
 * build (`outputOptions` runs before `buildEnd`), so there is one group per
 * page count, up to one per entry, each naming its chunks once the graph is
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

/** A route file's directory under `src/routes` and its kind, or null for another file. */
const routeOf = (
  file: string
): { dir: string; kind: string; segments: string[] } | null => {
  const match = ROUTE_FILE.exec(file);
  if (!match) {
    return null;
  }
  const [, path = "", kind = ""] = match;
  const segments = path.split("/").filter(Boolean);
  return { dir: segments.join("/"), kind, segments };
};

/** The family of routes a node's route file loads for, or null when it is no family's. */
const familyOf = (file: string): string | null => {
  const route = routeOf(file);
  if (!route) {
    return null;
  }
  const { dir, kind, segments } = route;
  if (segments.find((segment) => !GROUP_SEGMENT.test(segment)) === "dev") {
    return null;
  }
  if (kind === "layout") {
    return dir || BASE;
  }
  return kind === "page" ? `${PAGE}${dir}` : null;
};

/** Whether the family `family` loads for the page in `page`: `base` for all, a layout for the pages under it. */
const covers = (family: string, page: string): boolean =>
  family === BASE ||
  (family.startsWith(PAGE)
    ? family === `${PAGE}${page}`
    : page === family || page.startsWith(`${family}/`));

/** `families` without one a layout among them covers: each page that loads it loads that layout too. */
const outermost = (families: Set<string>): string[] =>
  [...families].filter(
    (family) =>
      ![...families].some(
        (other) =>
          other !== family &&
          !other.startsWith(PAGE) &&
          covers(other, family.replace(PAGE, ""))
      )
  );

/**
 * Where a module goes, by the families that load it: its chunk's name and
 * how many pages load that chunk; null for the automatic splitting.
 */
const placerOf = (
  families: string[],
  pages: Set<string>,
  entries: number
): ((loaders: Set<string>) => { name: string; pages: number } | null) => {
  const layouts = families.filter(
    (family) => family !== BASE && !family.startsWith(PAGE)
  );
  const nested = layouts.filter((layout) =>
    layouts.some((other) => other !== layout && covers(other, layout))
  );
  /** The innermost nested layout over `page`, if any. */
  const sectionOf = (page: string): string | undefined =>
    nested
      .filter((layout) => covers(layout, page))
      .sort((a, b) => b.length - a.length)[0];
  return (loaders) => {
    if (loaders.has(BASE)) {
      return { name: BASE, pages: entries + 1 };
    }
    const shared = loaders.size > 1;
    const kept = outermost(
      new Set(
        [...loaders].map(
          (family) =>
            (shared &&
              family.startsWith(PAGE) &&
              sectionOf(family.slice(PAGE.length))) ||
            family
        )
      )
    );
    // Only pages: their own code, the automatic splitting's.
    if (kept.every((family) => family.startsWith(PAGE))) {
      return null;
    }
    return {
      name: chunkName(kept),
      pages: [...pages].filter((page) =>
        kept.some((family) => covers(family, page))
      ).length,
    };
  };
};

/** The module graph as the build has it, the parts read here. */
interface Graph {
  getModuleIds: () => IterableIterator<string>;
  getModuleInfo: (
    id: string
  ) => { importedIds: readonly string[]; isEntry: boolean } | null;
}

/**
 * Each family's first modules (Kit's runtime entries for `base`, and the
 * route files its node entries import), and every page's directory.
 */
const rootsOf = (
  graph: Graph,
  routesDir: string
): { pages: Set<string>; roots: Map<string, string[]> } => {
  const roots = new Map<string, string[]>();
  // A page's node may import its `+page.ts` and its `+page.svelte`.
  const pages = new Set<string>();
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
      const file = relative(routesDir, imported).split("\\").join("/");
      const route = routeOf(file);
      if (route?.kind === "page") {
        pages.add(route.dir);
      }
      const family = familyOf(file);
      if (family) {
        root(family, imported);
      }
    }
  }
  return { pages, roots };
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
  /** Each captured module's chunk: its loaders' names, and how many pages load it. */
  const chunkOf = new Map<string, { name: string; pages: number }>();
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
      // `base`'s page count is one above every other's: each route loads it.
      const groups = Array.from({ length: entries + 1 }, (_, at) => {
        const pages = entries + 1 - at;
        return {
          name: (id: string) => {
            const chunk = chunkOf.get(id);
            return chunk?.pages === pages ? chunk.name : null;
          },
          debugName: `first paint, ${pages} pages`,
          priority: pages,
        };
      });
      return {
        ...options,
        codeSplitting: { ...own, groups: [...(own.groups ?? []), ...groups] },
      };
    },
    buildEnd() {
      chunkOf.clear();
      const { pages, roots } = rootsOf(this, routesDir);
      if (!roots.has(BASE)) {
        this.error("first-paint chunks: Kit's runtime entries were not found");
      }
      const place = placerOf([...roots.keys()], pages, entries);
      for (const [id, loaders] of loadersOf(this, roots)) {
        const chunk = place(loaders);
        if (chunk) {
          chunkOf.set(id, chunk);
        }
      }
    },
  };
};
