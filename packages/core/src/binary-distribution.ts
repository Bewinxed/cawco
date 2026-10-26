/** Signed release discovery and immutable archive verification. */
import { mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { Octokit } from "@octokit/rest";
import type { BinaryUpdatePolicy } from "./binary-updates";
import { readWithin } from "./bounded";
import { type ReleaseManifest, verifyManifest } from "./release-manifest";
import {
  type DownloadProgress,
  downloadResumably,
  fileMatches,
} from "./resumable-download";
import { downloadWords } from "./words/downloads";

export interface SignedRelease {
  manifest: ReleaseManifest;
  /** Base64 DER ECDSA signature over the manifest's exact JSON. */
  signature: string;
}
export interface LocatedRelease extends SignedRelease {
  /** Directory URL the archives sit beside the manifest in. */
  assetBaseUrl: string;
}

interface GithubRelease {
  assets: { browser_download_url: string; name: string }[];
  draft: boolean;
  prerelease: boolean;
  tag_name: string;
}

const NIGHTLY_VERSION = /-nightly\.(\d+)\+([0-9a-f]+)$/u;
const NIGHTLY_TAG = /^nightly-(\d+)-[0-9a-f]+$/u;
const TRAILING_SLASH = /\/$/u;

export const RELEASE_REPOSITORY = "Bewinxed/cawco";
export const NIGHTLY_TAG_PREFIX = "nightly-";

/** The release repository as Octokit names it. */
const RELEASES = (() => {
  const [owner = "", repo = ""] = RELEASE_REPOSITORY.split("/");
  return { owner, repo };
})();

/** The build count a nightly tag (`nightly-<count>-<commit>`) carries, or undefined for any other tag. */
function nightlyTagCount(tag: string): number | undefined {
  const count = NIGHTLY_TAG.exec(tag)?.[1];
  return count === undefined ? undefined : Number(count);
}

/**
 * How long one read of the release host's metadata is given, its body with
 * it: a tag list, a release, a manifest and its signature, each a few KB.
 * An archive has no such deadline ({@link archiveFor}).
 */
const RELEASE_HOST_MS = 15_000;

/**
 * One read of the release host within `ms`. A host that did not answer in
 * time throws saying so: never read as a host with no release.
 */
async function fromReleaseHost<T>(
  ms: number,
  what: string,
  read: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const got = await readWithin(ms, read);
  switch (got.kind) {
    case "answered":
      return got.value;
    case "unanswered":
      throw new Error(
        `The release host did not answer ${what} within ${Math.round(got.after / 1000)}s`
      );
    default: {
      const unhandled: never = got;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
}

/**
 * One read of the release repository through Octokit, signed in as no one
 * (it is public): its data, or undefined where GitHub answered 404. Octokit
 * throws any other refusal with its status (@octokit/request-error
 * `RequestError`).
 */
function github<T>(
  what: string,
  ask: (
    octokit: Octokit,
    request: { signal: AbortSignal }
  ) => Promise<{ data: T }>
): Promise<T | undefined> {
  return fromReleaseHost(
    RELEASE_HOST_MS,
    what,
    async (signal): Promise<T | undefined> => {
      try {
        return (await ask(new Octokit({ userAgent: "CawCo" }), { signal }))
          .data;
      } catch (error) {
        const refused = error as { response?: unknown; status?: unknown };
        if (typeof refused.status === "number" && refused.response) {
          if (refused.status === 404) {
            return;
          }
          throw new Error(`The release host answered ${refused.status}`, {
            cause: error,
          });
        }
        throw error;
      }
    }
  );
}

/**
 * The newest nightly: of the repository's `nightly-<count>-<commit>` tags,
 * highest count first, the first whose release is published and a
 * pre-release. The tag listing is complete and unpaged, and its size grows
 * with the tags alone, not with release notes; release-by-tag serves
 * published releases only, so a draft answers 404 and the next tag is tried.
 * The install script's shell pick mirrors this rule.
 */
async function newestNightly(): Promise<GithubRelease | undefined> {
  const refs =
    (await github("the release tags", (octokit, request) =>
      octokit.rest.git.listMatchingRefs({
        ...RELEASES,
        ref: `tags/${NIGHTLY_TAG_PREFIX}`,
        request,
      })
    )) ?? [];
  const tags = refs
    .map(({ ref }) => ref.slice("refs/tags/".length))
    .flatMap((tag) => {
      const count = nightlyTagCount(tag);
      return count === undefined ? [] : [{ tag, count }];
    })
    .sort((a, b) => b.count - a.count);
  for (const { tag } of tags) {
    // biome-ignore lint/performance/noAwaitInLoops: highest count first; the first published pre-release ends the search
    const release: GithubRelease | undefined = await github(
      `the release ${tag}`,
      (octokit, request) =>
        octokit.rest.repos.getReleaseByTag({ ...RELEASES, tag, request })
    );
    if (release && !release.draft && release.prerelease) {
      return release;
    }
  }
  return undefined;
}

/**
 * The release tag of a build: `v<version>` for stable, and for a nightly the
 * build count and commit (`0.1.0-nightly.1810+abc` is `nightly-1810-abc`), which
 * keeps nightly tags out of the `v*` namespace stable releases own.
 */
export function releaseTag(manifest: ReleaseManifest): string {
  if (manifest.channel === "stable") {
    return `v${manifest.version}`;
  }
  const [, count, commit] = NIGHTLY_VERSION.exec(manifest.version) ?? [];
  if (!(count && commit)) {
    throw new Error(`Not a nightly version: ${manifest.version}`);
  }
  return `${NIGHTLY_TAG_PREFIX}${count}-${commit}`;
}

/**
 * The newest published release of a channel, signature checked and channel
 * confirmed. `host` names a mirror laid out as `<host>/<channel>/release.json`;
 * without it the GitHub release host is read.
 */
/** The release host answered, and has no release for the channel. */
export class NoReleaseError extends Error {}

export async function discoverRelease(
  channel: BinaryUpdatePolicy["channel"],
  host?: string
): Promise<LocatedRelease> {
  let manifestUrl: string;
  let signatureUrl: string;
  if (host) {
    const base = `${host.replace(TRAILING_SLASH, "")}/${channel}`;
    manifestUrl = `${base}/release.json`;
    signatureUrl = `${base}/release.json.sig`;
  } else {
    const release =
      channel === "stable"
        ? await github("the latest release", (octokit, request) =>
            octokit.rest.repos.getLatestRelease({ ...RELEASES, request })
          )
        : await newestNightly();
    if (!release) {
      throw new NoReleaseError(`No published ${channel} release`);
    }
    const manifest = release.assets.find((a) => a.name === "release.json");
    const signature = release.assets.find((a) => a.name === "release.json.sig");
    if (!(manifest && signature)) {
      throw new NoReleaseError(
        `No published ${channel} release with a signed manifest`
      );
    }
    manifestUrl = manifest.browser_download_url;
    signatureUrl = signature.browser_download_url;
  }
  const { manifest, signature } = await fromReleaseHost(
    RELEASE_HOST_MS,
    `${manifestUrl} and its signature`,
    async (signal) => {
      const [manifestResponse, signatureResponse] = await Promise.all([
        fetch(manifestUrl, { signal }),
        fetch(signatureUrl, { signal }),
      ]);
      if (host && manifestResponse.status === 404) {
        throw new NoReleaseError(`No published ${channel} release`);
      }
      if (!(manifestResponse.ok && signatureResponse.ok)) {
        throw new Error(
          "The release manifest or its signature could not be read"
        );
      }
      return {
        manifest: (await manifestResponse.json()) as ReleaseManifest,
        signature: (await signatureResponse.text()).trim(),
      };
    }
  );
  verifyManifest(manifest, signature);
  if (manifest.channel !== channel) {
    throw new Error(`The signed release belongs to ${manifest.channel}`);
  }
  return {
    manifest,
    signature,
    assetBaseUrl: manifestUrl.slice(0, manifestUrl.lastIndexOf("/") + 1),
  };
}

/** Where a release's archives are: beside a mirror's manifest, or under its GitHub release tag. */
export function assetBase(
  manifest: ReleaseManifest,
  releaseHost?: string
): string {
  return releaseHost
    ? `${releaseHost.replace(TRAILING_SLASH, "")}/${manifest.channel}/`
    : `https://github.com/${RELEASE_REPOSITORY}/releases/download/${releaseTag(manifest)}/`;
}

/** Where the hub stands with one archive, as a machine's ask of it is answered. */
export type ArchiveHeld =
  /** On disk, whole and verified: served from `path`. */
  | { kind: "held"; path: string }
  /** Being fetched from the release host now: how far it is. */
  | { kind: "fetching"; received: number; total: number }
  /** The last fetch gave up or was refused, within {@link FAILURE_KEPT_MS}: why. */
  | { kind: "failed"; error: string };

/** One fetch from the release host, shared by every ask of its archive while it runs. */
interface Fetch {
  /** Settles once the copy on disk has been looked at: the first ask is answered after it, so an archive already held is served at once. */
  looked: Promise<null>;
  progress: DownloadProgress;
}

/**
 * How long a failed fetch is the answer to every ask of its archive before
 * an ask starts the next one: as long as an agent waits before its own
 * first retry (agent binary-update.ts `RETRY_DELAYS_MIN`), so the agents
 * that waited on the failed fetch each hear why, rather than the first
 * starting another under the rest.
 */
const FAILURE_KEPT_MS = 60_000;

/** Each archive being fetched now, by its path ({@link archiveFor}). */
const fetching = new Map<string, Fetch>();
/** Each archive this process has verified whole on disk, by its path. */
const held = new Set<string>();
/** Each archive whose last fetch failed: why, and when. */
const failed = new Map<string, { at: number; error: string }>();

/**
 * Where the hub stands with one target's archive, kept in `root/<version>/`
 * and verified against the signed manifest: held, being fetched, or failed.
 * An ask while nothing holds or fetches it starts the one fetch every ask
 * shares: three machines of one target updating at once cost the release
 * host one download, not three (2026-10-23: obelisk and both VPSes,
 * linux-x64 each, drew three copies of one 120 MB archive at the same
 * moment). Nothing here waits on the download: a machine is answered at
 * once, and asks again while it runs.
 *
 * The fetch streams to `<archive>.partial` ({@link downloadResumably}),
 * attempt after attempt while each brings bytes, and goes on from that
 * file after a fetch that gave up, in this process or the one before. The
 * whole file takes the archive's name only once it matches the signed
 * manifest; one that does not is deleted. `say` takes each log line.
 */
export async function archiveFor(
  release: LocatedRelease,
  target: string,
  root: string,
  say: (line: string) => void
): Promise<ArchiveHeld> {
  const artifact = release.manifest.artifacts.find(
    (row) => row.target === target
  );
  if (!artifact) {
    throw new Error(`This release has no build for ${target}`);
  }
  const dir = join(root, release.manifest.version);
  const path = join(dir, artifact.archive);
  const standing = (): ArchiveHeld | undefined => {
    if (held.has(path)) {
      return { kind: "held", path };
    }
    const going = fetching.get(path);
    if (going) {
      return { kind: "fetching", ...going.progress };
    }
    const last = failed.get(path);
    if (last && Date.now() - last.at < FAILURE_KEPT_MS) {
      return { kind: "failed", error: last.error };
    }
    return undefined;
  };
  if (held.has(path) && !(await Bun.file(path).exists())) {
    // Pruned since it was verified.
    held.delete(path);
  }
  const now = standing();
  if (now) {
    return now;
  }
  failed.delete(path);
  const { promise: lookedAt, resolve: looked } = Promise.withResolvers<null>();
  const entry: Fetch = {
    looked: lookedAt,
    progress: { received: 0, total: artifact.size },
  };
  fetching.set(path, entry);
  const source = new URL(artifact.archive, release.assetBaseUrl);
  const what = `${artifact.archive} from ${source.origin}`;
  (async () => {
    await mkdir(dir, { recursive: true });
    if (await fileMatches(path, artifact.size, artifact.sha256)) {
      return;
    }
    looked(null);
    const partial = `${path}.partial`;
    await downloadResumably({
      url: source.href,
      partial,
      size: artifact.size,
      what,
      log: say,
      onProgress: (progress) => {
        entry.progress = progress;
      },
    });
    if (!(await fileMatches(partial, artifact.size, artifact.sha256))) {
      await rm(partial, { force: true });
      throw new Error(downloadWords.mismatch(what));
    }
    await rename(partial, path);
  })()
    .then(
      () => {
        held.add(path);
      },
      (error: unknown) => {
        const said = error instanceof Error ? error.message : String(error);
        say(
          `the hub could not fetch ${artifact.archive} of ${release.manifest.version} from its release host: ${said}`
        );
        failed.set(path, { at: Date.now(), error: said });
      }
    )
    .finally(() => {
      fetching.delete(path);
      looked(null);
    });
  await entry.looked;
  return standing() ?? { kind: "fetching", ...entry.progress };
}

/** How long a machine waits before it asks again for an archive its hub is still fetching: the hub's 503 `Retry-After`. */
export const ARCHIVE_ASK_AGAIN_S = 5;

/** The hub's answer (503) to an ask of an archive it is still fetching from its release host: how far it is. */
export interface ArchiveFetching {
  fetching: DownloadProgress;
}
