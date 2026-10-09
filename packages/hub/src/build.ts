/**
 * What this hub was built from (NEW.md §12) — the same three facts a daemon
 * reports about itself, so a machine that is behind can be told apart from a hub
 * that is. Read here rather than shared with the agent: the hub does not depend
 * on the daemon, and this is thirty lines of git.
 */

import { resolve } from "node:path";
import type { BuildInfo } from "@cawco/core";
import {
  protocolRange,
  runtimeCommit,
  runtimeVersion,
  standalone,
} from "@cawco/core/runtime";
import { SAFE_GIT_ENV, SAFE_GIT_FLAGS } from "@cawco/core/safe-git";
import { HUB_VERSION } from "./config";

/** The checkout this hub runs out of — up from `packages/hub/src`. */
const REPO_ROOT = resolve(
  Bun.fileURLToPath(new URL("../../..", import.meta.url))
);

/** When this process started, which is what "the build a hub is on" means. */
const STARTED_AT = Date.now();

/** What git said, or nothing: a checkout that is not a git one is not a failure. */
const git = async (args: string[]): Promise<string | undefined> => {
  const ran = await Bun.$`git ${SAFE_GIT_FLAGS} -C ${REPO_ROOT} ${args}`
    .env({ ...process.env, ...SAFE_GIT_ENV })
    .quiet()
    .nothrow();
  return ran.exitCode === 0 ? ran.stdout.toString().trim() : undefined;
};

/** Read once, at boot, before the hub serves: a running hub is whatever it started as. */
export const buildInfo = async (): Promise<BuildInfo> => {
  if (standalone) {
    return {
      version: runtimeVersion,
      commit: runtimeCommit,
      protocol: protocolRange,
      dirty: false,
      startedAt: STARTED_AT,
    };
  }
  const commit = await git(["rev-parse", "--short", "HEAD"]);
  const status = commit ? await git(["status", "--porcelain"]) : undefined;
  return {
    version: HUB_VERSION,
    ...(commit ? { commit, dirty: Boolean(status) } : {}),
    startedAt: STARTED_AT,
  };
};
