/**
 * Resolving a fleet plugin to its files, at the hub, once for every machine.
 *
 * The rest of the fleet already works this way — skills.ts says it outright:
 * "an installer CLI is a wrapper around copying a directory, so cawco runs
 * none of them". Plugins were the exception. Sync told every machine to run
 * `claude plugin install`, and that command goes to the network: it reads the
 * marketplace's manifest, finds `{ "source": "github", "repo": "owner/name" }`,
 * and clones. Four things follow, and all four are real:
 *
 *  - a machine whose `gh` is not logged in resolves that to ssh and is refused
 *    a repository the whole internet can read;
 *  - if the upstream repo is deleted or made private, every machine that has
 *    not installed it yet is stuck, and the fleet is permanently split;
 *  - a plugin that is not on github at all cannot be carried;
 *  - and nothing makes two machines agree. The manifest pins `"ref": "main"`,
 *    a moving target, so machines syncing a week apart install different code
 *    and both report `applied`.
 *
 * So the hub resolves the content itself and sync carries the bytes. A machine
 * writes them into a marketplace of its own and installs from that directory,
 * which is a form the CLI already supports (a plugin `source` may be a path
 * relative to its marketplace, which is how the official marketplace vendors
 * its own). The CLI still registers the plugin — cawco does not pretend to
 * own `installed_plugins.json` — but it no longer fetches anything.
 */

import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  FleetPluginPayload,
  MarketplacePluginInfo,
} from "@cawco/core/fleet";
import { Effect } from "effect";
import {
  array,
  type InferOutput,
  is,
  looseObject,
  optional,
  record,
  safeParse,
  string,
  unknown,
} from "valibot";
import { pluginVersion } from "./fleet-versions";
import {
  downloadRepo,
  FetchFailed,
  fetchStep,
  get,
  readTree,
  unpack,
} from "./skills";

/** `owner/repo` as a marketplace source names it, with an optional `@ref`. */
const GITHUB_SLUG = /^([\w.-]+)\/([\w.-]+?)(?:@([\w./-]+))?$/u;
const HTTP_URL_PREFIX = /^https?:\/\//u;
const LEADING_SLASHES = /^\/+/u;
const DOT_GIT_SUFFIX = /\.git$/u;

/**
 * A path inside a downloaded tree, refused if it climbs out of it. The manifest
 * is fetched from the internet, so `../../` in a source is a file the hub would
 * read off its own disk and hand to every machine in the fleet.
 */
const inside = (
  root: string,
  rel: string
): Effect.Effect<string, FetchFailed> => {
  const joined = normalize(join(root, rel));
  return joined.startsWith(normalize(root))
    ? Effect.succeed(joined)
    : Effect.fail(
        new FetchFailed({ message: `${rel} points outside the marketplace` })
      );
};

/** `href` as a URL, or the sentence saying it is none. */
const urlOf = (href: string): Effect.Effect<URL, FetchFailed> =>
  Effect.try({
    try: () => new URL(href),
    catch: () => new FetchFailed({ message: `${href} is not a URL` }),
  });

/** What a marketplace's manifest says, of the parts that matter here: each plugin's facts, and its source as written, read where it resolves. */
const Manifest = looseObject({
  name: optional(unknown()),
  plugins: optional(
    array(
      looseObject({
        category: optional(string()),
        description: optional(string()),
        name: string(),
        source: optional(unknown()),
        version: optional(string()),
      })
    )
  ),
});
type Manifest = InferOutput<typeof Manifest>;

/** A plugin source that is not a path: an object naming its kind (github, url, git-subdir) and where. */
const SourceSpec = record(string(), unknown());

/** `read` as a manifest, or undefined when it is none. */
const manifestOf = (read: unknown): Manifest | undefined => {
  const parsed = safeParse(Manifest, read);
  return parsed.success ? parsed.output : undefined;
};

/** The manifest at a marketplace's root, as Claude Code reads it, or undefined. */
const readManifest = async (root: string): Promise<Manifest | undefined> =>
  manifestOf(
    await Bun.file(join(root, ".claude-plugin", "marketplace.json"))
      .json()
      .catch(() => undefined)
  );

/**
 * Why a plugin of a marketplace added by its marketplace.json URL cannot have
 * a relative source, in the docs' words
 * (https://code.claude.com/docs/en/plugin-marketplaces).
 */
const URL_RELATIVE_REASON =
  "relative paths won't resolve, because only that file is downloaded " +
  "(a marketplace added by its marketplace.json URL; give the plugin a " +
  "github, url or git-subdir source)";

/** A source that is the URL of a marketplace.json itself, not of a repository. */
const isManifestUrl = (source: string): boolean =>
  HTTP_URL_PREFIX.test(source) && new URL(source).pathname.endsWith(".json");

/**
 * A marketplace as fetched: its manifest, and the directory it stands in.
 * A marketplace.json URL has no directory: "URL-based marketplaces only
 * download the `marketplace.json` file itself. They don't download plugin
 * files from the server" (https://code.claude.com/docs/en/plugin-marketplaces),
 * so neither does the hub, and a plugin there resolves only from a source of
 * its own.
 */
interface Fetched {
  manifest: Manifest;
  root?: string;
}

const fetchMarketplace = (
  source: string,
  work: string
): Effect.Effect<Fetched, FetchFailed> =>
  Effect.gen(function* () {
    const trimmed = source.trim();
    if (isManifestUrl(trimmed)) {
      const response = yield* get(trimmed);
      if (!response.ok) {
        return yield* new FetchFailed({
          message: `${trimmed} answered ${response.status}`,
        });
      }
      const manifest = manifestOf(
        yield* Effect.promise(() => response.json().catch(() => undefined))
      );
      if (!manifest) {
        return yield* new FetchFailed({
          message: `${trimmed} is not a marketplace.json cawco could read`,
        });
      }
      return { manifest };
    }
    const root = yield* marketplaceRoot(trimmed, work);
    const manifest = yield* Effect.promise(() => readManifest(root));
    if (!manifest) {
      return yield* new FetchFailed({
        message: `${source} has no .claude-plugin/marketplace.json cawco could read`,
      });
    }
    return { manifest, root };
  });

/**
 * A fetch of the marketplace in a work directory of its own, gone once `use`
 * ends, however it ends: failed or interrupted too.
 */
const withMarketplace = <T>(
  source: string,
  use: (fetched: Fetched, work: string) => Effect.Effect<T, FetchFailed>
): Effect.Effect<T, FetchFailed> =>
  Effect.acquireUseRelease(
    fetchStep(() => mkdtemp(join(tmpdir(), "cawco-marketplace-"))),
    (work) =>
      fetchMarketplace(source, work).pipe(
        Effect.flatMap((fetched) => use(fetched, work))
      ),
    (work) => Effect.promise(() => rm(work, { recursive: true, force: true }))
  );

/** The directory a hub-directory source names, or undefined for any other form. */
const hubPath = (source: string): string | undefined => {
  const trimmed = source.trim();
  const path = trimmed.startsWith("file://") ? fileURLToPath(trimmed) : trimmed;
  return isAbsolute(path) ? path : undefined;
};

/**
 * A marketplace linked from a directory on the hub's own disk. It is read
 * where it stands, on every resolve, so a refresh picks up whatever the
 * directory holds now. The hub reads it and sync carries the bytes, so a
 * machine that has no such directory still gets them.
 */
const localRoot = async (source: string): Promise<string | undefined> => {
  const path = hubPath(source);
  if (!path) {
    return undefined;
  }
  const found = await stat(path).catch(() => undefined);
  if (!found?.isDirectory()) {
    throw new Error(`${path} is not a directory on the hub`);
  }
  return normalize(path);
};

/**
 * The marketplace, as a directory. Sources the hub understands are the ones
 * `claude plugin marketplace add` takes: an `owner/repo` slug, a git URL, and
 * a local directory (absolute, or `file://`, since the hub has no working
 * directory a relative path could mean). The manifest is read from the root,
 * `.claude-plugin/marketplace.json`, as Claude Code reads it.
 */
const marketplaceRoot = (
  source: string,
  work: string
): Effect.Effect<string, FetchFailed> =>
  Effect.gen(function* () {
    const trimmed = source.trim();
    const local = yield* fetchStep(() => localRoot(trimmed));
    if (local) {
      return local;
    }
    const slug = GITHUB_SLUG.exec(trimmed);
    if (slug?.[1] && slug[2]) {
      return yield* downloadRepo(slug[1], slug[2], slug[3], work);
    }

    const url = HTTP_URL_PREFIX.test(trimmed)
      ? yield* urlOf(trimmed)
      : undefined;
    if (url?.hostname === "github.com") {
      const [owner, repo] = url.pathname
        .replace(LEADING_SLASHES, "")
        .replace(DOT_GIT_SUFFIX, "")
        .split("/");
      if (owner && repo) {
        return yield* downloadRepo(owner, repo, undefined, work);
      }
    }
    if (url) {
      const response = yield* get(url.href);
      if (!response.ok) {
        return yield* new FetchFailed({
          message: `${url.href} answered ${response.status}`,
        });
      }
      return yield* unpack(response, work, url.pathname);
    }
    return yield* new FetchFailed({
      message:
        `${source} is not a marketplace source cawco knows how to fetch — ` +
        "give owner/repo, a git URL, or an absolute directory path on the hub",
    });
  });

/**
 * Where one plugin's files are, given how its manifest entry names them. Every
 * form ends as a directory on this disk, because that is what sync ships.
 */
const pluginRoot = (
  entry: { name?: string; source?: unknown },
  marketplace: string | undefined,
  work: string
): Effect.Effect<string, FetchFailed> => {
  const { source } = entry;
  // Vendored: a path relative to the marketplace, already downloaded.
  if (typeof source === "string") {
    return vendoredRoot(entry.name, source, marketplace);
  }
  if (!is(SourceSpec, source)) {
    return failed(`${entry.name} has no source cawco can read`);
  }
  const kind = typeof source.source === "string" ? source.source : undefined;
  if (kind === "github" && typeof source.repo === "string") {
    return githubRoot(entry.name, source.repo, source.ref, work);
  }
  // `git-subdir` and `url` both name an archive; the first also names a path in it.
  const href = typeof source.url === "string" ? source.url : undefined;
  if ((kind === "git-subdir" || kind === "url") && href) {
    return archiveRoot(href, source, work);
  }
  return failed(
    `${entry.name}'s source kind "${kind ?? "unknown"}" is not one cawco fetches`
  );
};

/** A plugin's source refused, in its sentence. */
const failed = (message: string): Effect.Effect<never, FetchFailed> =>
  Effect.fail(new FetchFailed({ message }));

/** A scratch directory of its own under `work`, for one plugin's download. */
const scratchIn = (work: string): Effect.Effect<string, FetchFailed> =>
  fetchStep(() => mkdtemp(join(work, "p-")));

/** A plugin vendored in its marketplace, at a path relative to it. */
const vendoredRoot = (
  name: string | undefined,
  path: string,
  marketplace: string | undefined
): Effect.Effect<string, FetchFailed> => {
  if (isAbsolute(path)) {
    return failed(`${name}'s source is an absolute path`);
  }
  if (!marketplace) {
    return failed(
      `${name}'s source is the relative path ${path}, and ${URL_RELATIVE_REASON}`
    );
  }
  return inside(marketplace, path);
};

/** A plugin whose source is a GitHub repository, `owner/name`, at its ref. */
const githubRoot = (
  name: string | undefined,
  slug: string,
  ref: unknown,
  work: string
): Effect.Effect<string, FetchFailed> => {
  const [owner, repo] = slug.split("/");
  if (!(owner && repo)) {
    return failed(`${name}'s repo "${slug}" is not owner/name`);
  }
  return scratchIn(work).pipe(
    Effect.flatMap((into) =>
      downloadRepo(owner, repo, typeof ref === "string" ? ref : undefined, into)
    )
  );
};

/** A plugin whose source is an archive at `href`, its files at `source.path` in it when it names one. */
const archiveRoot = (
  href: string,
  source: Record<string, unknown>,
  work: string
): Effect.Effect<string, FetchFailed> =>
  Effect.gen(function* () {
    const into = yield* scratchIn(work);
    const url = yield* urlOf(href);
    let root: string;
    if (url.hostname === "github.com") {
      const [owner, repo] = url.pathname
        .replace(LEADING_SLASHES, "")
        .replace(DOT_GIT_SUFFIX, "")
        .split("/");
      if (!(owner && repo)) {
        return yield* failed(`${href} is not a github repository`);
      }
      const ref = typeof source.sha === "string" ? source.sha : undefined;
      root = yield* downloadRepo(owner, repo, ref, into);
    } else {
      const response = yield* get(href);
      if (!response.ok) {
        return yield* failed(`${href} answered ${response.status}`);
      }
      root = yield* unpack(response, into, url.pathname);
    }
    const path = typeof source.path === "string" ? source.path : undefined;
    return path ? yield* inside(root, path) : root;
  });

/**
 * A marketplace read from its source, one download: what it calls itself and
 * what it offers.
 *
 * The name is the `name` of its own `marketplace.json`. That is the one name
 * the fleet knows it by, because it is the only one Claude Code addresses it
 * by — "Marketplace identifier … users see it when installing plugins (for
 * example, `/plugin install my-tool@your-marketplace`). Each user can
 * register only one marketplace per name"
 * (https://code.claude.com/docs/en/plugin-marketplaces). The CLI registers it
 * under that name, clones it into a folder of that name, and installs its
 * plugins as `plugin@name`, so a row under any other name is one no machine
 * can find.
 *
 * The plugins are what Browse lists. Fetched the way every install is
 * resolved ({@link resolveMarketplacePlugins}), so the list is what an
 * install gets, whichever machine has a copy — a marketplace that is a
 * directory on the hub has none anywhere else.
 */
export const readMarketplace = (
  source: string
): Effect.Effect<
  { name: string; plugins: MarketplacePluginInfo[] },
  FetchFailed
> =>
  withMarketplace(source, ({ manifest }) => {
    const name = typeof manifest.name === "string" ? manifest.name.trim() : "";
    if (!name) {
      return Effect.fail(
        new FetchFailed({
          message: `${source}'s marketplace.json has no name`,
        })
      );
    }
    return Effect.succeed({
      name,
      plugins: (manifest.plugins ?? []).map(
        ({ name: plugin, description, version, category }) => ({
          name: plugin,
          description,
          version,
          category,
        })
      ),
    });
  });

/**
 * One resolved plugin, with the version it declares (fleet-versions.ts
 * `pluginVersion`), or the sentence saying why it is not.
 */
export type ResolvedPlugin =
  FleetPluginPayload | { name: string; error: string };

/**
 * Every wanted plugin of one marketplace, resolved to files.
 *
 * The marketplace is downloaded once and every plugin read out of it, because
 * the common case — a marketplace that vendors its plugins, or names them by
 * relative path — is then a single fetch for the whole set.
 */
export const resolveMarketplacePlugins = (
  marketplace: string,
  marketplaceSource: string,
  names: readonly string[]
): Effect.Effect<ResolvedPlugin[]> =>
  names.length === 0
    ? Effect.succeed([])
    : withMarketplace(marketplaceSource, ({ manifest, root }, work) =>
        Effect.forEach(names, (name): Effect.Effect<ResolvedPlugin> => {
          const entry = manifest.plugins?.find(
            (plugin) => plugin.name === name
          );
          if (!entry) {
            return Effect.succeed({
              name,
              error: `${marketplaceSource} lists no plugin called ${name}`,
            });
          }
          return pluginRoot(entry, root, work).pipe(
            Effect.flatMap((dir) => fetchStep(() => readTree(dir))),
            Effect.map(({ files, hash, bytes }): ResolvedPlugin => {
              const version = pluginVersion(files, entry.version);
              return {
                name,
                marketplace,
                hash,
                bytes,
                files,
                ...(version ? { version } : {}),
              };
            }),
            Effect.catchTag("FetchFailed", ({ message }) =>
              Effect.succeed({ name, error: message })
            )
          );
        })
      ).pipe(
        Effect.catchTag("FetchFailed", ({ message }) =>
          Effect.succeed(names.map((name) => ({ name, error: message })))
        )
      );
