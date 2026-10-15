import { dirname, resolve } from "node:path";
import {
  CAWCO_ENV,
  CAWCO_HUB_PORT,
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

const PORT_RANGE = /^(\d+)-(\d+)$/;

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
 * The port the dashboard is served on (`CAWCO_DASHBOARD_PORT`): the
 * installer writes the dashboard socket's own port into the hub's unit (cli
 * service.ts `DASHBOARD_PORT`), and 3000 is its default there too. A value
 * that is not a port stops the hub at start.
 */
export const DASHBOARD_PORT = (() => {
  const raw = readEnv(CAWCO_ENV.dashboardPort) ?? "3000";
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
