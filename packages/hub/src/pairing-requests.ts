/**
 * `cawco pairing off` while the hub runs (cli pairing.ts): the command leaves
 * a request beside the hub's database (core paths.ts `pairingOffRequestPath`,
 * the user's own 0600 file, the same reach as the database itself), and the
 * hub turns paired devices off on its own connection and answers. While the
 * hub runs, only it writes its database (db/wal.ts); a stopped hub's
 * database the command writes itself, under the hub's lock.
 *
 * The folder is watched, and read once as the watch starts: a request left
 * while no hub ran is taken then. A request is taken by removing it, so two
 * looks at the folder take it once. Answers a command never read are cleared
 * as the watch starts.
 */
import { readdirSync, rmSync, unlinkSync, watch } from "node:fs";
import { dirname, join } from "node:path";
import {
  PAIRING_OFF_ANSWER,
  PAIRING_OFF_REQUEST,
  type PairingOffAnswer,
  pairingOffAnswerPath,
} from "@cawco/core/paths";
import { writeStateFileSync } from "@cawco/core/state-file";
import type { HubLifetimeShape } from "./lifetime";

/** The request at `path` taken: true when this look removed it, false when another already had. */
const taken = (path: string): boolean => {
  try {
    unlinkSync(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

/**
 * Watches the folder of `dbPath` for pairing-off requests until `lifetime`
 * closes; each one runs `pairingOff` and is answered.
 */
export const watchPairingRequests = (
  dbPath: string,
  pairingOff: () => void,
  lifetime: HubLifetimeShape
): void => {
  const dir = dirname(dbPath);
  for (const name of readdirSync(dir)) {
    if (PAIRING_OFF_ANSWER.test(name)) {
      rmSync(join(dir, name), { force: true });
    }
  }
  const look = (): void => {
    for (const name of readdirSync(dir)) {
      const id = PAIRING_OFF_REQUEST.exec(name)?.[1];
      if (!(id && taken(join(dir, name)))) {
        continue;
      }
      let answer: PairingOffAnswer;
      try {
        pairingOff();
        answer = { ok: true };
        console.log("[hub-auth] cawco pairing off: done");
      } catch (error) {
        answer = {
          error: error instanceof Error ? error.message : String(error),
        };
        console.error(`[hub-auth] cawco pairing off failed: ${answer.error}`);
      }
      writeStateFileSync(
        pairingOffAnswerPath(dbPath, id),
        JSON.stringify(answer),
        { mode: 0o600 }
      );
    }
  };
  // A look that throws (the folder unreadable, an answer unwritable) is said,
  // and the hub goes on: the command waiting on it says it had no answer.
  const lookSaid = (): void => {
    try {
      look();
    } catch (error) {
      console.error(
        `[hub-auth] reading cawco pairing off's requests in ${dir} failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };
  const watcher = watch(dir, lookSaid);
  watcher.unref();
  lifetime.onClose(() => watcher.close());
  lookSaid();
};
