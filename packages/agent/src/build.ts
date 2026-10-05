/**
 * What this daemon was built from (NEW.md §12). The fleet is edited while it
 * runs, so a machine quietly a month behind is the normal failure — this is what
 * lets the hub say so instead of the user finding out through a protocol error.
 */

import { resolve } from "node:path";
import type { BuildInfo } from "@cawco/core";
import {
  protocolRange,
  runtimeCommit,
  runtimeVersion,
  standalone,
} from "@cawco/core/runtime";

/** The checkout this daemon runs out of — up from `packages/agent/src`. */
export const REPO_ROOT = resolve(
  Bun.fileURLToPath(new URL("../../..", import.meta.url))
);

/** When this process started, which is what "the build a machine is on" means. */
const STARTED_AT = Date.now();

/** What git said, or nothing: a checkout that is not a git one is not a failure. */
const git = async (args: string[]): Promise<string | undefined> => {
  const ran = await Bun.$`git -C ${REPO_ROOT} ${args}`.quiet().nothrow();
  return ran.exitCode === 0 ? ran.stdout.toString().trim() : undefined;
};

/**
 * Defined only in the published package's bundle (scripts/build-release.mjs),
 * where this module is `cli.js` and the package's own manifest sits beside it.
 */
declare const __CAWCO_RELEASE__: boolean | undefined;

const read = async (): Promise<BuildInfo> => {
  if (standalone) {
    return {
      version: runtimeVersion,
      commit: runtimeCommit,
      protocol: protocolRange,
      dirty: false,
      startedAt: STARTED_AT,
    };
  }
  const manifest = (await Bun.file(
    Bun.fileURLToPath(
      new URL(
        typeof __CAWCO_RELEASE__ === "boolean"
          ? "./package.json"
          : "../package.json",
        import.meta.url
      )
    )
  ).json()) as { version: string };
  const commit = await git(["rev-parse", "--short", "HEAD"]);
  const status = commit ? await git(["status", "--porcelain"]) : undefined;
  return {
    version: manifest.version,
    ...(commit ? { commit, dirty: Boolean(status) } : {}),
    startedAt: STARTED_AT,
  };
};

let reported: Promise<BuildInfo> | undefined;

/**
 * Read once and kept: a running daemon is whatever it started as, however the
 * checkout under it moves on. Learning that it moved is what an update is for.
 */
export const buildInfo = (): Promise<BuildInfo> => {
  reported ??= read();
  return reported;
};
