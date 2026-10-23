/** Signed release discovery and immutable archive verification. */
import { createHash } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { Octokit } from "@octokit/rest";
import type { BinaryUpdatePolicy } from "./binary-updates";
import { readWithin } from "./bounded";
import { type ReleaseManifest, verifyManifest } from "./release-manifest";
import { writeStateFile } from "./state-file";

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

const NIGHTLY_VERSION = /-nightly\.(\d+)\+([0-9a-f]+)$/;
const NIGHTLY_TAG = /^nightly-(\d+)-[0-9a-f]+$/;
const TRAILING_SLASH = /\/$/;

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

/** How long one read of the release host is given, its body with it. */
const RELEASE_HOST_MS = 15_000;
/** How long an archive download is given, its body with it. */
const ARCHIVE_MS = 600_000;

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

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

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

/** Reads a body, refusing one longer than the signed size rather than buffering it. */
export async function readAtMost(
  response: Response,
  size: number
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (response.body) {
    for await (const chunk of response.body) {
      total += chunk.byteLength;
      if (total > size) {
        throw new Error("The download is longer than the signed size");
      }
      chunks.push(chunk);
    }
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Whether these bytes are exactly the archive the signed manifest names. */
export function archiveMatches(
  manifest: ReleaseManifest,
  target: string,
  bytes: Uint8Array
): boolean {
  const artifact = manifest.artifacts.find((row) => row.target === target);
  return (
    artifact !== undefined &&
    bytes.byteLength === artifact.size &&
    sha256(bytes) === artifact.sha256
  );
}

/**
 * Each archive being fetched now, by its path: the one read every
 * concurrent ask of it shares ({@link fetchArchive}).
 */
const fetching = new Map<string, Promise<string>>();

/**
 * Downloads one target's archive into `root/<version>/`, verified against the
 * signed manifest, and returns its path. A file already there is trusted only
 * if it still matches. Asks of one archive while it is being fetched share
 * that fetch, its download and its write: three machines of one target
 * updating at once cost the release host one download, not three
 * (2026-10-23: obelisk and both VPSes, linux-x64 each, drew three copies of
 * one 120 MB archive at the same moment).
 */
export function fetchArchive(
  release: LocatedRelease,
  target: string,
  root: string
): Promise<string> {
  const artifact = release.manifest.artifacts.find(
    (row) => row.target === target
  );
  if (!artifact) {
    return Promise.reject(new Error(`This release has no build for ${target}`));
  }
  const dir = join(root, release.manifest.version);
  const path = join(dir, artifact.archive);
  const held = fetching.get(path);
  if (held) {
    return held;
  }
  const fetched = fetchOnce(release, target, artifact, dir, path).finally(() =>
    fetching.delete(path)
  );
  fetching.set(path, fetched);
  return fetched;
}

/** {@link fetchArchive}'s one read of `artifact`: the copy at `path` when it still matches, else the release host's. */
async function fetchOnce(
  release: LocatedRelease,
  target: string,
  artifact: ReleaseManifest["artifacts"][number],
  dir: string,
  path: string
): Promise<string> {
  await mkdir(dir, { recursive: true });
  if (
    (await Bun.file(path).exists()) &&
    (await stat(path)).size === artifact.size &&
    archiveMatches(release.manifest, target, await Bun.file(path).bytes())
  ) {
    return path;
  }
  const source = new URL(artifact.archive, release.assetBaseUrl);
  const bytes = await fromReleaseHost(
    ARCHIVE_MS,
    `the download of ${source.href}`,
    async (signal) => {
      const response = await fetch(source, { signal });
      if (!response.ok) {
        throw new Error(`The archive download answered ${response.status}`);
      }
      return readAtMost(response, artifact.size);
    }
  );
  if (!archiveMatches(release.manifest, target, bytes)) {
    throw new Error(
      "The downloaded archive does not match the signed manifest"
    );
  }
  await writeStateFile(path, bytes);
  return path;
}
