/**
 * What a running process was built from (NEW.md §12): its version, commit,
 * whether the checkout was dirty, the protocol range it speaks and when it
 * started. The daemon and the hub each report it, so a machine that is
 * behind can be told apart from a hub that is. A standalone binary carries
 * its build's own; a checkout is asked through git.
 */

import { resolve } from "node:path";
import type { BuildInfo } from "./index";
import {
  protocolRange,
  runtimeCommit,
  runtimeVersion,
  standalone,
} from "./runtime";
import { SAFE_GIT_ENV, SAFE_GIT_FLAGS } from "./safe-git";
import { hostEnvironment } from "./session-env";

/** The checkout this process runs out of — up from `packages/core/src`. */
const REPO_ROOT = resolve(
  Bun.fileURLToPath(new URL("../../..", import.meta.url))
);

/** When this process started, which is what "the build it is on" means. */
const STARTED_AT = Date.now();

/** What git said, or nothing: a checkout that is not a git one is not a failure. */
const git = async (args: string[]): Promise<string | undefined> => {
  const ran = await Bun.$`git ${SAFE_GIT_FLAGS} -C ${REPO_ROOT} ${args}`
    .env({ ...hostEnvironment(), ...SAFE_GIT_ENV })
    .quiet()
    .nothrow();
  return ran.exitCode === 0 ? ran.stdout.toString().trim() : undefined;
};

/** This process's build; `checkoutVersion` is its package's version, read only when it runs out of a checkout. */
export const readBuildInfo = async (
  checkoutVersion: () => Promise<string>
): Promise<BuildInfo> => {
  if (standalone) {
    return {
      version: runtimeVersion,
      commit: runtimeCommit,
      protocol: protocolRange,
      dirty: false,
      startedAt: STARTED_AT,
    };
  }
  const version = await checkoutVersion();
  const commit = await git(["rev-parse", "--short", "HEAD"]);
  const status = commit ? await git(["status", "--porcelain"]) : undefined;
  return {
    version,
    ...(commit ? { commit, dirty: Boolean(status) } : {}),
    protocol: protocolRange,
    startedAt: STARTED_AT,
  };
};
