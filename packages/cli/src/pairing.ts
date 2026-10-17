/**
 * `cawco pairing off`: the way back when no paired device is left to turn
 * "Require paired devices" off (every paired browser lost its cookie, and
 * the app is signed out). Run on the hub's own machine, as the user the
 * hub runs as: it writes the setting into the hub's database directly, as
 * the dashboard's switch does (hub db/hub-auth.ts `setPairingRequired`),
 * forgetting every paired device and machine key. The hub reads the setting
 * on every request, so it trusts its network again at once.
 *
 * That user can already open the database (hub-auth audit §3.4): this adds
 * no reach a session on the hub's machine does not have, and a workspace
 * boundary hides the database's folder from every boundaried session.
 */

import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { hubDbPath } from "@cawco/core/paths";

/** Thrown when there is no hub here to change: a sentence for the person. */
export class PairingError extends Error {}

export const pairingOff = (): number => {
  const path = hubDbPath();
  if (!existsSync(path)) {
    throw new PairingError(
      `no hub database at ${path}: run this on the hub's own machine, as the user the hub runs as (or set CAWCO_DB_PATH to its database).`
    );
  }
  const db = new Database(path);
  try {
    db.exec("PRAGMA busy_timeout = 15000");
    const table = db
      .query(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pairing_settings'"
      )
      .get();
    if (!table) {
      throw new PairingError(
        `the hub at ${path} has no pairing setting yet: start the hub once on this build, then run this again.`
      );
    }
    db.transaction(() => {
      db.query(
        "INSERT INTO pairing_settings (id, required, changed_at) VALUES ('pairing', 0, ?) ON CONFLICT(id) DO UPDATE SET required = 0, changed_at = excluded.changed_at"
      ).run(Date.now());
      db.query("DELETE FROM owner_devices").run();
      db.query("DELETE FROM machine_keys").run();
    })();
  } finally {
    db.close();
  }
  console.log(
    "Paired devices are no longer required: every device on your network reaches the fleet again, and the paired devices and machine keys are forgotten. Turn it on again in Configure › Devices."
  );
  return 0;
};
