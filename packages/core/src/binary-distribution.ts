/** Signed release discovery and immutable archive verification. */
import { createHash } from "node:crypto";
import { mkdir, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import type { BinaryUpdatePolicy } from "./binary-updates";
import { type ReleaseManifest, verifyManifest } from "./release-manifest";

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
const TRAILING_SLASH = /\/$/;

export const RELEASE_REPOSITORY = "Bewinxed/cawco";
export const NIGHTLY_TAG_PREFIX = "nightly-";

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
    const api = `https://api.github.com/repos/${RELEASE_REPOSITORY}/releases`;
    const response = await fetch(
      channel === "stable" ? `${api}/latest` : `${api}?per_page=30`,
      {
        headers: { accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(15_000),
      }
    );
    if (response.status === 404) {
      throw new NoReleaseError(`No published ${channel} release`);
    }
    if (!response.ok) {
      throw new Error(`The release host answered ${response.status}`);
    }
    const body = (await response.json()) as GithubRelease | GithubRelease[];
    const release = Array.isArray(body)
      ? body.find(
          (row) =>
            !row.draft &&
            row.prerelease &&
            row.tag_name.startsWith(NIGHTLY_TAG_PREFIX)
        )
      : body;
    const manifest = release?.assets.find((a) => a.name === "release.json");
    const signature = release?.assets.find(
      (a) => a.name === "release.json.sig"
    );
    if (!(manifest && signature)) {
      throw new NoReleaseError(
        `No published ${channel} release with a signed manifest`
      );
    }
    manifestUrl = manifest.browser_download_url;
    signatureUrl = signature.browser_download_url;
  }
  const [manifestResponse, signatureResponse] = await Promise.all([
    fetch(manifestUrl, { signal: AbortSignal.timeout(15_000) }),
    fetch(signatureUrl, { signal: AbortSignal.timeout(15_000) }),
  ]);
  if (host && manifestResponse.status === 404) {
    throw new NoReleaseError(`No published ${channel} release`);
  }
  if (!(manifestResponse.ok && signatureResponse.ok)) {
    throw new Error("The release manifest or its signature could not be read");
  }
  const manifest = (await manifestResponse.json()) as ReleaseManifest;
  const signature = (await signatureResponse.text()).trim();
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
 * Downloads one target's archive into `root/<version>/`, verified against the
 * signed manifest, and returns its path. A file already there is trusted only
 * if it still matches.
 */
export async function fetchArchive(
  release: LocatedRelease,
  target: string,
  root: string
): Promise<string> {
  const artifact = release.manifest.artifacts.find(
    (row) => row.target === target
  );
  if (!artifact) {
    throw new Error(`This release has no build for ${target}`);
  }
  const dir = join(root, release.manifest.version);
  await mkdir(dir, { recursive: true });
  const path = join(dir, artifact.archive);
  if (
    (await Bun.file(path).exists()) &&
    (await stat(path)).size === artifact.size &&
    archiveMatches(release.manifest, target, await Bun.file(path).bytes())
  ) {
    return path;
  }
  const response = await fetch(
    new URL(artifact.archive, release.assetBaseUrl),
    {
      signal: AbortSignal.timeout(600_000),
    }
  );
  if (!response.ok) {
    throw new Error(`The archive download answered ${response.status}`);
  }
  const bytes = await readAtMost(response, artifact.size);
  if (!archiveMatches(release.manifest, target, bytes)) {
    throw new Error(
      "The downloaded archive does not match the signed manifest"
    );
  }
  // Unique per request: concurrent fetches of one archive never share a file.
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  await Bun.write(temporary, bytes);
  await rename(temporary, path);
  return path;
}
