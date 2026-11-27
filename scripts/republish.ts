/**
 * A build that passed but was never published, published from what it left:
 *   bun scripts/republish.ts --version <version> --output /absolute/path
 *
 * release.ts's `promote` moves a proven build into `<output>/<version>`
 * (every archive and its `.sha256`, `SHA256SUMS`, `release.json` and
 * `release.json.sig`, signed) before it publishes, and a
 * publish that fails never reaches the prune, so the folder stays; a failed
 * build's draft is removed on the way out. This publishes that folder as
 * release.ts would have: a draft, every file uploaded, the draft promoted
 * (publish-release.ts) and the hub told (release-announce.ts). Nothing is
 * built or signed. ship.sh `--republish` runs it as a unit of
 * its own.
 *
 * It refuses, in its words and with exit 2, a folder that is missing or
 * incomplete (a file absent, a signature or checksum that does not hold, a
 * test-signed manifest) and a version already published.
 */
import { createReadStream, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { releaseTag } from "../packages/core/src/binary-distribution";
import { RELEASE_PUBLIC_KEY } from "../packages/core/src/release-key";
import {
  type ReleaseManifest,
  verifyManifest,
} from "../packages/core/src/release-manifest";
import {
  createDraft,
  isPublished,
  promoteRelease,
  uploadAssets,
} from "./publish-release";
import { announce } from "./release-announce";

/** Why a republish will not start: said as it is, exit 2. */
export class Refusal extends Error {
  override name = "Refusal";
}

/** The files release.ts's promote leaves beside the archives. */
const MANIFEST_FILES = ["SHA256SUMS", "release.json", "release.json.sig"];
/** A version is one folder's name under the output: no separator, no leading dot. */
const VERSION = /^[\w+-][\w.+-]*$/u;

const sha256Of = async (path: string): Promise<string> => {
  const hasher = new Bun.CryptoHasher("sha256");
  for await (const chunk of createReadStream(path)) {
    hasher.update(chunk as Buffer);
  }
  return hasher.digest("hex");
};

/**
 * The build in `folder`, read and held to its signed manifest: every file
 * there, the signature over `release.json`, the version it names, and each
 * archive's checksum and size. Refuses on the first thing that does not hold.
 */
export async function readBuild(
  folder: string,
  version: string,
  publicKey = RELEASE_PUBLIC_KEY
): Promise<ReleaseManifest> {
  if (!existsSync(folder)) {
    throw new Refusal(
      `there is no build of ${version} at ${folder}: only a build whose publish failed is left there, and the newest two promoted builds`
    );
  }
  const absent = MANIFEST_FILES.filter(
    (name) => !existsSync(join(folder, name))
  );
  if (absent.length > 0) {
    throw new Refusal(
      `${folder} is incomplete: ${absent.join(", ")} missing (promote writes them last; a build that stopped before it is built again)`
    );
  }
  const text = await readFile(join(folder, "release.json"), "utf8");
  const signature = (
    await readFile(join(folder, "release.json.sig"), "utf8")
  ).trim();
  let manifest: ReleaseManifest;
  try {
    manifest = verifyManifest(text, signature, publicKey);
  } catch (error) {
    throw new Refusal(
      `${folder}/release.json does not hold: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
  if (manifest.version !== version) {
    throw new Refusal(
      `${folder}/release.json is the manifest of ${manifest.version}, not ${version}`
    );
  }
  if (manifest.testSigned) {
    throw new Refusal(`${version} is test-signed, and is never published`);
  }
  if (manifest.artifacts.length === 0) {
    throw new Refusal(`${folder}/release.json names no archive`);
  }
  const sums = await readFile(join(folder, "SHA256SUMS"), "utf8");
  const listed = manifest.artifacts
    .map((a) => `${a.sha256}  ${a.archive}\n`)
    .join("");
  if (sums !== listed) {
    throw new Refusal(
      `${folder}/SHA256SUMS does not list the manifest's archives`
    );
  }
  const faults = (
    await Promise.all(
      manifest.artifacts.map(async ({ archive, sha256, size }) => {
        const path = join(folder, archive);
        if (!existsSync(path)) {
          return `${archive} missing`;
        }
        if (!existsSync(`${path}.sha256`)) {
          return `${archive}.sha256 missing`;
        }
        if (Bun.file(path).size !== size) {
          return `${archive} is ${Bun.file(path).size} bytes, the manifest says ${size}`;
        }
        if ((await sha256Of(path)) !== sha256) {
          return `${archive}'s sha256 is not the manifest's`;
        }
      })
    )
  ).filter((fault): fault is string => fault !== undefined);
  if (faults.length > 0) {
    throw new Refusal(`${folder} is incomplete: ${faults.join("; ")}`);
  }
  return manifest;
}

/** The build of `version` in `output` published, as a release run publishes one. */
export async function republish(
  output: string,
  version: string,
  publicKey = RELEASE_PUBLIC_KEY
): Promise<void> {
  if (!VERSION.test(version)) {
    throw new Refusal(`${version} is not a version`);
  }
  const folder = join(output, version);
  const manifest = await readBuild(folder, version, publicKey);
  const tag = releaseTag(manifest);
  if (await isPublished(tag)) {
    throw new Refusal(`${tag} is already published on GitHub`);
  }
  console.log(
    `Republishing ${version} as ${tag} from ${folder}: ${manifest.artifacts.length} archive(s), nothing built`
  );
  // A draft a failed promote left under the tag is replaced (createDraft).
  await createDraft({
    channel: manifest.channel,
    commit: manifest.commit,
    notes: manifest.notes,
    version: manifest.version,
    tag,
  });
  await uploadAssets(
    tag,
    manifest.artifacts.flatMap(({ archive }) => [
      join(folder, archive),
      join(folder, `${archive}.sha256`),
    ])
  );
  await promoteRelease(tag, folder, manifest);
  console.log(`Published ${tag}`);
  await announce(manifest);
}

if (import.meta.main) {
  const argv = Bun.argv.slice(2);
  const argument = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i < 0 ? undefined : argv[i + 1];
  };
  const version = argument("--version");
  const output = argument("--output");
  if (!(version && output && isAbsolute(output))) {
    console.error(
      "Usage: bun scripts/republish.ts --version <version> --output /absolute/path"
    );
    process.exit(2);
  }
  try {
    await republish(output, version);
  } catch (error) {
    if (error instanceof Refusal) {
      console.error(`Republish refused: ${error.message}`);
      process.exit(2);
    }
    throw error;
  }
}
