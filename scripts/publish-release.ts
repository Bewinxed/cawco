/**
 * Uploads a built, signed release to GitHub Releases through the GitHub CLI the
 * publisher is already signed in with, so no token passes through this code.
 * Called only behind `release.ts --publish`; nothing else reaches it.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  NIGHTLY_TAG_PREFIX,
  RELEASE_REPOSITORY,
  releaseTag,
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

export async function publishRelease(
  directory: string,
  manifest: ReleaseManifest
): Promise<void> {
  if (manifest.testSigned) {
    throw new Error("A test-signed release cannot be published");
  }
  const tag = releaseTag(manifest);
  const files = [
    ...manifest.artifacts.flatMap((row) => [
      row.archive,
      `${row.archive}.sha256`,
    ]),
    "SHA256SUMS",
    "release.json",
    "release.json.sig",
  ].map((name) => join(directory, name));
  const scratch = await mkdtemp(join(tmpdir(), "cawco-notes-"));
  try {
    const notes = join(scratch, "notes.md");
    await writeFile(notes, manifest.notes);
    // A draft until every asset is up, so a machine never sees half a release.
    await gh([
      "release",
      "create",
      tag,
      ...files,
      "--draft",
      "--title",
      manifest.version,
      "--notes-file",
      notes,
      "--target",
      manifest.commit,
      ...(manifest.channel === "nightly" ? ["--prerelease"] : []),
    ]);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
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
