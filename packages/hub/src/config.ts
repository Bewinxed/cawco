import { readEnv, WHIFFLE_ENV, WHIFFLE_HUB_PORT } from "@whiffle/core";

/** Reported by `GET /health`; keep in sync with package.json. */
export const HUB_VERSION = "0.1.0";

export const HUB_PORT = Number(
  readEnv(WHIFFLE_ENV.hubPort) ?? WHIFFLE_HUB_PORT
);

export const PREVIEW_PORT =
  Number(readEnv(WHIFFLE_ENV.previewPort)) || HUB_PORT + 1;

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
export const DB_PATH = readEnv(WHIFFLE_ENV.dbPath) ?? "./whiffle.db";
