import { dirname, resolve } from "node:path";
import {
  CAWCO_ENV,
  CAWCO_HUB_PORT,
  type CawcoEnvVar,
  localDashboardPort,
  mcpGatewayPort,
  readEnv,
} from "@cawco/core";
import { hubDbPath } from "@cawco/core/paths";
import { runtimeVersion, standalone } from "@cawco/core/runtime";

/** Reported by `GET /health`; keep in sync with package.json. */
export const HUB_VERSION = standalone ? runtimeVersion : "0.1.0";

export const HUB_PORT = Number(readEnv(CAWCO_ENV.hubPort) ?? CAWCO_HUB_PORT);

/** Whether the hub writes its debug lines (`CAWCO_DEBUG=1`). */
export const HUB_DEBUG = readEnv(CAWCO_ENV.debug) === "1";

/** The address the hub and its preview listeners bind (`HOST`): every interface unless set. */
export const BIND_HOST = process.env.HOST ?? "0.0.0.0";

const PORT_RANGE = /^(\d+)-(\d+)$/u;

/**
 * The ports preview listeners take (`CAWCO_PREVIEW_PORTS`, `first-last`):
 * by default the hundred after the hub's own. A value that is not a range
 * of ports stops the hub at start, in so many words.
 */
export const PREVIEW_PORTS = (() => {
  const raw = readEnv(CAWCO_ENV.previewPorts);
  if (!raw) {
    return { first: HUB_PORT + 1, last: HUB_PORT + 100 };
  }
  const [, first, last] = raw.trim().match(PORT_RANGE) ?? [];
  const range = { first: Number(first), last: Number(last) };
  if (
    !(first && last) ||
    range.first < 1 ||
    range.last > 65_535 ||
    range.first > range.last
  ) {
    throw new Error(
      `${CAWCO_ENV.previewPorts} is "${raw}": it takes a range of ports, like 3457-3556.`
    );
  }
  return range;
})();

/** The range as the person reads it: `3457–3556`. */
export const PREVIEW_PORTS_TEXT = `${PREVIEW_PORTS.first}–${PREVIEW_PORTS.last}`;

/**
 * The dashboard's port on every computer's loopback (core
 * `localDashboardPort`, 3455): every agent serves it on its own, carried
 * to {@link DASHBOARD_PORT} here.
 */
export const LOCAL_DASHBOARD_PORT = localDashboardPort();

/**
 * The port the dashboard is served on on this machine: its loopback port
 * ({@link LOCAL_DASHBOARD_PORT}), where the installer's sockets listen (cli
 * service.ts `dashboardAddress`), unless `CAWCO_DASHBOARD_PORT` names
 * another (a scratch fleet's). A value that is not a port stops the hub at
 * start.
 */
export const DASHBOARD_PORT = (() => {
  const raw = readEnv(CAWCO_ENV.dashboardPort);
  if (raw === undefined) {
    return LOCAL_DASHBOARD_PORT;
  }
  const port = Number(raw);
  if (!(Number.isInteger(port) && port > 0 && port < 65_536)) {
    throw new Error(
      `${CAWCO_ENV.dashboardPort} must be a port number, not "${raw}"`
    );
  }
  return port;
})();

/**
 * The fleet's own listeners on the hub's machine, each in the words a moved
 * preview's line says it with: no session's preview ever takes one of these
 * ports, even while its listener is down (a restart, a socket being
 * reinstalled). The agent's MCP gateway is read from the setting the agent
 * serves it on (core `mcpGatewayPort`).
 */
export const FLEET_PORTS: ReadonlyMap<number, string> = new Map([
  [mcpGatewayPort(), "the MCP gateway's"],
  // The two are one port on an installed hub, which reads as the dashboard's.
  [LOCAL_DASHBOARD_PORT, "the dashboard's loopback"],
  [DASHBOARD_PORT, "the dashboard's"],
  [HUB_PORT, "the hub's"],
]);

/**
 * How long a spawn the hub waits on (a continuation's sessions, a
 * `start_session`) is given to be in place. A cold harness (opencode starting
 * its server, claude its CLI) takes seconds; past this the machine is not
 * going to answer.
 */
export const SPAWN_START_TIMEOUT_MS = 120_000;

/**
 * Where the hub's sqlite file lives: core's one rule (`hubDbPath`), the
 * same whether the CLI's unit started the hub or `bun run hub` did.
 */
export const DB_PATH = hubDbPath();

/** The hub as a git remote (git-remote.ts): each project's bare repository, beside the database. */
export const GIT_ROOT = resolve(dirname(DB_PATH), "git");

/** The hub's LFS store: each large file once, by sha256. */
export const LFS_ROOT = resolve(dirname(DB_PATH), "lfs");

/** Each page artifact's built files, `artifacts/<id>/index.html`, served by the preview listener. */
export const ARTIFACTS_ROOT = resolve(dirname(DB_PATH), "artifacts");

/**
 * The server-wide body cap (Bun's `maxRequestBodySize`), which only the git
 * remote's routes reach: a pack pushed to it or a large file to its LFS store
 * streams through, and Bun's own default (128 MiB) would refuse both. Every
 * other route is held to its own, smaller cap first (body-limits.ts).
 */
export const MAX_REQUEST_BYTES = 64 * 1024 ** 3;

/** A whole number from `name`, at least `least`; unset, `fallback`; anything else stops the hub at start, in so many words. */
const wholeFrom = (
  name: CawcoEnvVar,
  fallback: number,
  least: number
): number => {
  const raw = readEnv(name);
  if (raw === undefined) {
    return fallback;
  }
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < least) {
    throw new Error(
      `${name} is "${raw}": it takes a whole number, ${least} or more.`
    );
  }
  return value;
};

/**
 * Days a project's fact line may go unused (no brief carried it, no note
 * corroborated it) before a curator run proposes moving it to
 * `knowledge/archive/` (memory.ts). The default is the replay's pick
 * (the memory-replay probe, 2026-10-18, cut on 2026-10-26): over the 974
 * bullet lines this repository's curated docs held since 2025-12-31, a use
 * being a commit that shares three words with a line, 30 days archives 54
 * lines of which 16 were needed again, 45 days 38 (6), 60 days 29 (3), and
 * 60, 90 and 180 days the same 29 (3): the cost is at its floor from 60 on.
 * The owner's rule is "fold first; archive a fact only after long disuse",
 * so the default sits on that floor with room: 90.
 */
export const MEMORY_ARCHIVE_DAYS = wholeFrom(
  CAWCO_ENV.memoryArchiveDays,
  90,
  1
);

/**
 * A knowledge file's budget, in characters: what one brief carries of it,
 * and the size past which a curator run is asked to fold it (memory.ts).
 * The default is the replay's pick (the memory-replay probe, cut on 2026-10-26,
 * 2026-10-18, 24 topic files): 8,000 and 12,000 fold the same 5 files, the
 * ones past either; 6,000 adds three that sit just over it (6.4k to 6.9k);
 * 8,000 is also what a brief carried of a file before.
 */
export const MEMORY_FILE_CHARS = wholeFrom(
  CAWCO_ENV.memoryFileChars,
  8000,
  500
);
