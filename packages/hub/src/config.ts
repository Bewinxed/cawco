import { dirname, resolve } from "node:path";
import { CAWCO_ENV, CAWCO_HUB_PORT, readEnv } from "@cawco/core";
import { runtimeVersion, standalone } from "@cawco/core/runtime";

/** Reported by `GET /health`; keep in sync with package.json. */
export const HUB_VERSION = standalone ? runtimeVersion : "0.1.0";

export const HUB_PORT = Number(readEnv(CAWCO_ENV.hubPort) ?? CAWCO_HUB_PORT);

export const PREVIEW_PORT =
  Number(readEnv(CAWCO_ENV.previewPort)) || HUB_PORT + 1;

/**
 * How long a spawn the hub waits on (a continuation's sessions, a
 * `start_session`) is given to be in place. A cold harness (opencode starting
 * its server, claude its CLI) takes seconds; past this the machine is not
 * going to answer.
 */
export const SPAWN_START_TIMEOUT_MS = 120_000;

/**
 * Where the hub's sqlite file lives. The production path comes from the CLI
 * through the environment; the relative default is the bare `bun run hub` case.
 */
export const DB_PATH = readEnv(CAWCO_ENV.dbPath) ?? "./cawco.db";

/** The hub as a git remote (git-remote.ts): each project's bare repository, beside the database. */
export const GIT_ROOT = resolve(dirname(DB_PATH), "git");

/** The hub's LFS store: each large file once, by sha256. */
export const LFS_ROOT = resolve(dirname(DB_PATH), "lfs");

/**
 * The server-wide body cap (Bun's `maxRequestBodySize`), which only the git
 * remote's routes reach: a pack pushed to it or a large file to its LFS store
 * streams through, and Bun's own default (128 MiB) would refuse both. Every
 * other route is held to its own, smaller cap first (body-limits.ts).
 */
export const MAX_REQUEST_BYTES = 64 * 1024 ** 3;
