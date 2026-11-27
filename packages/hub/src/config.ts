import { dirname, resolve } from "node:path";
import { CAWCO_ENV, type CawcoEnvVar, readEnv } from "@cawco/core/cawco-env";
import { hubDbPath } from "@cawco/core/paths/hub";
import {
  CAWCO_HUB_PORT,
  localDashboardPort,
  mcpGatewayPort,
} from "@cawco/core/ports";
import { runtimeVersion, standalone } from "@cawco/core/runtime";
import { FEEDBACK_REPO } from "@cawco/core/usability-feedback";

/** Reported by `GET /health`; keep in sync with package.json. */
export const HUB_VERSION = standalone ? runtimeVersion : "0.1.0";

export const HUB_PORT = Number(readEnv(CAWCO_ENV.hubPort) ?? CAWCO_HUB_PORT);

/** Whether the hub writes its debug lines (`CAWCO_DEBUG=1`). */
export const HUB_DEBUG = readEnv(CAWCO_ENV.debug) === "1";

/** Where usability feedback is filed (core cawco-env.ts `feedbackRepo`). */
export const FEEDBACK_REPO_AT =
  readEnv(CAWCO_ENV.feedbackRepo)?.trim() || FEEDBACK_REPO;

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
 * A project file's budget, in characters: what one brief carries of a file
 * its task names (memory.ts `contextFor`), and the most AGENTS.md holds
 * (memory-lessons.ts).
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
