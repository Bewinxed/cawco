import { createPublicKey } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { releaseTag } from "../../../packages/core/src/binary-distribution";
import {
  type ReleaseManifest,
  signManifest,
  verifyManifest,
} from "../../../packages/core/src/release-manifest";
import { TARGETS } from "../../build-binary";
import { promoteRelease } from "../../publish-release";
import { signingPem } from "../../release-signing";
import {
  alone,
  failedEvidence,
  type ReleaseSecretsTaken,
  type Request,
  type StepContext,
} from "./shared";

/**
 * How many promoted builds `--output` keeps, newest first ({@link pruneOutputs}).
 * Nothing in CawCo reads them: a machine runs and rolls back from its own
 * binary root's `versions/` (core binary-wrapper.ts), and the hub serves and
 * offers each build from the release host (hub binary-updates.ts
 * `assetBase`). They are for a person on this host: the build just made, and
 * the one it replaced, to compare or upload again by hand when the newest has
 * to be pulled. A build whose publish failed is left here too, never reaching
 * the prune, for `ship.sh --republish <version>` (republish.ts) to publish
 * without building it again. Unbounded, 75 nightlies of about 3 GB each filled the hub
 * machine's disk on 2026-10-26.
 */
const KEPT_OUTPUTS = 2;

/**
 * Every target built: the manifest signed, the
 * build moved into `--output`, and with `--publish` the draft promoted. A
 * finished build is promoted even when a newer commit was queued while it was
 * built: that one is built next (the loop at the end of this file).
 */
export const promote = async (
  current: Request,
  publish: boolean,
  staging: string,
  manifest: ReleaseManifest,
  secrets: ReleaseSecretsTaken,
  notStopped: () => Promise<void>
): Promise<void> => {
  manifest.artifacts.sort(
    (a, b) =>
      TARGETS.indexOf(a.target as (typeof TARGETS)[number]) -
      TARGETS.indexOf(b.target as (typeof TARGETS)[number])
  );
  await writeFile(
    join(staging, "SHA256SUMS"),
    manifest.artifacts.map((a) => `${a.sha256}  ${a.archive}\n`).join("")
  );
  const privatePem = signingPem(secrets.manifestKey);
  const { text: manifestText, signature } = signManifest(manifest, privatePem);
  verifyManifest(
    manifestText,
    signature,
    createPublicKey(privatePem)
      .export({ type: "spki", format: "pem" })
      .toString()
  );
  // The installer reads the version off the front of the signed text.
  if (!manifestText.startsWith(`{"version":"${manifest.version}",`)) {
    throw new Error("The manifest must begin with its version");
  }
  await writeFile(join(staging, "release.json"), manifestText);
  await writeFile(join(staging, "release.json.sig"), `${signature}\n`);
  // Not artifacts: the Info.plist the bundles were laid out with, and the
  // Apple secrets' files, which never leave the staging.
  await Promise.all(
    ["agent-bundle", "apple"].map((name) =>
      rm(join(staging, name), { recursive: true, force: true })
    )
  );
  await mkdir(current.output, { recursive: true });
  const published = join(current.output, manifest.version);
  await rm(published, { recursive: true, force: true });
  await rename(staging, published);
  await writeFile(join(current.output, "release.json"), manifestText);
  console.log(`Local artifacts ready: ${published}`);
  if (publish) {
    await notStopped();
    await promoteRelease(releaseTag(manifest), published, manifest);
  }
  await pruneOutputs(current.output, published);
};

/**
 * `--output` cut to its newest {@link KEPT_OUTPUTS} builds by time (each a
 * folder holding its `release.json`; nothing else there is touched), `kept`
 * (the one just promoted) always among them, and the release cache cleared of
 * the `out-<sha>` folders an earlier ship.sh wrote, which nothing reads.
 */
const pruneOutputs = async (folder: string, kept: string): Promise<void> => {
  const builds = await Promise.all(
    (await readdir(folder, { withFileTypes: true }))
      .filter(
        (entry) =>
          entry.isDirectory() &&
          existsSync(join(folder, entry.name, "release.json"))
      )
      .map(async ({ name }) => {
        const path = join(folder, name);
        return { path, time: (await stat(path)).mtimeMs };
      })
  );
  builds.sort(
    (a, b) =>
      Number(b.path === kept) - Number(a.path === kept) || b.time - a.time
  );
  const legacy = (await readdir(failedEvidence))
    .filter((name) => name.startsWith("out-"))
    .map((name) => join(failedEvidence, name));
  const gone = [
    ...builds.slice(KEPT_OUTPUTS).map(({ path }) => path),
    ...legacy,
  ];
  await Promise.all(
    gone.map((path) => rm(path, { recursive: true, force: true }))
  );
  if (gone.length > 0) {
    console.log(
      `Removed ${gone.length} older release folder(s), keeping the newest ${KEPT_OUTPUTS} in ${folder}`
    );
  }
};

/** The promote step, as the graph calls it. */
export const promoteStep = ({
  current,
  publish,
  staging,
  manifest,
  secrets,
  notStopped,
}: StepContext): Promise<void> =>
  promote(current, publish, staging, manifest(), secrets, notStopped);

await alone(
  import.meta,
  "bun scripts/release/steps/promote.ts --commit SHA --output /abs/path [--publish] [--staging DIR] [--manifest FILE]\n  Every target built: signs the manifest, moves the staging into --output, with --publish promotes the draft, and prunes older builds.",
  promoteStep,
  { secrets: true }
);
