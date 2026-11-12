import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReleaseManifest } from "../../../packages/core/src/release-manifest";
import { SESSIOND_V1 } from "../../../packages/core/src/sessiond";
import type { Runner } from "../binary-tests";
import { alone, type Request, type StepContext } from "./shared";

/** The version a build carries and its manifest so far: no protocol (build-info says it) and no artifact yet. */
export const manifestOf = async (
  run: Runner,
  current: Request,
  checkout: string
): Promise<ReleaseManifest> => {
  const base = (
    await Bun.file(join(checkout, "packages/cli/package.json")).json()
  ).version as string;
  // Only grows: no path installs a build whose sequence is not above the running one.
  const sequence = Number(
    await run(
      ["git", "rev-list", "--first-parent", "--count", current.commit],
      checkout,
      true
    )
  );
  let version: string;
  let notes: string;
  if (current.channel === "stable") {
    if (
      current.tag !== `v${base}` ||
      (await run(
        ["git", "rev-parse", `${current.tag}^{commit}`],
        checkout,
        true
      )) !== current.commit
    ) {
      throw new Error(
        "Stable builds require a matching vX.Y.Z tag at the input commit"
      );
    }
    notes = await readFile(
      join(checkout, "docs/releases", `${base}.md`),
      "utf8"
    );
    if (!notes.trim()) {
      throw new Error("Stable end-user release notes are empty");
    }
    version = base;
  } else {
    const { notes: given } = current;
    if (!given?.trim()) {
      throw new Error("Nightly builds need end-user notes: --notes <file>");
    }
    notes = given;
    version = `${base}-nightly.${sequence}+${current.commit.slice(0, 12)}`;
  }
  return {
    version,
    commit: current.commit,
    channel: current.channel,
    sequence,
    // How many database migrations this build carries; never installed over a newer database.
    schemaVersion: (
      (await Bun.file(
        join(checkout, "packages/hub/drizzle/meta/_journal.json")
      ).json()) as { entries: unknown[] }
    ).entries.length,
    protocol: { min: 0, max: 0 },
    sessiondProtocol: SESSIOND_V1,
    notes,
    testSigned: false,
    artifacts: [],
  };
};

/** The version step: the manifest the later steps read. */
export const version = async ({
  run,
  current,
  trees,
  learned,
}: StepContext): Promise<void> => {
  learned.manifest = await manifestOf(run, current, trees.build);
};

await alone(
  import.meta,
  "bun scripts/release/steps/version.ts --commit SHA --channel stable|nightly [--notes FILE (nightly)] [--tag vX.Y.Z] [--checkout DIR] [--staging DIR]\n  Works out the version and writes the manifest so far to <staging>/manifest.json.",
  version,
  { keepsManifest: true }
);
