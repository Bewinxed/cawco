/**
 * `cawco pairing off`: the way back when no paired device is left to turn
 * "Require paired devices" off (every paired browser lost its cookie, and
 * the app is signed out). Run on the hub's own machine, as the user the
 * hub runs as. It forgets every paired device and machine key, as the
 * dashboard's switch does (hub db/hub-auth.ts `setPairingRequired`), and the
 * hub trusts its network again at once.
 *
 * While the hub runs, only the hub writes its database (hub db/wal.ts): the
 * command leaves a request beside the database (core paths.ts
 * `pairingOffRequestPath`, a 0600 file of the user's own) and waits for the
 * hub's answer (hub pairing-requests.ts). With no hub running, it takes the
 * hub's lock (core db-lock.ts), as the update helper's restore does, and
 * writes the setting itself.
 *
 * That user can already open the database (hub-auth audit §3.4): this adds
 * no reach a session on the hub's machine does not have, and a workspace
 * boundary hides the database's folder from every boundaried session.
 */

import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { configurePage } from "@cawco/core";
import {
  DatabaseHeld,
  databaseHolder,
  lockDatabase,
  releaseDatabase,
} from "@cawco/core/db-lock";
import {
  hubDbPath,
  type PairingOffAnswer,
  pairingOffAnswerPath,
  pairingOffRequestPath,
} from "@cawco/core/paths";

/** Thrown when there is no hub here to change: a sentence for the person. */
export class PairingError extends Error {}

/** How long the running hub has to answer: it answers in milliseconds, so past this it is stuck. */
const ANSWER_WITHIN_MS = 30_000;
/** How often the answer, and the hub's life, are looked at. */
const LOOK_EVERY_MS = 100;

/** The setting written by this process, the hub stopped and held off by its lock. */
const writeDirectly = (path: string): void => {
  const db = new Database(path);
  try {
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
    }).immediate();
  } finally {
    db.close();
  }
};

/**
 * The running hub asked, and its answer: `done`, or `gone` when the hub
 * ended before it answered (the request taken back, so the command writes
 * the setting itself). An answer of failure, or none in time, throws.
 */
const askHub = async (path: string, pid: number | undefined) => {
  const id = crypto.randomUUID();
  const request = pairingOffRequestPath(path, id);
  const answer = pairingOffAnswerPath(path, id);
  await writeFile(request, "", { mode: 0o600, flag: "wx" });
  const end = Date.now() + ANSWER_WITHIN_MS;
  try {
    for (;;) {
      const said = await readFile(answer, "utf8").catch(() => undefined);
      if (said !== undefined) {
        await rm(answer, { force: true });
        const answered = JSON.parse(said) as PairingOffAnswer;
        if ("error" in answered) {
          throw new PairingError(
            `the hub in process ${pid} could not turn paired devices off: ${answered.error}`
          );
        }
        return "done";
      }
      if ((await databaseHolder(path)) === undefined) {
        return "gone";
      }
      if (Date.now() > end) {
        throw new PairingError(
          `the hub in process ${pid} did not answer within ${ANSWER_WITHIN_MS / 1000}s: restart it and run this again.`
        );
      }
      await Bun.sleep(LOOK_EVERY_MS);
    }
  } finally {
    await rm(request, { force: true });
  }
};

export const pairingOff = async (): Promise<number> => {
  const path = hubDbPath();
  if (!existsSync(path)) {
    throw new PairingError(
      `no hub database at ${path}: run this on the hub's own machine, as the user the hub runs as (or set CAWCO_DB_PATH to its database).`
    );
  }
  for (;;) {
    try {
      await lockDatabase(path);
    } catch (error) {
      if (!(error instanceof DatabaseHeld)) {
        throw error;
      }
      if ((await askHub(path, error.pid)) === "done") {
        break;
      }
      continue;
    }
    try {
      writeDirectly(path);
    } finally {
      await releaseDatabase(path);
    }
    break;
  }
  console.log(
    `Paired devices are no longer required: every device on your network reaches the fleet again, and the paired devices and machine keys are forgotten. Turn it on again in ${configurePage("devices")}.`
  );
  return 0;
};
