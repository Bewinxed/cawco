/**
 * This hub's identity: one id for as long as its database lives, whichever
 * address a machine reaches it by (its LAN address, a Tailscale name, its
 * mDNS name, a proxy). Kept in `hub-id` beside the database, so it moves
 * and is backed up with it, and minted on the first run.
 *
 * A machine records the id of the hub it joined, and its agent is the
 * machine's own (agent machine-agent.ts) when the hub it is connected to
 * has that id, not only when the address it was given matches the one it
 * joined by. `/health` says it.
 */
import { dirname, resolve } from "node:path";
import { readTextRecordSync, writeStateFileSync } from "@cawco/core/state-file";
import { DB_PATH } from "./config";

const HUB_ID_PATH = resolve(dirname(DB_PATH), "hub-id");

let id: string | undefined;
/** Whether this process minted {@link id}: no hub ran in this database's folder before it. */
let minted = false;

/** This hub's id, read once (minted and written on the first run). */
export const hubId = (): string => {
  if (id) {
    return id;
  }
  // None yet is the hub's first run in this database's folder. A damaged one
  // is said with its file: this hub's id is not guessed.
  const kept = readTextRecordSync(HUB_ID_PATH)?.trim();
  if (kept) {
    id = kept;
    return id;
  }
  const made = crypto.randomUUID();
  writeStateFileSync(HUB_ID_PATH, `${made}\n`, { mode: 0o600 });
  id = made;
  minted = true;
  return id;
};

/**
 * Whether this hub's id was kept beside the database by an earlier start:
 * false on the first start in its folder, which is also where a copy of
 * another hub's database (a `VACUUM INTO` a scratch hub boots on) starts.
 */
export const hubIdKept = (): boolean => {
  hubId();
  return !minted;
};
