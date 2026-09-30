/**
 * Resolving a fleet plugin to its files, at the hub, once for every machine.
 *
 * The rest of the fleet already works this way — skills.ts says it outright:
 * "an installer CLI is a wrapper around copying a directory, so whiffle runs
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
 * its own). The CLI still registers the plugin — whiffle does not pretend to
 * own `installed_plugins.json` — but it no longer fetches anything.
 */

import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import type { FleetPluginPayload, MarketplacePluginInfo } from "@whiffle/core";
import { downloadRepo, get, readTree, unpack } from "./skills";

/** `owner/repo` as a marketplace source names it, with an optional `@ref`. */
const GITHUB_SLUG = /^([\w.-]+)\/([\w.-]+?)(?:@([\w./-]+))?$/;
const HTTP_URL_PREFIX = /^https?:\/\//;
const LEADING_SLASHES = /^\/+/;
const DOT_GIT_SUFFIX = /\.git$/;

/** A plugin id is `name@marketplace`; the name is what the manifest lists. */
export const pluginName = (id: string): string => id.split("@")[0] ?? id;
export const pluginMarketplace = (id: string): string => id.split("@")[1] ?? "";

/**
 * A path inside a downloaded tree, refused if it climbs out of it. The manifest
 * is fetched from the internet, so `../../` in a source is a file the hub would
 * read off its own disk and hand to every machine in the fleet.
 */
const inside = (root: string, rel: string): string => {
  const joined = normalize(join(root, rel));
  if (!joined.startsWith(normalize(root))) {
    throw new Error(`${rel} points outside the marketplace`);
  }
  return joined;
};

/** What a marketplace's manifest says, of the parts that matter here. */
interface Manifest {
  plugins?: (MarketplacePluginInfo & { source?: unknown })[];
}

/**
 * A marketplace linked from a directory on the hub's own disk: an absolute
 * path or a `file://` URL. It is read where it stands, on every resolve, so a
 * refresh picks up whatever the directory holds now. The hub reads it and sync
 * carries the bytes, so a machine that has no such directory still gets them.
 */
const localRoot = async (source: string): Promise<string | undefined> => {
  const path = source.startsWith("file://") ? fileURLToPath(source) : source;
  if (!isAbsolute(path)) {
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
const marketplaceRoot = async (
  source: string,
  work: string
): Promise<string> => {
  const trimmed = source.trim();
  const local = await localRoot(trimmed);
  if (local) {
    return local;
  }
  const slug = GITHUB_SLUG.exec(trimmed);
  if (slug?.[1] && slug[2]) {
    return await downloadRepo(slug[1], slug[2], slug[3], work);
  }

  const url = HTTP_URL_PREFIX.test(trimmed) ? new URL(trimmed) : undefined;
  if (url?.hostname === "github.com") {
    const [owner, repo] = url.pathname
      .replace(LEADING_SLASHES, "")
      .replace(DOT_GIT_SUFFIX, "")
      .split("/");
    if (owner && repo) {
      return await downloadRepo(owner, repo, undefined, work);
    }
  }
  if (url) {
    const response = await get(url.href);
    if (!response.ok) {
      throw new Error(`${url.href} answered ${response.status}`);
    }
    return await unpack(response, work, url.pathname);
  }
  throw new Error(
    `${source} is not a marketplace source whiffle knows how to fetch — ` +
      "give owner/repo, a git URL, or an absolute directory path on the hub"
  );
};

/**
 * Where one plugin's files are, given how its manifest entry names them. Every
 * form ends as a directory on this disk, because that is what sync ships.
 */
const pluginRoot = async (
  entry: { name?: string; source?: unknown },
  marketplace: string,
  work: string
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one branch per plugin source kind (vendored path, github repo, git-subdir/url archive) — see the file-level comment on why the hub resolves these itself.
): Promise<string> => {
  const { source } = entry;

  // Vendored: a path relative to the marketplace, already downloaded.
  if (typeof source === "string") {
    if (isAbsolute(source)) {
      throw new Error(`${entry.name}'s source is an absolute path`);
    }
    return inside(marketplace, source);
  }
  if (!source || typeof source !== "object") {
    throw new Error(`${entry.name} has no source whiffle can read`);
  }
  const spec = source as Record<string, unknown>;
  const kind = typeof spec.source === "string" ? spec.source : undefined;

  if (kind === "github" && typeof spec.repo === "string") {
    const [owner, repo] = spec.repo.split("/");
    if (!(owner && repo)) {
      throw new Error(`${entry.name}'s repo "${spec.repo}" is not owner/name`);
    }
    const ref = typeof spec.ref === "string" ? spec.ref : undefined;
    return await downloadRepo(
      owner,
      repo,
      ref,
      await mkdtemp(join(work, "p-"))
    );
  }

  // `git-subdir` and `url` both name an archive; the first also names a path in it.
  const href = typeof spec.url === "string" ? spec.url : undefined;
  if ((kind === "git-subdir" || kind === "url") && href) {
    const scratch = await mkdtemp(join(work, "p-"));
    const url = new URL(href);
    let root: string;
    if (url.hostname === "github.com") {
      const [owner, repo] = url.pathname
        .replace(LEADING_SLASHES, "")
        .replace(DOT_GIT_SUFFIX, "")
        .split("/");
      if (!(owner && repo)) {
        throw new Error(`${href} is not a github repository`);
      }
      const ref = typeof spec.sha === "string" ? spec.sha : undefined;
      root = await downloadRepo(owner, repo, ref, scratch);
    } else {
      const response = await get(href);
      if (!response.ok) {
        throw new Error(`${href} answered ${response.status}`);
      }
      root = await unpack(response, scratch, url.pathname);
    }
    const path = typeof spec.path === "string" ? spec.path : undefined;
    return path ? inside(root, path) : root;
  }

  throw new Error(
    `${entry.name}'s source kind "${kind ?? "unknown"}" is not one whiffle fetches`
  );
};

/** One resolved plugin, or the sentence saying why it is not. */
export type ResolvedPlugin =
  | FleetPluginPayload
  | { name: string; error: string };

/**
 * Every wanted plugin of one marketplace, resolved to files.
 *
 * The marketplace is downloaded once and every plugin read out of it, because
 * the common case — a marketplace that vendors its plugins, or names them by
 * relative path — is then a single fetch for the whole set.
 */
export const resolveMarketplacePlugins = async (
  marketplace: string,
  marketplaceSource: string,
  names: readonly string[]
): Promise<ResolvedPlugin[]> => {
  if (names.length === 0) {
    return [];
  }
  const work = await mkdtemp(join(tmpdir(), "whiffle-plugins-"));
  try {
    const root = await marketplaceRoot(marketplaceSource, work);
    const manifestPath = join(root, ".claude-plugin", "marketplace.json");
    const manifest = (await Bun.file(manifestPath)
      .json()
      .catch(() => undefined)) as Manifest | undefined;
    if (!manifest?.plugins) {
      throw new Error(
        `${marketplaceSource} has no .claude-plugin/marketplace.json whiffle could read`
      );
    }

    const resolved: ResolvedPlugin[] = [];
    for (const name of names) {
      const entry = manifest.plugins.find((plugin) => plugin.name === name);
      if (!entry) {
        resolved.push({
          name,
          error: `${marketplaceSource} lists no plugin called ${name}`,
        });
        continue;
      }
      try {
        // biome-ignore lint/performance/noAwaitInLoops: plugins of one marketplace are fetched one at a time to stay a good citizen of the source (github/CDN) and to keep each plugin's error attributable to its own name.
        const dir = await pluginRoot(entry, root, work);
        const { files, hash, bytes } = await readTree(dir, `plugin ${name}`);
        resolved.push({ name, marketplace, hash, bytes, files });
      } catch (error) {
        resolved.push({
          name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return resolved;
  } catch (error) {
    const said = error instanceof Error ? error.message : String(error);
    return names.map((name) => ({ name, error: said }));
  } finally {
    await rm(work, { recursive: true, force: true });
  }
};
