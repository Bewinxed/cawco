/** CawCo's own config and data on this machine, outside any one feature. */

import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { sessiondEndpoint } from "../sessiond";

/** The agent's transcript search index. */
export const transcriptIndexPath = (): string =>
  join(
    process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
    "cawco",
    "transcript-index.db"
  );

/** Private host-side material, beneath the directory Linux boundaries already mask. */
export const sessionIdentityDir = (): string =>
  join(
    dirname(process.env.CAWCO_SESSIOND_ENDPOINT ?? sessiondEndpoint()),
    "session-identity"
  );

export const xdgConfigHome = (): string =>
  process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
export const xdgDataHome = (): string =>
  process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");

/** CawCo's config dir: the CLI's `config.json`, the hub's env file, the release signing key. */
export const cawcoConfigDir = (): string => join(xdgConfigHome(), "cawco");

/** CawCo's data dir: the binary install, its runtime trees, the transcript index; on Linux the hub's database too. */
export const cawcoDataDir = (): string => join(xdgDataHome(), "cawco");

/**
 * Each live Claude session's scheduled wake-ups as its last turn ended, one
 * file per session named by its instance id, kept for as long as its
 * process runs (agent `wakeups.ts`).
 */
export const sessionWakeupsDir = (): string =>
  join(cawcoDataDir(), "session-wakeups");

/**
 * The sends each session has taken, one file per session named by its
 * instance id, kept until the session is stopped (agent `taken-sends.ts`).
 */
export const sessionTakenDir = (): string =>
  join(cawcoDataDir(), "session-taken");

/**
 * This machine's Claude Code version as its last `claude --version` answered,
 * with the binary it was read from (agent `claude-version.ts`), so an agent's
 * restart, which every update is, starts knowing it.
 */
export const claudeVersionPath = (): string =>
  join(cawcoDataDir(), "claude-version.json");

/**
 * The stages that answered as the agent last ended (agent stage.ts
 * `carryStages`), which the next agent starts again at their ports
 * (`resumeStages`): an agent's restart, which every update is, leaves each
 * stage serving as it was.
 */
export const stagesCarriedPath = (): string =>
  join(cawcoDataDir(), "stages-carried.json");

/**
 * The env file `scripts/release.ts` loads the release signing key from
 * (`CAWCO_RELEASE_SIGNING_KEY`), with Bun's `--env-file`: inside the config
 * dir, so no workspace reads it.
 */
export const releaseEnvPath = (): string =>
  join(cawcoConfigDir(), "release.env");
