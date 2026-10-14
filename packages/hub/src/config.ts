import { dirname, resolve } from "node:path";
import { CAWCO_ENV, CAWCO_HUB_PORT, readEnv } from "@cawco/core";
import { runtimeVersion, standalone } from "@cawco/core/runtime";

/** Reported by `GET /health`; keep in sync with package.json. */
export const HUB_VERSION = standalone ? runtimeVersion : "0.1.0";

export const HUB_PORT = Number(readEnv(CAWCO_ENV.hubPort) ?? CAWCO_HUB_PORT);

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

/** Each page artifact's built files, `artifacts/<id>/index.html`, served by the preview listener. */
export const ARTIFACTS_ROOT = resolve(dirname(DB_PATH), "artifacts");

/**
 * The server-wide body cap (Bun's `maxRequestBodySize`), which only the git
 * remote's routes reach: a pack pushed to it or a large file to its LFS store
 * streams through, and Bun's own default (128 MiB) would refuse both. Every
 * other route is held to its own, smaller cap first (body-limits.ts).
 */
export const MAX_REQUEST_BYTES = 64 * 1024 ** 3;
