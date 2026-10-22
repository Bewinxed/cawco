/**
 * Puts a release on GitHub Releases through the GitHub CLI the publisher is
 * already signed in with, so no token passes through this code, in the steps
 * release.ts runs it in: a draft as soon as the build's version is known,
 * each archive uploaded to it as soon as it is made (while the proofs still
 * run), and at promotion the signed manifest uploaded and the draft
 * published. A draft is no release to a machine (the installer reads
 * published releases alone; core binary-distribution.ts the same), so none
 * sees one before every asset and the manifest are up. Called only behind
 * `release.ts --publish`; nothing else reaches it.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  NIGHTLY_TAG_PREFIX,
  RELEASE_REPOSITORY,
} from "../packages/core/src/binary-distribution";
import type { ReleaseManifest } from "../packages/core/src/release-manifest";

/** How many nightly pre-releases are kept; older ones are deleted with their tags. */
const NIGHTLIES_KEPT = 5;

async function gh(args: string[]): Promise<string> {
  const child = Bun.spawn(["gh", ...args, "--repo", RELEASE_REPOSITORY], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(`gh ${args[0]} ${args[1]} failed: ${err.trim()}`);
  }
  return out;
}

/** What a draft is made from: the build's version, commit, channel and notes, and its tag. */
export type DraftOf = Pick<
  ReleaseManifest,
  "channel" | "commit" | "notes" | "version"
> & { tag: string };

/**
 * The release's draft, with no asset yet. A draft an earlier run of the same
 * build left (it was killed before it could remove it) is removed first; a
 * published release under the tag refuses the publish.
 */
export async function createDraft(release: DraftOf): Promise<void> {
  await deleteDraft(release.tag);
  const scratch = await mkdtemp(join(tmpdir(), "cawco-notes-"));
  try {
    const notes = join(scratch, "notes.md");
    await writeFile(notes, release.notes);
    await gh([
      "release",
      "create",
      release.tag,
      "--draft",
      "--title",
      release.version,
      "--notes-file",
      notes,
      "--target",
      release.commit,
      ...(release.channel === "nightly" ? ["--prerelease"] : []),
    ]);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

/** Files uploaded to the draft `tag`. */
export async function uploadAssets(
  tag: string,
  files: string[]
): Promise<void> {
  await gh(["release", "upload", tag, ...files, "--clobber"]);
}

/** The draft `tag` removed, when there is one; a published release is left alone. */
export async function deleteDraft(tag: string): Promise<void> {
  const viewed = await gh(["release", "view", tag, "--json", "isDraft"]).catch(
    () => undefined
  );
  if (viewed && (JSON.parse(viewed) as { isDraft: boolean }).isDraft) {
    await gh(["release", "delete", tag, "--yes"]);
  }
}

/**
 * The draft `tag` promoted: the signed manifest and the checksums from
 * `directory` uploaded, then published, the newest stable or a nightly
 * pre-release; past {@link NIGHTLIES_KEPT} nightlies the oldest go.
 */
export async function promoteRelease(
  tag: string,
  directory: string,
  manifest: ReleaseManifest
): Promise<void> {
  if (manifest.testSigned) {
    throw new Error("A test-signed release cannot be published");
  }
  await uploadAssets(
    tag,
    ["SHA256SUMS", "release.json", "release.json.sig"].map((name) =>
      join(directory, name)
    )
  );
  await gh([
    "release",
    "edit",
    tag,
    "--draft=false",
    manifest.channel === "stable" ? "--latest" : "--latest=false",
  ]);
  if (manifest.channel === "nightly") {
    const listed = JSON.parse(
      await gh([
        "release",
        "list",
        "--limit",
        "100",
        "--json",
        "tagName,isPrerelease,isDraft,createdAt",
      ])
    ) as {
      createdAt: string;
      isDraft: boolean;
      isPrerelease: boolean;
      tagName: string;
    }[];
    const old = listed
      .filter(
        (row) =>
          !row.isDraft &&
          row.isPrerelease &&
          row.tagName.startsWith(NIGHTLY_TAG_PREFIX)
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(NIGHTLIES_KEPT);
    await Promise.all(
      old.map((row) =>
        gh(["release", "delete", row.tagName, "--yes", "--cleanup-tag"])
      )
    );
  }
}
