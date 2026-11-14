/** The hub's own data on its machine: its database and what lies beside it. */

import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { darwinSocketRoot, hubDataDir } from "./roots";

/**
 * The agent's socket that answers `cawco git-credential` outside a session:
 * this machine's credential for the hub's git remote, so a checkout whose
 * `origin` is the hub pulls and pushes from a terminal. Where a deep HOME
 * cannot push it past a socket path's length: `$XDG_RUNTIME_DIR/cawco` on
 * Linux, {@link darwinSocketRoot} on macOS, else `~/.cawco`. No workspace
 * reads or connects into either.
 */
export const hubCredentialSocket = (): string => {
  const runtime = process.env.XDG_RUNTIME_DIR;
  if (process.platform === "linux" && runtime) {
    return join(runtime, "cawco", "git-credential.sock");
  }
  if (process.platform === "darwin") {
    return join(darwinSocketRoot(), "git-credential.sock");
  }
  return join(homedir(), ".cawco", "git-credential.sock");
};

/**
 * The hub's sqlite file, as an absolute path: `CAWCO_DB_PATH`, else
 * `cawco.db` in {@link hubDataDir}. The one rule every end reads it by: the
 * hub itself, the unit the CLI writes for it, the binary installer, and the
 * agent's workspace policy (its data dir denied, its projects dir's folders).
 * Everything else the hub keeps lies beside it.
 */
export const hubDbPath = (): string =>
  resolve(process.env.CAWCO_DB_PATH ?? join(hubDataDir(), "cawco.db"));

/**
 * Why the hub's last start stopped before it opened its database `db` (core
 * migrations-ahead.ts: a newer build migrated it): a sentence, written by
 * the start that stopped and removed by the next that opens it, beside the
 * database. `cawco status` says it when the hub does not answer.
 */
export const hubStoppedPath = (db: string): string => `${db}.stopped`;

/**
 * Where the hub keeps every project's folder: `projects/` beside its
 * database ({@link hubDbPath}). Only on the hub's machine does it exist.
 */
export const hubProjectsDir = (): string =>
  join(dirname(hubDbPath()), "projects");

/**
 * Where the hub keeps every area's folder (core areas.ts): `areas/` beside
 * its database, each `areas/<id>/` holding the area's `decides.md` and
 * `delegates/`. Only on the hub's machine does it exist.
 */
export const hubAreasDir = (): string => join(dirname(hubDbPath()), "areas");

/**
 * The fleet's update policy (hub binary-updates.ts): `update-policy.json`
 * beside the hub's database ({@link hubDbPath}), a file of its own, never
 * inside a cache anything trims. Only on the hub's machine does it exist.
 */
export const hubUpdatePolicyPath = (): string =>
  join(dirname(hubDbPath()), "update-policy.json");

/**
 * `cawco pairing off`'s request to a running hub (cli pairing.ts, hub
 * pairing-requests.ts): an empty file beside the hub's database, the user's
 * own (0600), named for the request's id. The hub takes it, turns paired
 * devices off on its own connection, and answers in
 * {@link pairingOffAnswerPath}: while the hub runs, only it writes its
 * database.
 */
export const pairingOffRequestPath = (db: string, id: string): string =>
  join(dirname(db), `pairing-off.${id}.request`);

/** The hub's answer to the request named `id` ({@link PairingOffAnswer}). */
export const pairingOffAnswerPath = (db: string, id: string): string =>
  join(dirname(db), `pairing-off.${id}.answer`);

/** A request's file name; its one group is the request's id. */
export const PAIRING_OFF_REQUEST = /^pairing-off\.([0-9a-f-]{36})\.request$/u;

/** An answer's file name, which a hub at its start clears. */
export const PAIRING_OFF_ANSWER = /^pairing-off\.[0-9a-f-]{36}\.answer$/u;

/** What the hub answers a pairing-off request: done, or why not. */
export type PairingOffAnswer = { ok: true } | { error: string };
